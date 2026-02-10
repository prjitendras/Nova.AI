"""Workflow Repository - Data access for workflows and versions"""
from typing import Any, Dict, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo import DESCENDING
from pydantic import ValidationError

from .mongo_client import get_collection
from ..domain.models import WorkflowTemplate, WorkflowVersion, WorkflowDefinition
from ..domain.enums import WorkflowStatus
from ..domain.errors import WorkflowNotFoundError, ConcurrencyError, AlreadyExistsError
from ..utils.logger import get_logger

logger = get_logger(__name__)


class WorkflowRepository:
    """Repository for workflow operations"""
    
    def __init__(self):
        self._workflows: Collection = get_collection("workflows")
        self._versions: Collection = get_collection("workflow_versions")
    
    # =========================================================================
    # Workflow Template CRUD
    # =========================================================================
    
    def create_workflow(self, workflow: WorkflowTemplate) -> WorkflowTemplate:
        """Create a new workflow template"""
        doc = workflow.model_dump(mode="json")
        doc["_id"] = workflow.workflow_id
        
        try:
            self._workflows.insert_one(doc)
            logger.info(f"Created workflow: {workflow.workflow_id}", extra={"workflow_id": workflow.workflow_id})
            return workflow
        except Exception as e:
            if "duplicate key" in str(e).lower():
                raise AlreadyExistsError(f"Workflow {workflow.workflow_id} already exists")
            raise
    
    def get_workflow(self, workflow_id: str) -> Optional[WorkflowTemplate]:
        """Get workflow by ID"""
        doc = self._workflows.find_one({"workflow_id": workflow_id})
        if doc:
            doc.pop("_id", None)
            try:
                return WorkflowTemplate.model_validate(doc)
            except ValidationError as e:
                logger.error(
                    f"Corrupted workflow data for {workflow_id}. Validation failed: {str(e)[:500]}",
                    extra={"workflow_id": workflow_id, "error_count": len(e.errors())}
                )
                # Return a minimal workflow object with raw data to allow viewing/fixing
                # This prevents complete breakage while flagging the issue
                return self._create_safe_workflow_from_doc(doc)
        return None
    
    def _create_safe_workflow_from_doc(self, doc: Dict[str, Any]) -> Optional[WorkflowTemplate]:
        """
        Create a safe workflow object from a potentially corrupted document.
        Used when full validation fails to prevent complete data loss.
        """
        try:
            # Create minimal valid workflow - strip the definition if it's corrupted
            safe_doc = {
                "workflow_id": doc.get("workflow_id"),
                "name": doc.get("name", "Corrupted Workflow"),
                "description": doc.get("description", "This workflow has data validation issues"),
                "category": doc.get("category"),
                "tags": doc.get("tags", []),
                "status": doc.get("status", "DRAFT"),
                "created_by": doc.get("created_by"),
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
                "version": doc.get("version", 1),
                "published_version": doc.get("published_version"),
                # Use empty definition to avoid validation errors
                "definition": {"steps": [], "transitions": [], "start_step_id": None}
            }
            return WorkflowTemplate.model_validate(safe_doc)
        except Exception as e:
            logger.error(f"Failed to create safe workflow from corrupted data: {e}")
            return None
    
    def get_workflow_or_raise(self, workflow_id: str) -> WorkflowTemplate:
        """Get workflow by ID or raise error"""
        workflow = self.get_workflow(workflow_id)
        if not workflow:
            raise WorkflowNotFoundError(f"Workflow {workflow_id} not found")
        return workflow
    
    def update_workflow(
        self, 
        workflow_id: str, 
        updates: Dict[str, Any],
        expected_version: Optional[int] = None
    ) -> WorkflowTemplate:
        """
        Update workflow with optimistic concurrency
        
        Args:
            workflow_id: Workflow ID
            updates: Fields to update
            expected_version: Expected version for optimistic lock
        """
        updates["updated_at"] = datetime.utcnow()
        
        filter_query = {"workflow_id": workflow_id}
        if expected_version is not None:
            filter_query["version"] = expected_version
            updates["version"] = expected_version + 1
        
        result = self._workflows.find_one_and_update(
            filter_query,
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            if expected_version is not None:
                # Check if workflow exists at all
                exists = self._workflows.find_one({"workflow_id": workflow_id})
                if exists:
                    raise ConcurrencyError(
                        f"Workflow {workflow_id} was modified. Please refresh and try again.",
                        details={"expected_version": expected_version}
                    )
            raise WorkflowNotFoundError(f"Workflow {workflow_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Updated workflow: {workflow_id}", extra={"workflow_id": workflow_id})
        try:
            return WorkflowTemplate.model_validate(result)
        except ValidationError as e:
            logger.error(
                f"Workflow {workflow_id} update resulted in invalid data: {str(e)[:500]}",
                extra={"workflow_id": workflow_id}
            )
            # Return safe version so UI doesn't completely break
            safe_workflow = self._create_safe_workflow_from_doc(result)
            if safe_workflow:
                return safe_workflow
            raise
    
    def update_workflow_draft(
        self,
        workflow_id: str,
        definition: WorkflowDefinition,
        expected_version: int
    ) -> WorkflowTemplate:
        """Update workflow draft definition"""
        return self.update_workflow(
            workflow_id,
            {"definition": definition.model_dump(mode="json")},
            expected_version
        )
    
    def list_workflows(
        self,
        status: Optional[WorkflowStatus] = None,
        created_by_email: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[WorkflowTemplate]:
        """List workflows with optional filters. Gracefully handles corrupted records."""
        query: Dict[str, Any] = {}
        
        if status:
            query["status"] = status.value
        if created_by_email:
            query["created_by.email"] = created_by_email
        
        cursor = self._workflows.find(query).sort("updated_at", DESCENDING).skip(skip).limit(limit)
        
        workflows = []
        corrupted_count = 0
        
        for doc in cursor:
            doc.pop("_id", None)
            try:
                workflows.append(WorkflowTemplate.model_validate(doc))
            except ValidationError as e:
                corrupted_count += 1
                workflow_id = doc.get("workflow_id", "unknown")
                logger.warning(
                    f"Skipping corrupted workflow {workflow_id} in list. Errors: {len(e.errors())}",
                    extra={"workflow_id": workflow_id, "error_preview": str(e)[:300]}
                )
                # Add a safe version so user can see and potentially fix/delete it
                safe_workflow = self._create_safe_workflow_from_doc(doc)
                if safe_workflow:
                    # Mark it clearly as corrupted
                    safe_workflow.description = f"⚠️ DATA CORRUPTED - {safe_workflow.description or 'Please delete and recreate this workflow'}"
                    workflows.append(safe_workflow)
        
        if corrupted_count > 0:
            logger.warning(f"Found {corrupted_count} corrupted workflow(s) during listing")
        
        return workflows
    
    def count_workflows(
        self,
        status: Optional[WorkflowStatus] = None,
        created_by_email: Optional[str] = None
    ) -> int:
        """Count workflows with optional filters"""
        query: Dict[str, Any] = {}
        
        if status:
            query["status"] = status.value
        if created_by_email:
            query["created_by.email"] = created_by_email
        
        return self._workflows.count_documents(query)
    
    def delete_workflow(self, workflow_id: str) -> bool:
        """Delete workflow (soft delete by archiving is preferred)"""
        result = self._workflows.delete_one({"workflow_id": workflow_id})
        return result.deleted_count > 0
    
    # =========================================================================
    # Workflow Version Operations
    # =========================================================================
    
    def create_version(self, version: WorkflowVersion) -> WorkflowVersion:
        """Create a new workflow version"""
        doc = version.model_dump(mode="json")
        doc["_id"] = version.workflow_version_id
        
        self._versions.insert_one(doc)
        logger.info(
            f"Created workflow version: {version.workflow_version_id}",
            extra={"workflow_id": version.workflow_id, "version": version.version_number}
        )
        return version
    
    def get_version(self, workflow_version_id: str) -> Optional[WorkflowVersion]:
        """Get version by ID"""
        doc = self._versions.find_one({"workflow_version_id": workflow_version_id})
        if doc:
            doc.pop("_id", None)
            try:
                return WorkflowVersion.model_validate(doc)
            except ValidationError as e:
                logger.error(
                    f"Corrupted version data for {workflow_version_id}: {str(e)[:300]}",
                    extra={"workflow_version_id": workflow_version_id}
                )
                return None
        return None
    
    def get_latest_version(self, workflow_id: str) -> Optional[WorkflowVersion]:
        """Get latest published version for workflow"""
        doc = self._versions.find_one(
            {"workflow_id": workflow_id},
            sort=[("version_number", DESCENDING)]
        )
        if doc:
            doc.pop("_id", None)
            try:
                return WorkflowVersion.model_validate(doc)
            except ValidationError as e:
                logger.error(
                    f"Corrupted latest version for workflow {workflow_id}: {str(e)[:300]}",
                    extra={"workflow_id": workflow_id}
                )
                return None
        return None
    
    def get_version_by_number(self, workflow_id: str, version_number: int) -> Optional[WorkflowVersion]:
        """Get specific version by number"""
        doc = self._versions.find_one({
            "workflow_id": workflow_id,
            "version_number": version_number
        })
        if doc:
            doc.pop("_id", None)
            try:
                return WorkflowVersion.model_validate(doc)
            except ValidationError as e:
                logger.error(
                    f"Corrupted version {version_number} for workflow {workflow_id}: {str(e)[:300]}",
                    extra={"workflow_id": workflow_id, "version_number": version_number}
                )
                return None
        return None
    
    def list_versions(
        self,
        workflow_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[WorkflowVersion]:
        """List all versions for a workflow. Gracefully handles corrupted records."""
        cursor = self._versions.find({"workflow_id": workflow_id}).sort("version_number", DESCENDING).skip(skip).limit(limit)
        
        versions = []
        for doc in cursor:
            doc.pop("_id", None)
            try:
                versions.append(WorkflowVersion.model_validate(doc))
            except ValidationError as e:
                version_id = doc.get("workflow_version_id", "unknown")
                logger.warning(
                    f"Skipping corrupted workflow version {version_id}",
                    extra={"workflow_version_id": version_id, "error_preview": str(e)[:300]}
                )
                continue
        
        return versions
    
    def get_next_version_number(self, workflow_id: str) -> int:
        """Get next version number for workflow"""
        latest = self.get_latest_version(workflow_id)
        return (latest.version_number + 1) if latest else 1
    
    # =========================================================================
    # Catalog Operations
    # =========================================================================
    
    def get_published_workflows(
        self,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[WorkflowTemplate]:
        """Get published workflows for catalog. Gracefully handles corrupted records."""
        query: Dict[str, Any] = {"status": WorkflowStatus.PUBLISHED.value}
        
        if category:
            query["category"] = category
        if tags:
            query["tags"] = {"$all": tags}
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = self._workflows.find(query).sort("name", 1).skip(skip).limit(limit)
        
        workflows = []
        for doc in cursor:
            doc.pop("_id", None)
            try:
                workflows.append(WorkflowTemplate.model_validate(doc))
            except ValidationError as e:
                workflow_id = doc.get("workflow_id", "unknown")
                logger.warning(
                    f"Skipping corrupted published workflow {workflow_id}",
                    extra={"workflow_id": workflow_id, "error_preview": str(e)[:300]}
                )
                # Don't add corrupted workflows to catalog - they shouldn't be usable
                continue
        
        return workflows
    
    def count_published_workflows(
        self,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        search: Optional[str] = None
    ) -> int:
        """Count published workflows for catalog"""
        query: Dict[str, Any] = {"status": WorkflowStatus.PUBLISHED.value}
        
        if category:
            query["category"] = category
        if tags:
            query["tags"] = {"$all": tags}
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        
        return self._workflows.count_documents(query)


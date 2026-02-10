"""Workflow API Routes - Designer endpoints"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field

from ..deps import get_current_user_dep, get_correlation_id_dep
from ...domain.models import ActorContext, WorkflowTemplate, WorkflowVersion, WorkflowDefinition, UserSnapshot
from ...domain.enums import WorkflowStatus
from ...domain.errors import DomainError
from ...services.workflow_service import WorkflowService
from ...utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateWorkflowRequest(BaseModel):
    """Request to create a new workflow"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=100)
    tags: List[str] = Field(default_factory=list)


class CreateWorkflowResponse(BaseModel):
    """Response after creating workflow"""
    workflow_id: str


class SaveDraftRequest(BaseModel):
    """Request to save workflow draft"""
    definition: Dict[str, Any]
    change_summary: Optional[str] = None


class UpdateMetadataRequest(BaseModel):
    """Request to update workflow metadata"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = Field(None, max_length=100)
    tags: Optional[List[str]] = Field(None, max_items=20)


class SaveDraftResponse(BaseModel):
    """Response after saving draft"""
    workflow_id: str
    validation: Dict[str, Any]
    draft_updated_at: str


class PublishResponse(BaseModel):
    """Response after publishing workflow"""
    workflow_version_id: str
    version: int


class WorkflowListResponse(BaseModel):
    """Response for workflow list"""
    items: List[Dict[str, Any]]
    page: int
    page_size: int
    total: int


class ValidationResult(BaseModel):
    """Validation result"""
    is_valid: bool
    errors: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================================================
# Routes
# ============================================================================

@router.post("", response_model=CreateWorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: CreateWorkflowRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Create a new workflow draft
    
    Creates an empty workflow template that can be edited and published.
    """
    try:
        service = WorkflowService()
        workflow = service.create_workflow(
            name=request.name,
            description=request.description,
            category=request.category,
            tags=request.tags,
            actor=actor
        )
        
        logger.info(
            f"Created workflow: {workflow.workflow_id}",
            extra={"workflow_id": workflow.workflow_id, "actor_email": actor.email}
        )
        
        return CreateWorkflowResponse(workflow_id=workflow.workflow_id)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(
    status: Optional[WorkflowStatus] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    List workflows
    
    Returns workflows visible to the current user.
    Designers can see all workflows (v1).
    """
    try:
        service = WorkflowService()
        skip = (page - 1) * page_size
        
        workflows = service.list_workflows(
            status=status,
            skip=skip,
            limit=page_size
        )
        
        total = service.count_workflows(status=status)
        
        return WorkflowListResponse(
            items=[w.model_dump(mode="json") for w in workflows],
            page=page,
            page_size=page_size,
            total=total
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


# ============================================================================
# Published Workflows for Embedding (Sub-Workflows)
# ============================================================================

class PublishedWorkflowForEmbedding(BaseModel):
    """Info about a published workflow that can be embedded as a sub-workflow"""
    workflow_id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    tags: List[str]
    current_version: int
    step_count: int
    step_counts: Dict[str, int]
    published_at: Optional[str]
    published_by: Optional[str]


class PublishedWorkflowsResponse(BaseModel):
    """Response for list of embeddable workflows"""
    items: List[PublishedWorkflowForEmbedding]
    total: int


@router.get("/published-for-embedding", response_model=PublishedWorkflowsResponse)
async def list_published_workflows_for_embedding(
    exclude_workflow_id: Optional[str] = Query(
        None, 
        description="Workflow ID to exclude (the one being edited)"
    ),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    List published workflows available for embedding as sub-workflows.
    
    Returns workflows that:
    - Are published (have at least one published version)
    - Do NOT contain sub-workflows themselves (Level 1 only)
    - Are not the workflow being edited (if exclude_workflow_id provided)
    
    Used by the Workflow Studio Step Library to show the "Published Workflows" section.
    """
    try:
        service = WorkflowService()
        
        workflows = service.get_published_workflows_for_embedding(
            exclude_workflow_id=exclude_workflow_id
        )
        
        return PublishedWorkflowsResponse(
            items=[PublishedWorkflowForEmbedding(**w) for w in workflows],
            total=len(workflows)
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/catalog", response_model=WorkflowListResponse)
async def get_catalog(
    category: Optional[str] = Query(None),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    q: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get published workflow catalog
    
    Returns published workflows that requesters can create tickets from.
    """
    try:
        service = WorkflowService()
        skip = (page - 1) * page_size
        
        tag_list = [t.strip() for t in tags.split(",")] if tags else None
        
        workflows = service.get_catalog(
            category=category,
            tags=tag_list,
            search=q,
            skip=skip,
            limit=page_size
        )
        
        total = service.count_catalog(
            category=category,
            tags=tag_list,
            search=q
        )
        
        return WorkflowListResponse(
            items=[w.model_dump(mode="json") for w in workflows],
            page=page,
            page_size=page_size,
            total=total
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{workflow_id}")
async def get_workflow(
    workflow_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get workflow by ID
    
    Returns the workflow template including draft definition.
    """
    try:
        service = WorkflowService()
        workflow = service.get_workflow(workflow_id)
        
        return workflow.model_dump(mode="json")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.put("/{workflow_id}/draft", response_model=SaveDraftResponse)
async def save_draft(
    workflow_id: str,
    request: SaveDraftRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Save workflow draft definition
    
    Saves the workflow definition and validates it.
    Returns validation results (errors and warnings).
    """
    try:
        service = WorkflowService()
        workflow, validation = service.save_draft(
            workflow_id=workflow_id,
            definition=request.definition,
            change_summary=request.change_summary,
            actor=actor
        )
        
        return SaveDraftResponse(
            workflow_id=workflow.workflow_id,
            validation=validation,
            draft_updated_at=workflow.updated_at.isoformat()
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{workflow_id}/validate", response_model=ValidationResult)
async def validate_workflow(
    workflow_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Validate workflow definition
    
    Performs full validation and returns errors/warnings.
    """
    try:
        service = WorkflowService()
        validation = service.validate_workflow(workflow_id)
        
        return ValidationResult(**validation)
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/{workflow_id}/publish", response_model=PublishResponse)
async def publish_workflow(
    workflow_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Publish workflow
    
    Creates an immutable published version if validation passes.
    """
    try:
        service = WorkflowService()
        version = service.publish_workflow(workflow_id=workflow_id, actor=actor)
        
        logger.info(
            f"Published workflow: {workflow_id} v{version.version_number}",
            extra={"workflow_id": workflow_id, "version": version.version_number}
        )
        
        return PublishResponse(
            workflow_version_id=version.workflow_version_id,
            version=version.version_number
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{workflow_id}/versions")
async def list_versions(
    workflow_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    List workflow versions
    
    Returns all published versions for a workflow.
    """
    try:
        service = WorkflowService()
        skip = (page - 1) * page_size
        
        versions = service.list_versions(
            workflow_id=workflow_id,
            skip=skip,
            limit=page_size
        )
        
        return {
            "items": [v.model_dump(mode="json") for v in versions],
            "page": page,
            "page_size": page_size
        }
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{workflow_id}/versions/{version_number}")
async def get_version(
    workflow_id: str,
    version_number: int,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get specific workflow version
    
    Returns the immutable published version definition.
    """
    try:
        service = WorkflowService()
        version = service.get_version(workflow_id, version_number)
        
        return version.model_dump(mode="json")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{workflow_id}/initial-forms")
async def get_initial_form_chain(
    workflow_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get the chain of consecutive form steps from the workflow's start.
    
    Used for wizard-style multi-page forms during ticket creation.
    Returns all consecutive FORM_STEPs starting from start_step_id,
    and the ID of the first non-form step that should be activated after.
    """
    try:
        service = WorkflowService()
        result = service.get_initial_form_chain(workflow_id)
        
        logger.info(
            f"Retrieved initial form chain for workflow: {workflow_id}",
            extra={
                "workflow_id": workflow_id,
                "form_count": result["total_form_count"]
            }
        )
        
        return result
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.get("/{workflow_id}/versions/{version_number}/consecutive-forms/{step_id}")
async def get_consecutive_forms_from_step(
    workflow_id: str,
    version_number: int,
    step_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Get chain of consecutive form steps starting from a specific step.
    
    Used for mid-workflow forms where user needs to fill multiple consecutive
    forms before proceeding to a non-form step.
    """
    try:
        service = WorkflowService()
        result = service.get_consecutive_forms_from_step(
            workflow_id=workflow_id,
            version_number=version_number,
            from_step_id=step_id
        )
        
        logger.info(
            f"Retrieved consecutive forms from step: {step_id}",
            extra={
                "workflow_id": workflow_id,
                "step_id": step_id,
                "form_count": result["total_form_count"]
            }
        )
        
        return result
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.patch("/{workflow_id}/metadata")
async def update_workflow_metadata(
    workflow_id: str,
    request: UpdateMetadataRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Update workflow metadata
    
    Updates name, description, category, and/or tags for a workflow.
    """
    try:
        service = WorkflowService()
        updates = {}
        if request.name is not None:
            updates["name"] = request.name
        if request.description is not None:
            updates["description"] = request.description
        if request.category is not None:
            updates["category"] = request.category
        if request.tags is not None:
            updates["tags"] = request.tags
        
        workflow = service.update_workflow_metadata(
            workflow_id=workflow_id,
            updates=updates,
            actor=actor
        )
        
        return workflow.model_dump(mode="json")
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Delete workflow
    
    Permanently deletes a workflow. Only draft/archived workflows can be deleted.
    Published workflows with active tickets cannot be deleted.
    """
    try:
        service = WorkflowService()
        service.delete_workflow(workflow_id=workflow_id, actor=actor)
        
        logger.info(
            f"Deleted workflow: {workflow_id}",
            extra={"workflow_id": workflow_id, "actor_email": actor.email}
        )
        
        return None
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


"""Ticket Repository - Data access for tickets and related entities"""
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from pymongo.collection import Collection
from pymongo import DESCENDING, ASCENDING

from .mongo_client import get_collection
from ..domain.models import (
    Ticket, TicketStep, ApprovalTask, Assignment, InfoRequest, 
    HandoverRequest, SlaAcknowledgment
)
from ..domain.enums import (
    TicketStatus, StepState, StepType, ApprovalDecision, AssignmentStatus, InfoRequestStatus,
    HandoverRequestStatus
)
from ..domain.errors import (
    TicketNotFoundError, StepNotFoundError, ConcurrencyError, NotFoundError
)
from ..utils.logger import get_logger

logger = get_logger(__name__)


class TicketRepository:
    """Repository for ticket operations"""
    
    def __init__(self):
        self._tickets: Collection = get_collection("tickets")
        self._steps: Collection = get_collection("ticket_steps")
        self._approval_tasks: Collection = get_collection("approval_tasks")
        self._assignments: Collection = get_collection("assignments")
        self._info_requests: Collection = get_collection("info_requests")
        self._handover_requests: Collection = get_collection("handover_requests")
        self._sla_acknowledgments: Collection = get_collection("sla_acknowledgments")
    
    # =========================================================================
    # Ticket CRUD
    # =========================================================================
    
    def create_ticket(self, ticket: Ticket) -> Ticket:
        """Create a new ticket"""
        # Don't use mode="json" - it converts datetime to strings, breaking MongoDB sorting
        doc = ticket.model_dump()
        doc["_id"] = ticket.ticket_id
        
        self._tickets.insert_one(doc)
        logger.info(f"Created ticket: {ticket.ticket_id}", extra={"ticket_id": ticket.ticket_id})
        return ticket
    
    def get_ticket(self, ticket_id: str) -> Optional[Ticket]:
        """Get ticket by ID"""
        doc = self._tickets.find_one({"ticket_id": ticket_id})
        if doc:
            doc.pop("_id", None)
            return Ticket.model_validate(doc)
        return None
    
    def get_ticket_or_raise(self, ticket_id: str) -> Ticket:
        """Get ticket by ID or raise error"""
        ticket = self.get_ticket(ticket_id)
        if not ticket:
            raise TicketNotFoundError(f"Ticket {ticket_id} not found")
        return ticket
    
    def update_ticket(
        self,
        ticket_id: str,
        updates: Dict[str, Any],
        expected_version: Optional[int] = None
    ) -> Ticket:
        """Update ticket with optimistic concurrency"""
        updates["updated_at"] = datetime.utcnow()
        
        filter_query = {"ticket_id": ticket_id}
        if expected_version is not None:
            filter_query["version"] = expected_version
            updates["version"] = expected_version + 1
        
        result = self._tickets.find_one_and_update(
            filter_query,
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            if expected_version is not None:
                exists = self._tickets.find_one({"ticket_id": ticket_id})
                if exists:
                    raise ConcurrencyError(
                        f"Ticket {ticket_id} was modified. Please refresh and try again.",
                        details={"expected_version": expected_version}
                    )
            raise TicketNotFoundError(f"Ticket {ticket_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Updated ticket: {ticket_id}", extra={"ticket_id": ticket_id})
        return Ticket.model_validate(result)
    
    def list_tickets(
        self,
        requester_email: Optional[str] = None,
        requester_aad_id: Optional[str] = None,
        status: Optional[TicketStatus] = None,
        statuses: Optional[List[TicketStatus]] = None,
        workflow_id: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        skip: int = 0,
        limit: int = 50,
        has_pending_cr: Optional[bool] = None
    ) -> List[Ticket]:
        """List tickets with filters. Supports single status or multiple statuses."""
        query: Dict[str, Any] = {}
        and_conditions = []
        
        # Use $or to match by aad_id OR email (handles UPN vs primary email mismatch)
        if requester_aad_id or requester_email:
            requester_conditions = []
            if requester_aad_id:
                requester_conditions.append({"requester.aad_id": requester_aad_id})
            if requester_email:
                # Case-insensitive email match
                requester_conditions.append({"requester.email": {"$regex": f"^{requester_email}$", "$options": "i"}})
            
            if len(requester_conditions) == 1:
                and_conditions.append(requester_conditions[0])
            else:
                and_conditions.append({"$or": requester_conditions})
        
        if statuses:
            # Multiple statuses - use $in
            and_conditions.append({"status": {"$in": [s.value for s in statuses]}})
        elif status:
            and_conditions.append({"status": status.value})
        if workflow_id:
            and_conditions.append({"workflow_id": workflow_id})
        if search:
            # Search in title, ticket_id, description, and workflow_name
            and_conditions.append({"$or": [
                {"title": {"$regex": search, "$options": "i"}},
                {"ticket_id": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"workflow_name": {"$regex": search, "$options": "i"}}
            ]})
        
        # Date range filtering - uses updated_at for better UX (filter by last activity)
        if date_from or date_to:
            date_query: Dict[str, Any] = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            and_conditions.append({"updated_at": date_query})
        
        # Pending CR filter
        if has_pending_cr is not None:
            if has_pending_cr:
                # Has pending CR - pending_change_request_id exists and is not null
                and_conditions.append({"pending_change_request_id": {"$ne": None, "$exists": True}})
            else:
                # No pending CR - pending_change_request_id is null or doesn't exist
                and_conditions.append({"$or": [
                    {"pending_change_request_id": None},
                    {"pending_change_request_id": {"$exists": False}}
                ]})
        
        # Build final query
        if len(and_conditions) == 1:
            query = and_conditions[0]
        elif len(and_conditions) > 1:
            query = {"$and": and_conditions}
        
        # Sorting
        sort_direction = DESCENDING if sort_order == "desc" else ASCENDING
        valid_sort_fields = ["updated_at", "created_at", "title", "status"]
        if sort_by not in valid_sort_fields:
            sort_by = "updated_at"
        
        cursor = self._tickets.find(query).sort(sort_by, sort_direction).skip(skip).limit(limit)
        
        tickets = []
        for doc in cursor:
            doc.pop("_id", None)
            tickets.append(Ticket.model_validate(doc))
        
        return tickets
    
    def count_tickets(
        self,
        requester_email: Optional[str] = None,
        requester_aad_id: Optional[str] = None,
        status: Optional[TicketStatus] = None,
        statuses: Optional[List[TicketStatus]] = None,
        workflow_id: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        has_pending_cr: Optional[bool] = None
    ) -> int:
        """Count tickets with filters. Supports single status or multiple statuses."""
        query: Dict[str, Any] = {}
        and_conditions = []
        
        # Use $or to match by aad_id OR email (handles UPN vs primary email mismatch)
        if requester_aad_id or requester_email:
            requester_conditions = []
            if requester_aad_id:
                requester_conditions.append({"requester.aad_id": requester_aad_id})
            if requester_email:
                # Case-insensitive email match
                requester_conditions.append({"requester.email": {"$regex": f"^{requester_email}$", "$options": "i"}})
            
            if len(requester_conditions) == 1:
                and_conditions.append(requester_conditions[0])
            else:
                and_conditions.append({"$or": requester_conditions})
        
        if statuses:
            # Multiple statuses - use $in
            and_conditions.append({"status": {"$in": [s.value for s in statuses]}})
        elif status:
            and_conditions.append({"status": status.value})
        if workflow_id:
            and_conditions.append({"workflow_id": workflow_id})
        if search:
            and_conditions.append({"$or": [
                {"title": {"$regex": search, "$options": "i"}},
                {"ticket_id": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"workflow_name": {"$regex": search, "$options": "i"}}
            ]})
        
        # Date range filtering - uses updated_at for better UX (filter by last activity)
        if date_from or date_to:
            date_query: Dict[str, Any] = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            and_conditions.append({"updated_at": date_query})
        
        # Pending CR filter
        if has_pending_cr is not None:
            if has_pending_cr:
                # Has pending CR - pending_change_request_id exists and is not null
                and_conditions.append({"pending_change_request_id": {"$ne": None, "$exists": True}})
            else:
                # No pending CR - pending_change_request_id is null or doesn't exist
                and_conditions.append({"$or": [
                    {"pending_change_request_id": None},
                    {"pending_change_request_id": {"$exists": False}}
                ]})
        
        # Build final query
        if len(and_conditions) == 1:
            query = and_conditions[0]
        elif len(and_conditions) > 1:
            query = {"$and": and_conditions}
        
        return self._tickets.count_documents(query)
    
    # =========================================================================
    # Ticket Step Operations
    # =========================================================================
    
    def create_step(self, step: TicketStep) -> TicketStep:
        """Create a ticket step"""
        doc = step.model_dump()
        doc["_id"] = step.ticket_step_id
        
        self._steps.insert_one(doc)
        logger.info(
            f"Created ticket step: {step.ticket_step_id}",
            extra={"ticket_id": step.ticket_id, "step_id": step.ticket_step_id}
        )
        return step
    
    def create_steps_bulk(self, steps: List[TicketStep]) -> List[TicketStep]:
        """Create multiple ticket steps"""
        if not steps:
            return []
        
        docs = []
        for step in steps:
            doc = step.model_dump()
            doc["_id"] = step.ticket_step_id
            docs.append(doc)
        
        self._steps.insert_many(docs)
        logger.info(f"Created {len(steps)} ticket steps")
        return steps
    
    def get_step(self, ticket_step_id: str) -> Optional[TicketStep]:
        """Get ticket step by ID"""
        doc = self._steps.find_one({"ticket_step_id": ticket_step_id})
        if doc:
            doc.pop("_id", None)
            return TicketStep.model_validate(doc)
        return None
    
    def get_step_raw(self, ticket_step_id: str) -> Optional[Dict[str, Any]]:
        """Get ticket step raw document (for parallel approval tracking)"""
        doc = self._steps.find_one({"ticket_step_id": ticket_step_id})
        if doc:
            doc.pop("_id", None)
            return doc
        return None
    
    def get_step_or_raise(self, ticket_step_id: str) -> TicketStep:
        """Get ticket step by ID or raise error"""
        step = self.get_step(ticket_step_id)
        if not step:
            raise StepNotFoundError(f"Ticket step {ticket_step_id} not found")
        return step
    
    def update_step(
        self,
        ticket_step_id: str,
        updates: Dict[str, Any],
        expected_version: Optional[int] = None
    ) -> TicketStep:
        """Update ticket step with optimistic concurrency"""
        filter_query = {"ticket_step_id": ticket_step_id}
        if expected_version is not None:
            filter_query["version"] = expected_version
            updates["version"] = expected_version + 1
        
        result = self._steps.find_one_and_update(
            filter_query,
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            if expected_version is not None:
                exists = self._steps.find_one({"ticket_step_id": ticket_step_id})
                if exists:
                    raise ConcurrencyError(
                        f"Step {ticket_step_id} was modified. Please refresh and try again.",
                        details={"expected_version": expected_version}
                    )
            raise StepNotFoundError(f"Ticket step {ticket_step_id} not found")
        
        result.pop("_id", None)
        logger.info(f"Updated ticket step: {ticket_step_id}", extra={"step_id": ticket_step_id})
        return TicketStep.model_validate(result)
    
    def get_steps_for_ticket(self, ticket_id: str) -> List[TicketStep]:
        """Get all steps for a ticket"""
        cursor = self._steps.find({"ticket_id": ticket_id}).sort("step_id", ASCENDING)
        
        steps = []
        for doc in cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def get_assigned_steps(
        self,
        assignee_email: str,
        state: Optional[StepState] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[TicketStep]:
        """Get steps assigned to a user (empty email means unassigned)"""
        if assignee_email == "":
            # Unassigned: assigned_to is null or doesn't exist
            query: Dict[str, Any] = {"$or": [
                {"assigned_to": None},
                {"assigned_to": {"$exists": False}}
            ]}
        else:
            # Match by email (case-insensitive)
            query = {"assigned_to.email": {"$regex": f"^{assignee_email}$", "$options": "i"}}
        
        if state:
            query["state"] = state.value
        
        cursor = self._steps.find(query).sort("due_at", ASCENDING).skip(skip).limit(limit)
        
        steps = []
        for doc in cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def get_assigned_steps_by_user(
        self,
        user_email: str,
        user_aad_id: Optional[str] = None,
        state: Optional[StepState] = None,
        states: Optional[List[StepState]] = None,
        step_type: Optional[StepType] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[TicketStep]:
        """Get steps assigned to a user by email OR aad_id
        
        Args:
            state: Single state to filter by (legacy, use states for multiple)
            states: List of states to filter by (uses $in operator)
        """
        # Build OR condition for matching
        match_conditions = []
        
        # Match by email (case-insensitive)
        if user_email:
            match_conditions.append(
                {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}}
            )
        
        # Match by aad_id (exact match)
        if user_aad_id:
            match_conditions.append(
                {"assigned_to.aad_id": user_aad_id}
            )
        
        if not match_conditions:
            return []
        
        query: Dict[str, Any] = {"$or": match_conditions}
        
        # Support both single state and multiple states
        if states:
            query["state"] = {"$in": [s.value for s in states]}
        elif state:
            query["state"] = state.value
        
        # Filter by step_type at DB level for correct pagination
        if step_type:
            query["step_type"] = step_type.value
        
        cursor = self._steps.find(query).sort("due_at", ASCENDING).skip(skip).limit(limit)
        
        steps = []
        for doc in cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def count_assigned_steps_by_user(
        self,
        user_email: str,
        user_aad_id: Optional[str] = None,
        states: Optional[List[StepState]] = None,
        step_type: Optional[StepType] = None
    ) -> Dict[str, int]:
        """Count steps assigned to a user, grouped by state.
        
        Returns a dict with counts per state and total.
        """
        match_conditions = []
        
        if user_email:
            match_conditions.append(
                {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}}
            )
        
        if user_aad_id:
            match_conditions.append(
                {"assigned_to.aad_id": user_aad_id}
            )
        
        if not match_conditions:
            return {"total": 0, "active": 0, "on_hold": 0, "waiting": 0}
        
        query: Dict[str, Any] = {"$or": match_conditions}
        
        if states:
            query["state"] = {"$in": [s.value for s in states]}
        
        if step_type:
            query["step_type"] = step_type.value
        
        # Use aggregation to count by state
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$state",
                "count": {"$sum": 1}
            }}
        ]
        
        results = list(self._steps.aggregate(pipeline))
        
        counts = {
            "total": 0,
            "active": 0,
            "on_hold": 0,
            "waiting": 0,
            "overdue": 0
        }
        
        for r in results:
            state = r["_id"]
            count = r["count"]
            counts["total"] += count
            
            if state == StepState.ACTIVE.value:
                counts["active"] = count
            elif state == StepState.ON_HOLD.value:
                counts["on_hold"] = count
            elif state in [StepState.WAITING_FOR_REQUESTER.value, StepState.WAITING_FOR_AGENT.value]:
                counts["waiting"] += count
        
        return counts
    
    # =========================================================================
    # Approval Task Operations
    # =========================================================================
    
    def create_approval_task(self, task: ApprovalTask) -> ApprovalTask:
        """Create an approval task"""
        doc = task.model_dump()
        doc["_id"] = task.approval_task_id
        
        self._approval_tasks.insert_one(doc)
        logger.info(f"Created approval task: {task.approval_task_id}")
        return task
    
    def get_approval_task(self, approval_task_id: str) -> Optional[ApprovalTask]:
        """Get approval task by ID"""
        doc = self._approval_tasks.find_one({"approval_task_id": approval_task_id})
        if doc:
            doc.pop("_id", None)
            return ApprovalTask.model_validate(doc)
        return None
    
    def get_approval_tasks_for_step(self, ticket_step_id: str) -> List[ApprovalTask]:
        """Get approval tasks for a step"""
        cursor = self._approval_tasks.find({"ticket_step_id": ticket_step_id})
        
        tasks = []
        for doc in cursor:
            doc.pop("_id", None)
            tasks.append(ApprovalTask.model_validate(doc))
        
        return tasks
    
    def get_approval_tasks_for_ticket(self, ticket_id: str) -> List[ApprovalTask]:
        """Get all approval tasks for a specific ticket"""
        cursor = self._approval_tasks.find({"ticket_id": ticket_id})
        tasks = []
        for doc in cursor:
            doc.pop("_id", None)
            tasks.append(ApprovalTask.model_validate(doc))
        return tasks
    
    def get_pending_approvals(
        self,
        approver_email: str,
        approver_aad_id: str = "",
        skip: int = 0,
        limit: int = 50
    ) -> List[ApprovalTask]:
        """
        Get pending approvals for an approver.
        
        Uses case-insensitive email matching and also checks aad_id
        to handle UPN vs mail attribute differences in Azure AD.
        """
        import re
        
        logger.info(f"Querying pending approvals for email={approver_email}, aad_id={approver_aad_id}")
        
        # Build query that matches by email (case-insensitive) OR by aad_id
        email_pattern = re.compile(f"^{re.escape(approver_email)}$", re.IGNORECASE)
        
        query_conditions = [
            {"approver.email": {"$regex": email_pattern}}
        ]
        
        # Also match by aad_id if provided (most reliable)
        if approver_aad_id:
            query_conditions.append({"approver.aad_id": approver_aad_id})
        
        query = {
            "$and": [
                {"decision": ApprovalDecision.PENDING.value},
                {"$or": query_conditions}
            ]
        }
        
        logger.info(f"Pending approvals query: decision=PENDING, email_match OR aad_id={approver_aad_id}")
        
        cursor = self._approval_tasks.find(query).skip(skip).limit(limit)
        
        tasks = []
        for doc in cursor:
            doc.pop("_id", None)
            tasks.append(ApprovalTask.model_validate(doc))
        
        logger.info(f"Found {len(tasks)} pending approvals")
        
        return tasks
    
    def update_approval_task(
        self,
        approval_task_id: str,
        updates: Dict[str, Any]
    ) -> ApprovalTask:
        """Update approval task"""
        result = self._approval_tasks.find_one_and_update(
            {"approval_task_id": approval_task_id},
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Approval task {approval_task_id} not found")
        
        result.pop("_id", None)
        return ApprovalTask.model_validate(result)
    
    def get_completed_approvals_by_manager(
        self,
        manager_email: str,
        manager_aad_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get approval history for a manager - ALL approval decisions they made.
        
        Returns each approval decision separately (not deduplicated by ticket),
        so if a manager approved multiple times on the same ticket (e.g., initial + parallel branches),
        each approval shows as a separate entry.
        """
        import re
        from ..domain.enums import ApprovalDecision
        
        logger.info(f"Getting completed approvals for manager: email={manager_email}, aad_id={manager_aad_id}")
        
        # Build match conditions for email and aad_id
        match_conditions = []
        if manager_email:
            match_conditions.append(
                {"approver.email": {"$regex": f"^{re.escape(manager_email)}$", "$options": "i"}}
            )
        if manager_aad_id:
            match_conditions.append(
                {"approver.aad_id": manager_aad_id}
            )
        
        if not match_conditions:
            return [], 0
        
        # Query for approved/rejected/skipped approval tasks
        query = {
            "$or": match_conditions,
            "decision": {"$in": [ApprovalDecision.APPROVED.value, ApprovalDecision.REJECTED.value, ApprovalDecision.SKIPPED.value]}
        }
        
        # Get all matching approval tasks, sorted by decided_at descending
        approval_tasks = list(
            self._approval_tasks.find(query).sort("decided_at", DESCENDING)
        )
        
        logger.info(f"Found {len(approval_tasks)} completed approval tasks")
        
        # Get unique ticket IDs from these approvals
        ticket_ids = list(set(task.get("ticket_id") for task in approval_tasks if task.get("ticket_id")))
        
        if not ticket_ids:
            return [], 0
        
        # Build ticket query
        ticket_query: Dict[str, Any] = {"ticket_id": {"$in": ticket_ids}}
        
        # Apply status filter
        if status_filter and status_filter != "all":
            ticket_query["status"] = status_filter
        
        # Apply search filter
        if search:
            search_regex = {"$regex": search, "$options": "i"}
            ticket_query["$or"] = [
                {"ticket_id": search_regex},
                {"title": search_regex},
                {"requester.display_name": search_regex},
                {"workflow_name": search_regex}
            ]
        
        # Get tickets
        tickets_cursor = self._tickets.find(ticket_query)
        tickets_map = {}
        for doc in tickets_cursor:
            doc.pop("_id", None)
            tickets_map[doc.get("ticket_id")] = doc
        
        # Build result - show EACH approval decision (not deduplicated by ticket)
        # This allows same ticket to appear multiple times if manager approved multiple times
        # (e.g., initial approval + parallel branch approvals)
        result = []
        
        for task in approval_tasks:
            ticket_id = task.get("ticket_id")
            if ticket_id not in tickets_map:
                continue
            
            ticket_doc = tickets_map[ticket_id]
            
            # Skip if status filter doesn't match
            if status_filter and status_filter != "all" and ticket_doc.get("status") != status_filter:
                continue
            
            # Skip if search doesn't match
            if search:
                search_lower = search.lower()
                matches = (
                    search_lower in (ticket_doc.get("ticket_id") or "").lower() or
                    search_lower in (ticket_doc.get("title") or "").lower() or
                    search_lower in (ticket_doc.get("requester", {}).get("display_name") or "").lower() or
                    search_lower in (ticket_doc.get("workflow_name") or "").lower()
                )
                if not matches:
                    continue
            
            # Include each approval decision as a separate entry
            result.append({
                "ticket": ticket_doc,
                "approval_decision": task.get("decision"),
                "decided_at": task.get("decided_at"),
                "step_name": task.get("step_name", "Approval"),
                "approval_task_id": task.get("approval_task_id"),
                "ticket_step_id": task.get("ticket_step_id")
            })
        
        # Total is now the count of all approval decisions, not unique tickets
        total = len(result)
        
        # Apply pagination
        paginated = result[skip:skip + limit]
        
        return paginated, len(result)
    
    # =========================================================================
    # Assignment Operations
    # =========================================================================
    
    def create_assignment(self, assignment: Assignment) -> Assignment:
        """Create an assignment record"""
        doc = assignment.model_dump()
        doc["_id"] = assignment.assignment_id
        
        self._assignments.insert_one(doc)
        logger.info(f"Created assignment: {assignment.assignment_id}")
        return assignment
    
    def get_assignments_for_step(self, ticket_step_id: str) -> List[Assignment]:
        """Get assignment history for a step"""
        cursor = self._assignments.find({"ticket_step_id": ticket_step_id}).sort("assigned_at", DESCENDING)
        
        assignments = []
        for doc in cursor:
            doc.pop("_id", None)
            assignments.append(Assignment.model_validate(doc))
        
        return assignments
    
    def get_active_assignment(self, ticket_step_id: str) -> Optional[Assignment]:
        """Get active assignment for a step"""
        doc = self._assignments.find_one({
            "ticket_step_id": ticket_step_id,
            "status": AssignmentStatus.ACTIVE.value
        })
        if doc:
            doc.pop("_id", None)
            return Assignment.model_validate(doc)
        return None
    
    def update_assignment(
        self,
        assignment_id: str,
        updates: Dict[str, Any]
    ) -> Assignment:
        """Update assignment"""
        result = self._assignments.find_one_and_update(
            {"assignment_id": assignment_id},
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Assignment {assignment_id} not found")
        
        result.pop("_id", None)
        return Assignment.model_validate(result)
    
    # =========================================================================
    # Info Request Operations
    # =========================================================================
    
    def create_info_request(self, info_request: InfoRequest) -> InfoRequest:
        """Create an info request"""
        doc = info_request.model_dump()
        doc["_id"] = info_request.info_request_id
        
        self._info_requests.insert_one(doc)
        logger.info(f"Created info request: {info_request.info_request_id}")
        return info_request
    
    def get_info_request(self, info_request_id: str) -> Optional[InfoRequest]:
        """Get info request by ID"""
        doc = self._info_requests.find_one({"info_request_id": info_request_id})
        if doc:
            doc.pop("_id", None)
            return InfoRequest.model_validate(doc)
        return None
    
    def get_open_info_request_for_step(self, ticket_step_id: str) -> Optional[InfoRequest]:
        """Get open info request for a step (only one allowed)"""
        doc = self._info_requests.find_one({
            "ticket_step_id": ticket_step_id,
            "status": InfoRequestStatus.OPEN.value
        })
        if doc:
            doc.pop("_id", None)
            return InfoRequest.model_validate(doc)
        return None
    
    def get_info_requests_for_ticket(self, ticket_id: str) -> List[InfoRequest]:
        """Get all info requests for a ticket"""
        cursor = self._info_requests.find({"ticket_id": ticket_id}).sort("requested_at", DESCENDING)
        
        requests = []
        for doc in cursor:
            doc.pop("_id", None)
            requests.append(InfoRequest.model_validate(doc))
        
        return requests
    
    def get_info_requests_for_user(self, user_email: str, user_aad_id: str = None) -> List[InfoRequest]:
        """Get open info requests directed to a specific user
        
        Searches by AAD ID (if provided) OR email (case-insensitive).
        This handles cases where the same user has multiple email aliases.
        """
        # Build query to match by aad_id OR email
        match_conditions = [
            {"requested_from.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        
        if user_aad_id:
            match_conditions.append({"requested_from.aad_id": user_aad_id})
        
        cursor = self._info_requests.find({
            "$or": match_conditions,
            "status": InfoRequestStatus.OPEN.value
        }).sort("requested_at", DESCENDING)
        
        requests = []
        for doc in cursor:
            doc.pop("_id", None)
            requests.append(InfoRequest.model_validate(doc))
        
        return requests
    
    def update_info_request(
        self,
        info_request_id: str,
        updates: Dict[str, Any]
    ) -> InfoRequest:
        """Update info request"""
        result = self._info_requests.find_one_and_update(
            {"info_request_id": info_request_id},
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Info request {info_request_id} not found")
        
        result.pop("_id", None)
        return InfoRequest.model_validate(result)
    
    # =========================================================================
    # Handover Request Operations
    # =========================================================================
    
    def create_handover_request(self, handover_request: HandoverRequest) -> HandoverRequest:
        """Create a handover request"""
        doc = handover_request.model_dump()
        doc["_id"] = handover_request.handover_request_id
        
        self._handover_requests.insert_one(doc)
        logger.info(f"Created handover request: {handover_request.handover_request_id}")
        return handover_request
    
    def get_handover_request(self, handover_request_id: str) -> Optional[HandoverRequest]:
        """Get handover request by ID"""
        doc = self._handover_requests.find_one({"handover_request_id": handover_request_id})
        if doc:
            doc.pop("_id", None)
            return HandoverRequest.model_validate(doc)
        return None
    
    def get_pending_handover_for_step(self, ticket_step_id: str) -> Optional[HandoverRequest]:
        """Get pending handover request for a step"""
        doc = self._handover_requests.find_one({
            "ticket_step_id": ticket_step_id,
            "status": HandoverRequestStatus.PENDING.value
        })
        if doc:
            doc.pop("_id", None)
            return HandoverRequest.model_validate(doc)
        return None
    
    def get_pending_handovers_for_manager(
        self,
        manager_email: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[HandoverRequest]:
        """Get pending handover requests that manager needs to decide on"""
        # This will need to be cross-referenced with tickets
        cursor = self._handover_requests.find({
            "status": HandoverRequestStatus.PENDING.value
        }).skip(skip).limit(limit)
        
        requests = []
        for doc in cursor:
            doc.pop("_id", None)
            requests.append(HandoverRequest.model_validate(doc))
        
        return requests
    
    def update_handover_request(
        self,
        handover_request_id: str,
        updates: Dict[str, Any]
    ) -> HandoverRequest:
        """Update handover request"""
        result = self._handover_requests.find_one_and_update(
            {"handover_request_id": handover_request_id},
            {"$set": updates},
            return_document=True
        )
        
        if result is None:
            raise NotFoundError(f"Handover request {handover_request_id} not found")
        
        result.pop("_id", None)
        return HandoverRequest.model_validate(result)
    
    # =========================================================================
    # SLA Acknowledgment Operations
    # =========================================================================
    
    def create_sla_acknowledgment(self, acknowledgment: SlaAcknowledgment) -> SlaAcknowledgment:
        """Create an SLA acknowledgment"""
        doc = acknowledgment.model_dump()
        doc["_id"] = acknowledgment.acknowledgment_id
        
        self._sla_acknowledgments.insert_one(doc)
        logger.info(f"Created SLA acknowledgment: {acknowledgment.acknowledgment_id}")
        return acknowledgment
    
    def get_sla_acknowledgment_for_step(self, ticket_step_id: str) -> Optional[SlaAcknowledgment]:
        """Get SLA acknowledgment for a step"""
        doc = self._sla_acknowledgments.find_one({"ticket_step_id": ticket_step_id})
        if doc:
            doc.pop("_id", None)
            return SlaAcknowledgment.model_validate(doc)
        return None
    
    # =========================================================================
    # Dashboard Queries
    # =========================================================================
    
    def get_team_workload(
        self,
        manager_email: str,
        manager_aad_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get team workload statistics for manager.
        
        Includes tickets where:
        1. User is the AD manager of the requester
        2. User has acted as an approver
        3. User has assigned agents
        """
        import re
        email_pattern = re.compile(f"^{re.escape(manager_email)}$", re.IGNORECASE)
        
        # Find ticket IDs where user has acted as approver
        approved_task_ids = set()
        approver_query_conditions = [{"approver.email": {"$regex": email_pattern}}]
        if manager_aad_id:
            approver_query_conditions.append({"approver.aad_id": manager_aad_id})
        
        for task in self._approval_tasks.find({
            "$or": approver_query_conditions,
            "decision": {"$in": ["APPROVED", "REJECTED"]}
        }):
            approved_task_ids.add(task.get("ticket_id"))
        
        # Find ticket IDs where user has assigned agents
        assigned_ticket_ids = set()
        assigner_query_conditions = [{"assigned_by.email": {"$regex": email_pattern}}]
        if manager_aad_id:
            assigner_query_conditions.append({"assigned_by.aad_id": manager_aad_id})
        
        for assignment in self._assignments.find({
            "$or": assigner_query_conditions
        }):
            assigned_ticket_ids.add(assignment.get("ticket_id"))
        
        # Combine all ticket IDs
        all_related_ticket_ids = list(approved_task_ids | assigned_ticket_ids)
        
        # Build query for tickets
        query_conditions = [
            {"manager_snapshot.email": {"$regex": email_pattern}}
        ]
        if manager_aad_id:
            query_conditions.append({"manager_snapshot.aad_id": manager_aad_id})
        if all_related_ticket_ids:
            query_conditions.append({"ticket_id": {"$in": all_related_ticket_ids}})
        
        pipeline = [
            {"$match": {"$or": query_conditions}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        status_counts = {status.value: 0 for status in TicketStatus}
        for doc in self._tickets.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        # Get steps needing assignment (where user can assign)
        unassigned_steps = self._steps.count_documents({
            "step_type": "TASK_STEP",
            "state": StepState.ACTIVE.value,
            "$or": [
                {"assigned_to": None},
                {"assigned_to": {"$exists": False}}
            ]
        })
        
        return {
            "status_counts": status_counts,
            "unassigned_tasks": unassigned_steps,
            "total_tickets": sum(status_counts.values())
        }
    
    def get_agent_workload(self, manager_email: str) -> List[Dict[str, Any]]:
        """Get task counts per agent"""
        pipeline = [
            {
                "$match": {
                    "step_type": "TASK_STEP",
                    "state": {"$in": [StepState.ACTIVE.value, StepState.ON_HOLD.value]},
                    "assigned_to": {"$ne": None}
                }
            },
            {
                "$group": {
                    "_id": {
                        "email": "$assigned_to.email",
                        "display_name": "$assigned_to.display_name",
                        "aad_id": "$assigned_to.aad_id"
                    },
                    "active_count": {
                        "$sum": {"$cond": [{"$eq": ["$state", StepState.ACTIVE.value]}, 1, 0]}
                    },
                    "on_hold_count": {
                        "$sum": {"$cond": [{"$eq": ["$state", StepState.ON_HOLD.value]}, 1, 0]}
                    },
                    "total_count": {"$sum": 1}
                }
            },
            {"$sort": {"total_count": -1}}
        ]
        
        results = []
        for doc in self._steps.aggregate(pipeline):
            results.append({
                "email": doc["_id"].get("email"),
                "display_name": doc["_id"].get("display_name"),
                "aad_id": doc["_id"].get("aad_id"),
                "active_tasks": doc["active_count"],
                "on_hold_tasks": doc["on_hold_count"],
                "total_tasks": doc["total_count"]
            })
        
        return results
    
    def get_steps_on_hold(
        self,
        skip: int = 0,
        limit: int = 50
    ) -> List[TicketStep]:
        """Get steps that are on hold"""
        cursor = self._steps.find({
            "state": StepState.ON_HOLD.value
        }).skip(skip).limit(limit)
        
        steps = []
        for doc in cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def get_overdue_steps(
        self,
        skip: int = 0,
        limit: int = 50
    ) -> List[TicketStep]:
        """Get overdue steps"""
        from datetime import datetime
        now = datetime.utcnow()
        
        cursor = self._steps.find({
            "state": {"$in": [StepState.ACTIVE.value, StepState.WAITING_FOR_APPROVAL.value]},
            "due_at": {"$lt": now}
        }).sort("due_at", ASCENDING).skip(skip).limit(limit)
        
        steps = []
        for doc in cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def get_completed_steps_by_agent(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None,
        date_filter: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[TicketStep]:
        """Get completed TASK steps by agent with optional date filter.
        
        Returns ONLY TASK_STEP steps that are COMPLETED and assigned to the agent.
        Approval steps are NOT included - use get_completed_approvals_by_manager for that.
        """
        from datetime import datetime, timedelta
        from ..domain.enums import StepType, StepState
        
        # Build match conditions for email and aad_id
        match_conditions = []
        if agent_email:
            match_conditions.append(
                {"assigned_to.email": {"$regex": f"^{agent_email}$", "$options": "i"}}
            )
        if agent_aad_id:
            match_conditions.append(
                {"assigned_to.aad_id": agent_aad_id}
            )
        
        if not match_conditions:
            return []
        
        # Query for TASK_STEP that are COMPLETED (not APPROVAL_STEP)
        task_query = {
            "$or": match_conditions,
            "step_type": StepType.TASK_STEP.value,
            "state": StepState.COMPLETED.value
        }
        
        # Apply date filter
        if date_filter:
            now = datetime.utcnow()
            if date_filter == "today":
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif date_filter == "week":
                start_date = now - timedelta(days=7)
            elif date_filter == "month":
                start_date = now - timedelta(days=30)
            else:
                start_date = None
            
            if start_date:
                task_query["completed_at"] = {"$gte": start_date}
        
        # Get completed TASK_STEP steps only
        task_cursor = self._steps.find(task_query).sort("completed_at", DESCENDING).skip(skip).limit(limit)
        
        steps = []
        for doc in task_cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def get_completed_tasks_by_agent(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 20
    ) -> List[TicketStep]:
        """Get completed tasks by this agent."""
        query = {
            "step_type": StepType.TASK_STEP.value,
            "state": StepState.COMPLETED.value
        }
        
        # Match by AAD ID or email
        if agent_aad_id:
            query["$or"] = [
                {"assigned_to.aad_id": agent_aad_id},
                {"assigned_to.email": {"$regex": f"^{agent_email}$", "$options": "i"}}
            ]
        else:
            query["assigned_to.email"] = {"$regex": f"^{agent_email}$", "$options": "i"}
        
        cursor = self._steps.find(query).sort("completed_at", -1).skip(skip).limit(limit)
        
        steps = []
        for doc in cursor:
            doc.pop("_id", None)
            steps.append(TicketStep.model_validate(doc))
        
        return steps
    
    def get_handovers_by_agent(
        self,
        agent_email: str,
        agent_aad_id: Optional[str] = None
    ) -> List[HandoverRequest]:
        """Get handover requests submitted by this agent (pending status)."""
        query = {
            "status": HandoverRequestStatus.PENDING.value
        }
        
        # Match by AAD ID or email
        if agent_aad_id:
            query["$or"] = [
                {"requested_by.aad_id": agent_aad_id},
                {"requested_by.email": {"$regex": f"^{agent_email}$", "$options": "i"}}
            ]
        else:
            query["requested_by.email"] = {"$regex": f"^{agent_email}$", "$options": "i"}
        
        cursor = self._handover_requests.find(query).sort("requested_at", -1)
        
        requests = []
        for doc in cursor:
            doc.pop("_id", None)
            requests.append(HandoverRequest.model_validate(doc))
        
        return requests

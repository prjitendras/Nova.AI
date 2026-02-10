"""Change Request Service - Business logic for change requests"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from pymongo.database import Database

from app.domain.models import UserSnapshot, ActorContext, Ticket
from app.domain.change_request_models import (
    ChangeRequest,
    ChangeRequestStatus,
    FieldChange,
    AttachmentChange,
    FormVersion,
    CreateChangeRequestRequest,
)
from app.domain.enums import TicketStatus, StepType, StepState, AuditEventType, InAppNotificationCategory
from app.repositories.change_request_repo import ChangeRequestRepository


logger = logging.getLogger(__name__)


def _is_same_user(actor: ActorContext, assigned_to: Dict[str, Any]) -> bool:
    """Check if actor matches assigned_to user.
    
    Uses case-insensitive email comparison AND aad_id matching
    to handle users with multiple email aliases (UPN vs primary email).
    """
    assigned_email = assigned_to.get("email", "").lower()
    assigned_aad_id = assigned_to.get("aad_id", "")
    
    # Match by aad_id first (most reliable)
    if actor.aad_id and assigned_aad_id and actor.aad_id == assigned_aad_id:
        return True
    
    # Fall back to case-insensitive email match
    if actor.email.lower() == assigned_email:
        return True
    
    return False


class ChangeRequestService:
    """Service for managing change requests"""
    
    def __init__(self, db: Database):
        self.db = db
        self.cr_repo = ChangeRequestRepository(db)
        self.tickets_collection = db["tickets"]
        self.ticket_steps_collection = db["ticket_steps"]
        self.workflow_versions_collection = db["workflow_versions"]
        self.attachments_collection = db["attachments"]
        self.audit_events_collection = db["audit_events"]
        self.in_app_notifications_collection = db["in_app_notifications"]
        self.notification_outbox_collection = db["notification_outbox"]
    
    def create_change_request(
        self,
        request: CreateChangeRequestRequest,
        actor: ActorContext
    ) -> Dict[str, Any]:
        """
        Create a new change request for a ticket.
        
        Validates:
        - Ticket exists and is IN_PROGRESS
        - No pending CR exists for ticket
        - Actor is the requester
        - Changes exist (not identical to current)
        """
        # Get ticket
        ticket_doc = self.tickets_collection.find_one({"ticket_id": request.ticket_id})
        if not ticket_doc:
            raise ValueError(f"Ticket {request.ticket_id} not found")
        
        ticket_doc.pop("_id", None)
        
        # Validate ticket status
        if ticket_doc.get("status") != TicketStatus.IN_PROGRESS.value:
            raise ValueError(f"Change request can only be created for IN_PROGRESS tickets. Current status: {ticket_doc.get('status')}")
        
        # Validate requester
        requester_email = ticket_doc.get("requester", {}).get("email", "").lower()
        if actor.email.lower() != requester_email:
            raise ValueError("Only the ticket requester can create a change request")
        
        # Check for existing pending CR (with atomic lock to prevent race conditions)
        # Using findOneAndUpdate to atomically check and set a lock flag
        lock_result = self.tickets_collection.find_one_and_update(
            {
                "ticket_id": request.ticket_id,
                "pending_change_request_id": None,
                "$or": [
                    {"_cr_lock": {"$exists": False}},
                    {"_cr_lock": None}
                ]
            },
            {"$set": {"_cr_lock": datetime.utcnow().isoformat()}},
            return_document=False
        )
        
        if not lock_result:
            # Either already has pending CR or is locked
            existing_cr = self.cr_repo.get_pending_for_ticket(request.ticket_id)
            if existing_cr:
                raise ValueError(f"A change request is already pending for this ticket (CR: {existing_cr.get('change_request_id')})")
            raise ValueError("Unable to create change request. Please try again.")
        
        try:
            # Validate first approval is completed before allowing CR
            # This ensures CR is only available after at least one approval step is done
            first_completed_approval = self.ticket_steps_collection.find_one({
                "ticket_id": request.ticket_id,
                "step_type": StepType.APPROVAL_STEP.value,
                "state": "COMPLETED"
            })
            
            if not first_completed_approval:
                # Release lock and raise error
                self.tickets_collection.update_one(
                    {"ticket_id": request.ticket_id},
                    {"$unset": {"_cr_lock": ""}}
                )
                raise ValueError("Change request can only be created after the first approval step is completed")
            
            # Get first approver from workflow
            first_approver = self._get_first_approver(ticket_doc)
            if not first_approver:
                raise ValueError("Could not determine first approver for change request")
            
            # Calculate changes
            current_form_values = ticket_doc.get("form_values", {})
            current_attachments = ticket_doc.get("attachment_ids", [])
            
            field_changes = self._calculate_field_changes(
                ticket_doc,
                current_form_values,
                request.proposed_form_values
            )
            
            attachment_changes = self._calculate_attachment_changes(
                current_attachments,
                request.proposed_attachment_ids
            )
            
            # Ensure there are actual changes
            if not field_changes and not attachment_changes:
                raise ValueError("No changes detected. Please modify at least one field.")
            
            # Create CR
            now = datetime.utcnow()
            cr_id = self.cr_repo.generate_id()
            current_version = ticket_doc.get("form_version", 1)
            
            cr = ChangeRequest(
                change_request_id=cr_id,
                ticket_id=request.ticket_id,
                workflow_id=ticket_doc.get("workflow_id"),
                status=ChangeRequestStatus.PENDING,
                from_version=current_version,
                original_data={
                    "form_values": current_form_values,
                    "attachment_ids": current_attachments
                },
                proposed_data={
                    "form_values": request.proposed_form_values,
                    "attachment_ids": request.proposed_attachment_ids
                },
                field_changes=field_changes,
                attachment_changes=attachment_changes,
                requested_by=UserSnapshot(
                    aad_id=actor.aad_id,
                    email=actor.email,
                    display_name=actor.display_name
                ),
                reason=request.reason,
                requested_at=now,
                assigned_to=first_approver,
                created_at=now,
                updated_at=now
            )
            
            self.cr_repo.create(cr)
            
            # Update ticket with pending CR reference and remove lock
            # Note: Use datetime object (not .isoformat() string) for proper sorting
            self.tickets_collection.update_one(
                {"ticket_id": request.ticket_id},
                {
                    "$set": {
                        "pending_change_request_id": cr_id,
                        "updated_at": now
                    },
                    "$unset": {"_cr_lock": ""}
                }
            )
            
            # Create audit event
            self._create_audit_event(
                ticket_id=request.ticket_id,
                event_type="CHANGE_REQUEST_CREATED",
                actor=actor,
                details={
                    "change_request_id": cr_id,
                    "reason": request.reason,
                    "field_changes_count": len(field_changes),
                    "attachment_changes_count": len(attachment_changes),
                    "assigned_to": first_approver.email
                }
            )
            
            # Send notifications
            self._send_cr_created_notifications(cr, ticket_doc)
            
            # PAUSE WORKFLOW: Set all active steps to WAITING_FOR_CR
            # This ensures the main ticket waits until CR is resolved
            # Wrap in try-catch so pause failure doesn't fail the entire CR creation
            try:
                paused_steps = self._pause_workflow_for_cr(
                    ticket_id=request.ticket_id,
                    cr_id=cr_id,
                    actor=actor,
                    ticket_doc=ticket_doc
                )
                
                logger.info(
                    f"Created CR {cr_id} and paused {len(paused_steps)} steps for ticket {request.ticket_id}",
                    extra={"ticket_id": request.ticket_id, "cr_id": cr_id, "paused_steps": len(paused_steps)}
                )
            except Exception as pause_error:
                # Log the error but don't fail the CR creation
                # The CR is already created, we'll just not have the pause
                logger.error(
                    f"Failed to pause workflow for CR {cr_id}: {pause_error}",
                    extra={"ticket_id": request.ticket_id, "cr_id": cr_id},
                    exc_info=True
                )
            
            return cr.model_dump(mode="json")
        
        except Exception as e:
            # Release lock on any error
            self.tickets_collection.update_one(
                {"ticket_id": request.ticket_id},
                {"$unset": {"_cr_lock": ""}}
            )
            raise
    
    def get_change_request(self, cr_id: str) -> Optional[Dict[str, Any]]:
        """Get a change request by ID"""
        return self.cr_repo.get_by_id(cr_id)
    
    def get_change_request_detail(self, cr_id: str) -> Optional[Dict[str, Any]]:
        """Get change request with ticket details"""
        cr = self.cr_repo.get_by_id(cr_id)
        if not cr:
            return None
        
        ticket = self.tickets_collection.find_one({"ticket_id": cr.get("ticket_id")})
        if ticket:
            ticket.pop("_id", None)
        
        return {
            "change_request": cr,
            "ticket_title": ticket.get("title") if ticket else "",
            "ticket_status": ticket.get("status") if ticket else "",
            "workflow_name": ticket.get("workflow_name") if ticket else ""
        }
    
    def get_pending_for_approver(
        self,
        approver_email: str,
        skip: int = 0,
        limit: int = 50,
        approver_aad_id: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get pending CRs for an approver with ticket details.
        
        Supports matching by both email (case-insensitive) and aad_id
        to handle users with multiple email aliases.
        """
        crs = self.cr_repo.get_pending_for_approver(approver_email, skip, limit, approver_aad_id)
        total = self.cr_repo.count_pending_for_approver(approver_email, approver_aad_id)
        
        # Enrich with ticket details
        for cr in crs:
            ticket = self.tickets_collection.find_one({"ticket_id": cr.get("ticket_id")})
            if ticket:
                cr["ticket_title"] = ticket.get("title")
                cr["ticket_status"] = ticket.get("status")
                cr["workflow_name"] = ticket.get("workflow_name")
        
        return crs, total
    
    def approve_change_request(
        self,
        cr_id: str,
        actor: ActorContext,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve a change request.
        
        This:
        1. Validates the CR and actor permissions
        2. Creates a version snapshot of current data
        3. Updates ticket form_values with proposed data
        4. Marks CR as approved
        5. Sends notifications
        """
        cr = self.cr_repo.get_by_id(cr_id)
        if not cr:
            raise ValueError(f"Change request {cr_id} not found")
        
        if cr.get("status") != ChangeRequestStatus.PENDING.value:
            raise ValueError(f"Change request is not pending. Current status: {cr.get('status')}")
        
        # Validate approver (case-insensitive email match OR aad_id match)
        assigned_to = cr.get("assigned_to", {})
        if not _is_same_user(actor, assigned_to):
            raise ValueError("You are not authorized to approve this change request")
        
        # Get ticket
        ticket_id = cr.get("ticket_id")
        ticket_doc = self.tickets_collection.find_one({"ticket_id": ticket_id})
        if not ticket_doc:
            raise ValueError(f"Ticket {ticket_id} not found")
        
        ticket_doc.pop("_id", None)
        
        # Check ticket is still active (either IN_PROGRESS or WAITING_FOR_CR)
        valid_statuses = [TicketStatus.IN_PROGRESS.value, TicketStatus.WAITING_FOR_CR.value]
        if ticket_doc.get("status") not in valid_statuses:
            raise ValueError(f"Cannot approve CR - ticket status is {ticket_doc.get('status')}")
        
        now = datetime.utcnow()
        current_version = ticket_doc.get("form_version", 1)
        new_version = current_version + 1
        
        # Build version history
        form_versions = ticket_doc.get("form_versions") or []
        
        # If this is first CR, add original as version 1
        if not form_versions:
            original_version = {
                "version": 1,
                "form_values": cr.get("original_data", {}).get("form_values", {}),
                "attachment_ids": cr.get("original_data", {}).get("attachment_ids", []),
                "created_at": ticket_doc.get("created_at"),
                "created_by": ticket_doc.get("requester"),
                "source": "ORIGINAL"
            }
            form_versions.append(original_version)
        
        # Add new version
        # Use datetime object (not .isoformat() string) for consistent storage
        new_version_entry = {
            "version": new_version,
            "form_values": cr.get("proposed_data", {}).get("form_values", {}),
            "attachment_ids": cr.get("proposed_data", {}).get("attachment_ids", []),
            "created_at": now,  # datetime object for proper MongoDB storage
            "created_by": cr.get("requested_by"),
            "source": "CHANGE_REQUEST",
            "change_request_id": cr_id,
            "approved_by": {
                "aad_id": actor.aad_id,
                "email": actor.email,
                "display_name": actor.display_name
            },
            "field_changes": cr.get("field_changes", []),
            "attachment_changes": cr.get("attachment_changes", [])
        }
        form_versions.append(new_version_entry)
        
        # Update ticket with new data
        self.tickets_collection.update_one(
            {"ticket_id": ticket_id},
            {"$set": {
                "form_values": cr.get("proposed_data", {}).get("form_values", {}),
                "attachment_ids": cr.get("proposed_data", {}).get("attachment_ids", []),
                "form_version": new_version,
                "form_versions": form_versions,
                "pending_change_request_id": None,
                "updated_at": now
            }}
        )
        
        # Update CR as approved
        reviewer = {
            "aad_id": actor.aad_id,
            "email": actor.email,
            "display_name": actor.display_name
        }
        self.cr_repo.approve(cr_id, reviewer, notes, new_version)
        
        # Create audit event
        self._create_audit_event(
            ticket_id=ticket_id,
            event_type="CHANGE_REQUEST_APPROVED",
            actor=actor,
            details={
                "change_request_id": cr_id,
                "from_version": current_version,
                "to_version": new_version,
                "review_notes": notes,
                "field_changes_count": len(cr.get("field_changes", [])),
                "attachment_changes_count": len(cr.get("attachment_changes", []))
            }
        )
        
        # Send notifications
        self._send_cr_approved_notifications(cr, ticket_doc, actor, notes)
        
        # RESUME WORKFLOW: Restore all paused steps to their previous states
        resumed_steps = self._resume_workflow_after_cr(
            ticket_id=ticket_id,
            cr_id=cr_id,
            actor=actor,
            ticket_doc=ticket_doc,
            resolution="APPROVED"
        )
        
        logger.info(
            f"Approved CR {cr_id} and resumed {len(resumed_steps)} steps for ticket {ticket_id}",
            extra={"ticket_id": ticket_id, "cr_id": cr_id, "resumed_steps": len(resumed_steps)}
        )
        
        # Return updated CR
        return self.cr_repo.get_by_id(cr_id)
    
    def reject_change_request(
        self,
        cr_id: str,
        actor: ActorContext,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Reject a change request"""
        cr = self.cr_repo.get_by_id(cr_id)
        if not cr:
            raise ValueError(f"Change request {cr_id} not found")
        
        if cr.get("status") != ChangeRequestStatus.PENDING.value:
            raise ValueError(f"Change request is not pending. Current status: {cr.get('status')}")
        
        # Validate approver (case-insensitive email match OR aad_id match)
        assigned_to = cr.get("assigned_to", {})
        if not _is_same_user(actor, assigned_to):
            raise ValueError("You are not authorized to reject this change request")
        
        ticket_id = cr.get("ticket_id")
        
        # Update ticket to clear pending CR
        self.tickets_collection.update_one(
            {"ticket_id": ticket_id},
            {"$set": {
                "pending_change_request_id": None,
                "updated_at": datetime.utcnow()
            }}
        )
        
        # Update CR as rejected
        reviewer = {
            "aad_id": actor.aad_id,
            "email": actor.email,
            "display_name": actor.display_name
        }
        self.cr_repo.reject(cr_id, reviewer, notes)
        
        # Create audit event
        self._create_audit_event(
            ticket_id=ticket_id,
            event_type="CHANGE_REQUEST_REJECTED",
            actor=actor,
            details={
                "change_request_id": cr_id,
                "review_notes": notes
            }
        )
        
        # Get ticket for notifications and resume
        ticket_doc = self.tickets_collection.find_one({"ticket_id": ticket_id})
        if ticket_doc:
            ticket_doc.pop("_id", None)
            
            # Send rejection notifications
            self._send_cr_rejected_notifications(cr, ticket_doc, actor, notes)
            
            # RESUME WORKFLOW: Restore all paused steps to their previous states
            resumed_steps = self._resume_workflow_after_cr(
                ticket_id=ticket_id,
                cr_id=cr_id,
                actor=actor,
                ticket_doc=ticket_doc,
                resolution="REJECTED"
            )
            
            logger.info(
                f"Rejected CR {cr_id} and resumed {len(resumed_steps)} steps for ticket {ticket_id}",
                extra={"ticket_id": ticket_id, "cr_id": cr_id, "resumed_steps": len(resumed_steps)}
            )
        
        return self.cr_repo.get_by_id(cr_id)
    
    def cancel_change_request(
        self,
        cr_id: str,
        actor: ActorContext
    ) -> Dict[str, Any]:
        """Cancel a change request (by requester)"""
        cr = self.cr_repo.get_by_id(cr_id)
        if not cr:
            raise ValueError(f"Change request {cr_id} not found")
        
        if cr.get("status") != ChangeRequestStatus.PENDING.value:
            raise ValueError(f"Change request is not pending. Current status: {cr.get('status')}")
        
        # Validate requester
        requester_email = cr.get("requested_by", {}).get("email", "").lower()
        if actor.email.lower() != requester_email:
            raise ValueError("Only the requester can cancel their change request")
        
        ticket_id = cr.get("ticket_id")
        
        # Update ticket to clear pending CR
        self.tickets_collection.update_one(
            {"ticket_id": ticket_id},
            {"$set": {
                "pending_change_request_id": None,
                "updated_at": datetime.utcnow()
            }}
        )
        
        # Cancel CR
        self.cr_repo.cancel(cr_id)
        
        # Create audit event
        self._create_audit_event(
            ticket_id=ticket_id,
            event_type="CHANGE_REQUEST_CANCELLED",
            actor=actor,
            details={"change_request_id": cr_id}
        )
        
        # Get ticket for notification and resume
        ticket_doc = self.tickets_collection.find_one({"ticket_id": ticket_id})
        if ticket_doc:
            ticket_doc.pop("_id", None)
            
            # Notify approver
            self._send_cr_cancelled_notification(cr, ticket_doc)
            
            # RESUME WORKFLOW: Restore all paused steps to their previous states
            resumed_steps = self._resume_workflow_after_cr(
                ticket_id=ticket_id,
                cr_id=cr_id,
                actor=actor,
                ticket_doc=ticket_doc,
                resolution="CANCELLED"
            )
            
            logger.info(
                f"Cancelled CR {cr_id} and resumed {len(resumed_steps)} steps for ticket {ticket_id}",
                extra={"ticket_id": ticket_id, "cr_id": cr_id, "resumed_steps": len(resumed_steps)}
            )
        
        return self.cr_repo.get_by_id(cr_id)
    
    def get_ticket_versions(self, ticket_id: str) -> List[Dict[str, Any]]:
        """Get all form versions for a ticket"""
        ticket_doc = self.tickets_collection.find_one({"ticket_id": ticket_id})
        if not ticket_doc:
            return []
        
        form_versions = ticket_doc.get("form_versions") or []
        
        # If no versions yet, return current as version 1
        if not form_versions:
            return [{
                "version": ticket_doc.get("form_version", 1),
                "form_values": ticket_doc.get("form_values", {}),
                "attachment_ids": ticket_doc.get("attachment_ids", []),
                "created_at": ticket_doc.get("created_at"),
                "created_by": ticket_doc.get("requester"),
                "source": "ORIGINAL"
            }]
        
        return form_versions
    
    def compare_versions(
        self,
        ticket_id: str,
        version_1: int,
        version_2: int
    ) -> Dict[str, Any]:
        """Compare two versions of ticket form data"""
        # Validate version numbers
        if version_1 < 1 or version_2 < 1:
            raise ValueError("Version numbers must be positive integers")
        
        if version_1 == version_2:
            raise ValueError("Cannot compare a version with itself")
        
        # Ensure version_1 < version_2 for consistent comparison direction
        # (older version first, newer version second)
        if version_1 > version_2:
            version_1, version_2 = version_2, version_1
        
        versions = self.get_ticket_versions(ticket_id)
        
        if not versions:
            raise ValueError(f"No versions found for ticket {ticket_id}")
        
        v1_data = None
        v2_data = None
        
        for v in versions:
            if v.get("version") == version_1:
                v1_data = v
            if v.get("version") == version_2:
                v2_data = v
        
        if not v1_data:
            raise ValueError(f"Version {version_1} not found for ticket {ticket_id}")
        if not v2_data:
            raise ValueError(f"Version {version_2} not found for ticket {ticket_id}")
        
        ticket_doc = self.tickets_collection.find_one({"ticket_id": ticket_id})
        if not ticket_doc:
            raise ValueError(f"Ticket {ticket_id} not found")
        ticket_doc.pop("_id", None)
        
        field_changes = self._calculate_field_changes(
            ticket_doc,
            v1_data.get("form_values", {}),
            v2_data.get("form_values", {})
        )
        
        attachment_changes = self._calculate_attachment_changes(
            v1_data.get("attachment_ids", []),
            v2_data.get("attachment_ids", [])
        )
        
        return {
            "version_1": v1_data,
            "version_2": v2_data,
            "field_changes": [fc.model_dump() if hasattr(fc, 'model_dump') else fc for fc in field_changes],
            "attachment_changes": [ac.model_dump() if hasattr(ac, 'model_dump') else ac for ac in attachment_changes]
        }
    
    def get_cr_history_for_ticket(self, ticket_id: str) -> List[Dict[str, Any]]:
        """Get change request history for a ticket"""
        return self.cr_repo.get_history_for_ticket(ticket_id, include_pending=True)
    
    # ============================================================================
    # Private Helper Methods
    # ============================================================================
    
    def _get_first_approver(self, ticket_doc: Dict[str, Any]) -> Optional[UserSnapshot]:
        """
        Get the first approver from the ticket's workflow.
        This is the person assigned to the first APPROVAL step in the ticket's history.
        """
        ticket_id = ticket_doc.get("ticket_id")
        
        # Get ticket steps, find first approval step that was completed or is active
        steps = list(self.ticket_steps_collection.find({
            "ticket_id": ticket_id,
            "step_type": StepType.APPROVAL_STEP.value
        }).sort("started_at", 1))
        
        if steps:
            first_approval_step = steps[0]
            assigned_to = first_approval_step.get("assigned_to")
            if assigned_to:
                return UserSnapshot(
                    aad_id=assigned_to.get("aad_id"),
                    email=assigned_to.get("email"),
                    display_name=assigned_to.get("display_name")
                )
        
        # Fallback: Get from workflow definition
        workflow_version_id = ticket_doc.get("workflow_version_id")
        if workflow_version_id:
            wf_version = self.workflow_versions_collection.find_one({
                "workflow_version_id": workflow_version_id
            })
            if wf_version:
                definition = wf_version.get("definition", {})
                steps_def = definition.get("steps", [])
                
                for step in steps_def:
                    if step.get("step_type") == StepType.APPROVAL_STEP.value:
                        # Try to get specific approver
                        if step.get("specific_approver_email"):
                            return UserSnapshot(
                                aad_id=step.get("specific_approver_aad_id"),
                                email=step.get("specific_approver_email"),
                                display_name=step.get("specific_approver_display_name") or step.get("specific_approver_email")
                            )
                        # Try SPOC
                        if step.get("spoc_email"):
                            return UserSnapshot(
                                email=step.get("spoc_email"),
                                display_name=step.get("spoc_email")
                            )
                        # Fall back to requester's manager
                        manager = ticket_doc.get("manager_snapshot")
                        if manager:
                            return UserSnapshot(
                                aad_id=manager.get("aad_id"),
                                email=manager.get("email"),
                                display_name=manager.get("display_name")
                            )
        
        # Last resort: requester's manager from ticket
        manager = ticket_doc.get("manager_snapshot")
        if manager:
            return UserSnapshot(
                aad_id=manager.get("aad_id"),
                email=manager.get("email"),
                display_name=manager.get("display_name")
            )
        
        return None
    
    def _calculate_field_changes(
        self,
        ticket_doc: Dict[str, Any],
        old_values: Dict[str, Any],
        new_values: Dict[str, Any]
    ) -> List[FieldChange]:
        """Calculate which fields changed between old and new values"""
        changes = []
        
        # Get workflow definition for field labels
        field_labels = self._get_field_labels(ticket_doc)
        
        # Check all keys in both old and new
        all_step_ids = set(old_values.keys()) | set(new_values.keys())
        
        for step_id in all_step_ids:
            old_step_data = old_values.get(step_id, {})
            new_step_data = new_values.get(step_id, {})
            
            # Handle both dict and list (repeating sections)
            if isinstance(old_step_data, dict) and isinstance(new_step_data, dict):
                all_fields = set(old_step_data.keys()) | set(new_step_data.keys())
                
                for field_key in all_fields:
                    old_val = old_step_data.get(field_key)
                    new_val = new_step_data.get(field_key)
                    
                    if old_val != new_val:
                        changes.append(FieldChange(
                            form_name=field_labels.get(step_id, {}).get("_step_name", step_id),
                            step_id=step_id,
                            field_key=field_key,
                            field_label=field_labels.get(step_id, {}).get(field_key, field_key),
                            old_value=old_val,
                            new_value=new_val
                        ))
            elif old_step_data != new_step_data:
                # Entire step data changed (could be repeating section)
                changes.append(FieldChange(
                    form_name=field_labels.get(step_id, {}).get("_step_name", step_id),
                    step_id=step_id,
                    field_key="_section_data",
                    field_label="Section Data",
                    old_value=old_step_data,
                    new_value=new_step_data
                ))
        
        return changes
    
    def _calculate_attachment_changes(
        self,
        old_ids: List[str],
        new_ids: List[str]
    ) -> List[AttachmentChange]:
        """Calculate attachment changes"""
        changes = []
        old_set = set(old_ids)
        new_set = set(new_ids)
        
        # Get attachment details
        all_ids = list(old_set | new_set)
        attachments = {
            a["attachment_id"]: a
            for a in self.attachments_collection.find({"attachment_id": {"$in": all_ids}})
        }
        
        # Added
        for att_id in new_set - old_set:
            att = attachments.get(att_id, {})
            changes.append(AttachmentChange(
                attachment_id=att_id,
                filename=att.get("original_filename", att_id),
                action="ADDED"
            ))
        
        # Removed
        for att_id in old_set - new_set:
            att = attachments.get(att_id, {})
            changes.append(AttachmentChange(
                attachment_id=att_id,
                filename=att.get("original_filename", att_id),
                action="REMOVED"
            ))
        
        return changes
    
    def _get_field_labels(self, ticket_doc: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
        """Get field labels from workflow definition"""
        labels = {}
        
        workflow_version_id = ticket_doc.get("workflow_version_id")
        if not workflow_version_id:
            return labels
        
        wf_version = self.workflow_versions_collection.find_one({
            "workflow_version_id": workflow_version_id
        })
        if not wf_version:
            return labels
        
        definition = wf_version.get("definition", {})
        steps = definition.get("steps", [])
        
        for step in steps:
            step_id = step.get("step_id")
            step_name = step.get("step_name", step_id)
            
            labels[step_id] = {"_step_name": step_name}
            
            fields = step.get("fields", [])
            for field in fields:
                field_key = field.get("field_key")
                field_label = field.get("field_label", field_key)
                labels[step_id][field_key] = field_label
        
        return labels
    
    def _create_audit_event(
        self,
        ticket_id: str,
        event_type: str,
        actor: ActorContext,
        details: Dict[str, Any]
    ):
        """Create an audit event"""
        import uuid
        event = {
            "audit_event_id": f"AE-{uuid.uuid4().hex[:12]}",
            "ticket_id": ticket_id,
            "event_type": event_type,
            "actor": {
                "aad_id": actor.aad_id,
                "email": actor.email,
                "display_name": actor.display_name
            },
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        }
        self.audit_events_collection.insert_one(event)
    
    def _send_cr_created_notifications(
        self,
        cr: ChangeRequest,
        ticket_doc: Dict[str, Any]
    ):
        """Send notifications when CR is created - to approver AND requester confirmation"""
        import uuid
        now = datetime.utcnow()
        
        # Serialize field changes for email
        field_changes_data = []
        for fc in cr.field_changes:
            field_changes_data.append({
                "field_key": fc.field_key,
                "field_label": fc.field_label,
                "old_value": fc.old_value,
                "new_value": fc.new_value,
                "step_id": fc.step_id
            })
        
        # ========== APPROVER NOTIFICATIONS ==========
        # In-app notification to approver
        self.in_app_notifications_collection.insert_one({
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
            "recipient_email": cr.assigned_to.email,
            "category": InAppNotificationCategory.APPROVAL.value,
            "title": "Change Request Pending",
            "message": f"A change request for ticket {ticket_doc.get('title')} requires your review.",
            "ticket_id": cr.ticket_id,
            "action_url": f"/manager/change-requests",
            "actor_email": cr.requested_by.email,
            "actor_display_name": cr.requested_by.display_name,
            "is_read": False,
            "created_at": now.isoformat()
        })
        
        # Email notification to approver
        self.notification_outbox_collection.insert_one({
            "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
            "ticket_id": cr.ticket_id,
            "notification_type": "EMAIL",
            "template_key": "CHANGE_REQUEST_PENDING",
            "recipients": [cr.assigned_to.email],
            "payload": {
                "ticket_id": cr.ticket_id,
                "ticket_title": ticket_doc.get("title"),
                "change_request_id": cr.change_request_id,
                "requester_name": cr.requested_by.display_name,
                "reason": cr.reason,
                "field_changes_count": len(cr.field_changes),
                "attachment_changes_count": len(cr.attachment_changes),
                "field_changes": field_changes_data
            },
            "status": "PENDING",
            "retry_count": 0,
            "created_at": now.isoformat()
        })
        
        # ========== REQUESTER CONFIRMATION ==========
        # In-app notification to requester (confirmation)
        self.in_app_notifications_collection.insert_one({
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
            "recipient_email": cr.requested_by.email,
            "category": InAppNotificationCategory.TICKET.value,
            "title": "Change Request Submitted",
            "message": f"Your change request for {ticket_doc.get('title')} has been submitted to {cr.assigned_to.display_name} for approval.",
            "ticket_id": cr.ticket_id,
            "action_url": f"/tickets/{cr.ticket_id}",
            "actor_email": cr.requested_by.email,
            "actor_display_name": cr.requested_by.display_name,
            "is_read": False,
            "created_at": now.isoformat()
        })
        
        # Email confirmation to requester
        self.notification_outbox_collection.insert_one({
            "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
            "ticket_id": cr.ticket_id,
            "notification_type": "EMAIL",
            "template_key": "CHANGE_REQUEST_SUBMITTED",
            "recipients": [cr.requested_by.email],
            "payload": {
                "ticket_id": cr.ticket_id,
                "ticket_title": ticket_doc.get("title"),
                "change_request_id": cr.change_request_id,
                "assigned_to_name": cr.assigned_to.display_name,
                "reason": cr.reason,
                "field_changes_count": len(cr.field_changes),
                "attachment_changes_count": len(cr.attachment_changes)
            },
            "status": "PENDING",
            "retry_count": 0,
            "created_at": now.isoformat()
        })
    
    def _send_cr_approved_notifications(
        self,
        cr: Dict[str, Any],
        ticket_doc: Dict[str, Any],
        approver: ActorContext,
        notes: Optional[str]
    ):
        """Send notifications when CR is approved"""
        import uuid
        now = datetime.utcnow()
        requester_email = cr.get("requested_by", {}).get("email")
        ticket_id = cr.get("ticket_id")
        
        # In-app notification to requester
        self.in_app_notifications_collection.insert_one({
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
            "recipient_email": requester_email,
            "category": InAppNotificationCategory.TICKET.value,
            "title": "Change Request Approved",
            "message": f"Your change request for ticket {ticket_doc.get('title')} has been approved.",
            "ticket_id": ticket_id,
            "action_url": f"/tickets/{ticket_id}",
            "actor_email": approver.email,
            "actor_display_name": approver.display_name,
            "is_read": False,
            "created_at": now.isoformat()
        })
        
        # Email notification to requester
        self.notification_outbox_collection.insert_one({
            "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
            "ticket_id": ticket_id,
            "notification_type": "EMAIL",
            "template_key": "CHANGE_REQUEST_APPROVED",
            "recipients": [requester_email],
            "payload": {
                "ticket_id": ticket_id,
                "ticket_title": ticket_doc.get("title"),
                "change_request_id": cr.get("change_request_id"),
                "approver_name": approver.display_name,
                "notes": notes,
                "field_changes_count": len(cr.get("field_changes", [])),
                "new_version": ticket_doc.get("form_version", 2)
            },
            "status": "PENDING",
            "retry_count": 0,
            "created_at": now.isoformat()
        })
        
        # Notify all stakeholders (current step assignee, past approvers)
        self._notify_stakeholders(
            ticket_doc,
            "Ticket Data Updated",
            f"Ticket {ticket_doc.get('title')} data has been updated via an approved change request.",
            approver
        )
    
    def _send_cr_rejected_notifications(
        self,
        cr: Dict[str, Any],
        ticket_doc: Dict[str, Any],
        rejector: ActorContext,
        notes: Optional[str]
    ):
        """Send notifications when CR is rejected"""
        import uuid
        now = datetime.utcnow()
        requester_email = cr.get("requested_by", {}).get("email")
        ticket_id = cr.get("ticket_id")
        
        # In-app notification to requester
        self.in_app_notifications_collection.insert_one({
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
            "recipient_email": requester_email,
            "category": InAppNotificationCategory.TICKET.value,
            "title": "Change Request Rejected",
            "message": f"Your change request for ticket {ticket_doc.get('title')} has been rejected." + (f" Reason: {notes}" if notes else ""),
            "ticket_id": ticket_id,
            "action_url": f"/tickets/{ticket_id}",
            "actor_email": rejector.email,
            "actor_display_name": rejector.display_name,
            "is_read": False,
            "created_at": now.isoformat()
        })
        
        # Email notification to requester
        self.notification_outbox_collection.insert_one({
            "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
            "ticket_id": ticket_id,
            "notification_type": "EMAIL",
            "template_key": "CHANGE_REQUEST_REJECTED",
            "recipients": [requester_email],
            "payload": {
                "ticket_id": ticket_id,
                "ticket_title": ticket_doc.get("title"),
                "change_request_id": cr.get("change_request_id"),
                "rejector_name": rejector.display_name,
                "notes": notes or "No reason provided"
            },
            "status": "PENDING",
            "retry_count": 0,
            "created_at": now.isoformat()
        })
    
    def _send_cr_cancelled_notification(self, cr: Dict[str, Any], ticket_doc: Optional[Dict[str, Any]] = None):
        """Send notification when CR is cancelled by requester"""
        import uuid
        now = datetime.utcnow()
        approver_email = cr.get("assigned_to", {}).get("email")
        requester = cr.get("requested_by", {})
        ticket_id = cr.get("ticket_id")
        ticket_title = ticket_doc.get("title") if ticket_doc else ticket_id
        
        # In-app notification to approver
        self.in_app_notifications_collection.insert_one({
            "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
            "recipient_email": approver_email,
            "category": InAppNotificationCategory.TICKET.value,
            "title": "Change Request Cancelled",
            "message": f"Change request {cr.get('change_request_id')} has been cancelled by the requester.",
            "ticket_id": ticket_id,
            "action_url": f"/tickets/{ticket_id}",
            "actor_email": requester.get("email"),
            "actor_display_name": requester.get("display_name"),
            "is_read": False,
            "created_at": now.isoformat()
        })
        
        # Email notification to approver
        self.notification_outbox_collection.insert_one({
            "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
            "ticket_id": ticket_id,
            "notification_type": "EMAIL",
            "template_key": "CHANGE_REQUEST_CANCELLED",
            "recipients": [approver_email],
            "payload": {
                "ticket_id": ticket_id,
                "ticket_title": ticket_title,
                "change_request_id": cr.get("change_request_id"),
                "requester_name": requester.get("display_name", "The requester")
            },
            "status": "PENDING",
            "retry_count": 0,
            "created_at": now.isoformat()
        })
    
    def _notify_stakeholders(
        self,
        ticket_doc: Dict[str, Any],
        title: str,
        message: str,
        actor: ActorContext
    ):
        """Notify all relevant stakeholders about ticket update"""
        import uuid
        now = datetime.utcnow()
        ticket_id = ticket_doc.get("ticket_id")
        
        # Get current step assignees
        notified = set()
        current_step_ids = ticket_doc.get("current_step_ids", [])
        if ticket_doc.get("current_step_id"):
            current_step_ids.append(ticket_doc.get("current_step_id"))
        
        for step_id in current_step_ids:
            step = self.ticket_steps_collection.find_one({
                "ticket_id": ticket_id,
                "step_id": step_id
            })
            if step and step.get("assigned_to"):
                email = step["assigned_to"].get("email")
                if email and email.lower() != actor.email.lower() and email not in notified:
                    notified.add(email)
                    self.in_app_notifications_collection.insert_one({
                        "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
                        "recipient_email": email,
                        "category": InAppNotificationCategory.TICKET.value,
                        "title": title,
                        "message": message,
                        "ticket_id": ticket_id,
                        "action_url": f"/tickets/{ticket_id}",
                        "actor_email": actor.email,
                        "actor_display_name": actor.display_name,
                        "is_read": False,
                        "created_at": now.isoformat()
                    })
    
    def _pause_workflow_for_cr(
        self,
        ticket_id: str,
        cr_id: str,
        actor: ActorContext,
        ticket_doc: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Pause all active/waiting steps when a Change Request is raised.
        
        This sets all non-terminal steps to WAITING_FOR_CR and stores their
        previous states for restoration when CR is resolved.
        
        Returns list of paused steps with their previous states.
        """
        import uuid
        now = datetime.utcnow()
        
        # States that should be paused (active/waiting states, not terminal or already waiting for CR)
        pausable_states = [
            StepState.ACTIVE.value,
            StepState.WAITING_FOR_APPROVAL.value,
            StepState.WAITING_FOR_REQUESTER.value,
            StepState.WAITING_FOR_AGENT.value,
            StepState.WAITING_FOR_BRANCHES.value
        ]
        
        # Find all steps that need to be paused
        steps_to_pause = list(self.ticket_steps_collection.find({
            "ticket_id": ticket_id,
            "state": {"$in": pausable_states}
        }))
        
        paused_steps = []
        
        for step in steps_to_pause:
            step_id = step.get("ticket_step_id")
            previous_state = step.get("state")
            
            # Store previous state and set to WAITING_FOR_CR
            self.ticket_steps_collection.update_one(
                {"ticket_step_id": step_id},
                {
                    "$set": {
                        "state": StepState.WAITING_FOR_CR.value,
                        "previous_state": previous_state,
                        "cr_pause_info": {
                            "change_request_id": cr_id,
                            "paused_at": now.isoformat(),
                            "paused_by": actor.email
                        }
                    }
                }
            )
            
            paused_steps.append({
                "ticket_step_id": step_id,
                "step_id": step.get("step_id"),
                "step_name": step.get("step_name"),
                "step_type": step.get("step_type"),
                "previous_state": previous_state,
                "assigned_to": step.get("assigned_to")
            })
            
            logger.info(
                f"Paused step {step_id} for CR {cr_id}: {previous_state} -> WAITING_FOR_CR",
                extra={"ticket_id": ticket_id, "step_id": step_id}
            )
        
        # Update ticket status to WAITING_FOR_CR
        self.tickets_collection.update_one(
            {"ticket_id": ticket_id},
            {
                "$set": {
                    "status": TicketStatus.WAITING_FOR_CR.value,
                    "previous_status": ticket_doc.get("status"),
                    "updated_at": now
                }
            }
        )
        
        # Create audit event for workflow pause
        self._create_audit_event(
            ticket_id=ticket_id,
            event_type="CHANGE_REQUEST_WORKFLOW_PAUSED",
            actor=actor,
            details={
                "change_request_id": cr_id,
                "paused_steps_count": len(paused_steps),
                "paused_steps": [s["step_id"] for s in paused_steps]
            }
        )
        
        # Notify all parties that workflow is paused
        self._send_workflow_paused_notifications(
            ticket_doc=ticket_doc,
            paused_steps=paused_steps,
            cr_id=cr_id,
            actor=actor
        )
        
        return paused_steps
    
    def _resume_workflow_after_cr(
        self,
        ticket_id: str,
        cr_id: str,
        actor: ActorContext,
        ticket_doc: Dict[str, Any],
        resolution: str  # "APPROVED", "REJECTED", or "CANCELLED"
    ) -> List[Dict[str, Any]]:
        """
        Resume workflow after a Change Request is resolved.
        
        Restores all steps from WAITING_FOR_CR back to their previous states.
        
        Returns list of resumed steps.
        """
        import uuid
        now = datetime.utcnow()
        
        # Find all steps that are waiting for CR
        steps_to_resume = list(self.ticket_steps_collection.find({
            "ticket_id": ticket_id,
            "state": StepState.WAITING_FOR_CR.value
        }))
        
        resumed_steps = []
        
        for step in steps_to_resume:
            step_id = step.get("ticket_step_id")
            previous_state = step.get("previous_state") or StepState.ACTIVE.value
            
            # Restore to previous state and clear CR pause info
            self.ticket_steps_collection.update_one(
                {"ticket_step_id": step_id},
                {
                    "$set": {
                        "state": previous_state
                    },
                    "$unset": {
                        "previous_state": "",
                        "cr_pause_info": ""
                    }
                }
            )
            
            resumed_steps.append({
                "ticket_step_id": step_id,
                "step_id": step.get("step_id"),
                "step_name": step.get("step_name"),
                "step_type": step.get("step_type"),
                "restored_state": previous_state,
                "assigned_to": step.get("assigned_to")
            })
            
            logger.info(
                f"Resumed step {step_id} after CR {cr_id}: WAITING_FOR_CR -> {previous_state}",
                extra={"ticket_id": ticket_id, "step_id": step_id}
            )
        
        # Restore ticket status
        previous_status = ticket_doc.get("previous_status") or TicketStatus.IN_PROGRESS.value
        self.tickets_collection.update_one(
            {"ticket_id": ticket_id},
            {
                "$set": {
                    "status": previous_status,
                    "updated_at": now
                },
                "$unset": {
                    "previous_status": ""
                }
            }
        )
        
        # Create audit event for workflow resume
        self._create_audit_event(
            ticket_id=ticket_id,
            event_type="CHANGE_REQUEST_WORKFLOW_RESUMED",
            actor=actor,
            details={
                "change_request_id": cr_id,
                "resolution": resolution,
                "resumed_steps_count": len(resumed_steps),
                "resumed_steps": [s["step_id"] for s in resumed_steps]
            }
        )
        
        # Notify all parties that workflow has resumed
        self._send_workflow_resumed_notifications(
            ticket_doc=ticket_doc,
            resumed_steps=resumed_steps,
            cr_id=cr_id,
            resolution=resolution,
            actor=actor
        )
        
        return resumed_steps
    
    def _send_workflow_paused_notifications(
        self,
        ticket_doc: Dict[str, Any],
        paused_steps: List[Dict[str, Any]],
        cr_id: str,
        actor: ActorContext
    ):
        """Send notifications to all parties when workflow is paused for CR"""
        import uuid
        now = datetime.utcnow()
        ticket_id = ticket_doc.get("ticket_id")
        ticket_title = ticket_doc.get("title", ticket_id)
        
        # Collect all unique recipients
        recipients = set()
        
        # Requester
        requester = ticket_doc.get("requester", {})
        if requester.get("email"):
            recipients.add(requester["email"])
        
        # Manager
        manager = ticket_doc.get("manager_snapshot", {})
        if manager.get("email"):
            recipients.add(manager["email"])
        
        # All assigned users on paused steps
        for step in paused_steps:
            assigned_to = step.get("assigned_to", {})
            if assigned_to and assigned_to.get("email"):
                recipients.add(assigned_to["email"])
        
        # Also get all parallel approvers on paused steps
        for step in paused_steps:
            step_doc = self.ticket_steps_collection.find_one({"ticket_step_id": step.get("ticket_step_id")})
            if step_doc:
                parallel_approvers = step_doc.get("parallel_pending_approvers") or []
                for email in parallel_approvers:
                    if email:  # Skip None/empty emails
                        recipients.add(email)
        
        # Remove actor from recipients (they initiated this)
        recipients.discard(actor.email)
        
        # Send in-app notifications to all recipients
        for email in recipients:
            self.in_app_notifications_collection.insert_one({
                "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
                "recipient_email": email,
                "category": InAppNotificationCategory.TICKET.value,
                "title": "Workflow Paused - Change Request Pending",
                "message": f"Ticket '{ticket_title}' is paused while a change request is being reviewed. You will be notified when it resumes.",
                "ticket_id": ticket_id,
                "action_url": f"/tickets/{ticket_id}",
                "actor_email": actor.email,
                "actor_display_name": actor.display_name,
                "is_read": False,
                "created_at": now.isoformat()
            })
        
        # Send email notifications to all recipients
        if recipients:
            self.notification_outbox_collection.insert_one({
                "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
                "ticket_id": ticket_id,
                "notification_type": "EMAIL",
                "template_key": "CHANGE_REQUEST_WORKFLOW_PAUSED",
                "recipients": list(recipients),
                "payload": {
                    "ticket_id": ticket_id,
                    "ticket_title": ticket_title,
                    "change_request_id": cr_id,
                    "requester_name": actor.display_name,
                    "paused_steps_count": len(paused_steps),
                    "paused_steps": [s.get("step_name", s.get("step_id")) for s in paused_steps]
                },
                "status": "PENDING",
                "retry_count": 0,
                "created_at": now.isoformat()
            })
        
        logger.info(
            f"Sent workflow paused notifications (in-app + email) to {len(recipients)} recipients",
            extra={"ticket_id": ticket_id, "cr_id": cr_id}
        )
    
    def _send_workflow_resumed_notifications(
        self,
        ticket_doc: Dict[str, Any],
        resumed_steps: List[Dict[str, Any]],
        cr_id: str,
        resolution: str,
        actor: ActorContext
    ):
        """Send notifications to all parties when workflow resumes after CR resolution"""
        import uuid
        now = datetime.utcnow()
        ticket_id = ticket_doc.get("ticket_id")
        ticket_title = ticket_doc.get("title", ticket_id)
        
        # Collect all unique recipients
        recipients = set()
        
        # Requester
        requester = ticket_doc.get("requester", {})
        if requester.get("email"):
            recipients.add(requester["email"])
        
        # Manager
        manager = ticket_doc.get("manager_snapshot", {})
        if manager.get("email"):
            recipients.add(manager["email"])
        
        # All assigned users on resumed steps
        for step in resumed_steps:
            assigned_to = step.get("assigned_to", {})
            if assigned_to and assigned_to.get("email"):
                recipients.add(assigned_to["email"])
        
        # Also get all parallel approvers on resumed steps
        for step in resumed_steps:
            step_doc = self.ticket_steps_collection.find_one({"ticket_step_id": step.get("ticket_step_id")})
            if step_doc:
                parallel_approvers = step_doc.get("parallel_pending_approvers") or []
                for email in parallel_approvers:
                    if email:  # Skip None/empty emails
                        recipients.add(email)
        
        # Remove actor from recipients (they resolved this)
        recipients.discard(actor.email)
        
        # Build message based on resolution
        if resolution == "APPROVED":
            message = f"Ticket '{ticket_title}' has resumed. The change request was approved and data has been updated."
        elif resolution == "REJECTED":
            message = f"Ticket '{ticket_title}' has resumed. The change request was rejected - original data retained."
        else:  # CANCELLED
            message = f"Ticket '{ticket_title}' has resumed. The change request was cancelled by the requester."
        
        # Send in-app notifications to all recipients
        for email in recipients:
            self.in_app_notifications_collection.insert_one({
                "notification_id": f"NOTIF-{uuid.uuid4().hex[:12]}",
                "recipient_email": email,
                "category": InAppNotificationCategory.TICKET.value,
                "title": "Workflow Resumed",
                "message": message,
                "ticket_id": ticket_id,
                "action_url": f"/tickets/{ticket_id}",
                "actor_email": actor.email,
                "actor_display_name": actor.display_name,
                "is_read": False,
                "created_at": now.isoformat()
            })
        
        # Send email notifications to all recipients
        if recipients:
            self.notification_outbox_collection.insert_one({
                "notification_id": f"EMAIL-{uuid.uuid4().hex[:12]}",
                "ticket_id": ticket_id,
                "notification_type": "EMAIL",
                "template_key": "CHANGE_REQUEST_WORKFLOW_RESUMED",
                "recipients": list(recipients),
                "payload": {
                    "ticket_id": ticket_id,
                    "ticket_title": ticket_title,
                    "change_request_id": cr_id,
                    "resolution": resolution,
                    "resolver_name": actor.display_name,
                    "resumed_steps_count": len(resumed_steps),
                    "resumed_steps": [s.get("step_name", s.get("step_id")) for s in resumed_steps],
                    "message": message
                },
                "status": "PENDING",
                "retry_count": 0,
                "created_at": now.isoformat()
            })
        
        logger.info(
            f"Sent workflow resumed notifications (in-app + email) to {len(recipients)} recipients",
            extra={"ticket_id": ticket_id, "cr_id": cr_id, "resolution": resolution}
        )
    
    def _get_all_workflow_participants(
        self,
        ticket_id: str,
        ticket_doc: Dict[str, Any]
    ) -> set:
        """Get all unique email addresses of participants in this workflow"""
        participants = set()
        
        # Requester
        requester = ticket_doc.get("requester", {})
        if requester.get("email"):
            participants.add(requester["email"])
        
        # Manager
        manager = ticket_doc.get("manager_snapshot", {})
        if manager.get("email"):
            participants.add(manager["email"])
        
        # All step assignees (past and present)
        all_steps = self.ticket_steps_collection.find({"ticket_id": ticket_id})
        for step in all_steps:
            assigned_to = step.get("assigned_to", {})
            if assigned_to and assigned_to.get("email"):
                participants.add(assigned_to["email"])
            
            # Parallel approvers
            parallel_approvers = step.get("parallel_pending_approvers") or []
            for email in parallel_approvers:
                if email:  # Skip None/empty emails
                    participants.add(email)
            
            # Parallel approvers info
            parallel_info = step.get("parallel_approvers_info") or []
            for info in parallel_info:
                if info and info.get("email"):
                    participants.add(info["email"])
        
        return participants
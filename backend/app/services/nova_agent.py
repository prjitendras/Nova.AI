"""
NOVA AI Agent - Production-Grade LangGraph Implementation
==========================================================

TOP-NOTCH Features:
1. LangGraph-based state machine with intelligent tool calling
2. MongoDB-backed persistent memory across sessions
3. COMPREHENSIVE access to ALL MongoDB collections
4. All persona support with smart context-aware responses
5. Workflow creation capability for designers
6. No hallucination - ALWAYS uses tools for real data
7. Rich formatted responses with markdown
"""

import json
import traceback
from contextvars import ContextVar
from datetime import datetime, timedelta
from typing import Any, Annotated, Dict, List, Literal, Optional, TypedDict

from langchain_core.messages import (
    AIMessage, 
    HumanMessage, 
    SystemMessage, 
    ToolMessage,
    BaseMessage
)
from langchain_core.tools import tool
from langchain_openai import AzureChatOpenAI
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from ..config.settings import settings
from ..repositories.async_mongo import get_async_database
from ..utils.logger import get_logger

logger = get_logger(__name__)


# =============================================================================
# AGENT STATE
# =============================================================================

class AgentState(TypedDict):
    """State for the NOVA agent graph"""
    messages: Annotated[List[BaseMessage], add_messages]
    user_email: str
    user_name: str
    persona: str
    session_id: str


# =============================================================================
# MONGODB-BACKED PERSISTENT MEMORY
# =============================================================================

class ConversationMemory:
    """
    MongoDB-backed conversation memory for persistent chat history.
    Stores conversations per user+persona combination.
    """
    
    MAX_MESSAGES = 50  # Keep more context for better conversations
    
    async def get(self, session_id: str) -> List[Dict]:
        """Get conversation history from MongoDB"""
        try:
            db = get_async_database()
            doc = await db.ai_conversations.find_one({"session_id": session_id})
            if doc:
                messages = doc.get("messages", [])
                normalized = []
                for msg in messages:
                    role = msg.get("role", "user")
                    if role == "human":
                        role = "user"
                    elif role == "ai":
                        role = "assistant"
                    normalized.append({
                        "role": role,
                        "content": msg.get("content", "")
                    })
                return normalized
            return []
        except Exception as e:
            logger.error(f"Memory get error: {e}")
            return []
    
    async def add(self, session_id: str, role: str, content: str):
        """Add a message to conversation history"""
        try:
            db = get_async_database()
            
            if role == "human":
                role = "user"
            elif role == "ai":
                role = "assistant"
            
            doc = await db.ai_conversations.find_one({"session_id": session_id})
            messages = doc.get("messages", []) if doc else []
            
            messages.append({
                "role": role,
                "content": content,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            if len(messages) > self.MAX_MESSAGES:
                messages = messages[-self.MAX_MESSAGES:]
            
            await db.ai_conversations.update_one(
                {"session_id": session_id},
                {
                    "$set": {
                        "messages": messages,
                        "updated_at": datetime.utcnow()
                    },
                    "$setOnInsert": {
                        "created_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
        except Exception as e:
            logger.error(f"Memory add error: {e}")
    
    async def clear(self, session_id: str):
        """Clear conversation history"""
        try:
            db = get_async_database()
            await db.ai_conversations.delete_one({"session_id": session_id})
            logger.info(f"Cleared memory for session: {session_id}")
        except Exception as e:
            logger.error(f"Memory clear error: {e}")


memory = ConversationMemory()


# =============================================================================
# TOOL CONTEXT - Thread-safe using ContextVar
# =============================================================================

# Thread-safe context storage for async operations
_tool_context_var: ContextVar[Dict[str, str]] = ContextVar("tool_context", default={})


def set_tool_context(user_email: str, persona: str, user_aad_id: str = ""):
    """Set context for tool execution (thread-safe)"""
    _tool_context_var.set({"user_email": user_email, "persona": persona, "user_aad_id": user_aad_id})


def get_tool_context() -> Dict[str, str]:
    """Get current tool context (thread-safe)"""
    return _tool_context_var.get()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def clean_ticket_id(ticket_id: str) -> str:
    """Clean and normalize ticket ID"""
    if ticket_id.startswith("TKT-TKT-"):
        return ticket_id.replace("TKT-TKT-", "TKT-")
    return ticket_id


def format_datetime(dt) -> str:
    """Format datetime for display"""
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d %H:%M")
    elif isinstance(dt, str):
        return dt[:16] if len(dt) > 16 else dt
    return str(dt) if dt else "N/A"


def format_user(user_dict: Optional[Dict]) -> str:
    """Format user info for display"""
    if not user_dict:
        return "Unknown"
    return f"{user_dict.get('display_name', 'Unknown')} ({user_dict.get('email', '')})"


# =============================================================================
# COMPREHENSIVE MONGODB TOOLS
# =============================================================================

# ==================== TICKET TOOLS ====================

@tool
async def get_ticket_details(ticket_id: str) -> str:
    """
    Get COMPREHENSIVE details about a specific ticket including:
    - Basic info (status, workflow, requester, priority)
    - All workflow steps with their details
    - Summary of notes, info requests, attachments
    
    For detailed notes/info requests/attachments, use the specific tools.
    
    Args:
        ticket_id: The ticket ID (e.g., TKT-a814d506ae6d)
    """
    logger.info(f"TOOL: get_ticket_details({ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        ticket = await db.tickets.find_one({"ticket_id": clean_id})
        if not ticket:
            ticket = await db.tickets.find_one({
                "ticket_id": {"$regex": f"^{clean_id}$", "$options": "i"}
            })
        
        if not ticket:
            return f"❌ Ticket **{clean_id}** not found."
        
        req = ticket.get("requester", {})
        
        # Get steps from ticket_steps collection
        steps = await db.ticket_steps.find({"ticket_id": clean_id}).sort("step_order", 1).to_list(50)
        completed_steps = sum(1 for s in steps if s.get("state") == "COMPLETED")
        
        # Count notes from all sources
        requester_notes = ticket.get("requester_notes", [])
        step_notes_count = 0
        for s in steps:
            step_notes_count += len(s.get("notes", []))
        
        # Count info requests
        info_req_count = await db.info_requests.count_documents({"ticket_id": clean_id})
        
        # Count attachments
        attachments_count = await db.attachments.count_documents({"ticket_id": clean_id})
        
        result = f"""## 📋 Ticket: {ticket.get('ticket_id')}

### Basic Information
| Field | Value |
|-------|-------|
| **Title** | {ticket.get('title', 'Untitled')} |
| **Status** | {ticket.get('status')} |
| **Priority** | {ticket.get('priority', 'NORMAL')} |
| **Workflow** | {ticket.get('workflow_name', 'N/A')} |
| **Requester** | {format_user(req)} |
| **Created** | {format_datetime(ticket.get('created_at'))} |
| **Updated** | {format_datetime(ticket.get('updated_at'))} |
| **Progress** | {completed_steps}/{len(steps)} steps completed |

### 📊 Quick Stats
- **Notes:** {len(requester_notes)} requester notes + {step_notes_count} step notes
- **Info Requests:** {info_req_count}
- **Attachments:** {attachments_count} files

"""
        
        # Workflow Steps with detailed info
        if steps:
            result += "### 🔄 Workflow Steps\n"
            result += "| # | Step Name | Type | State | Assignee | Notes |\n"
            result += "|---|-----------|------|-------|----------|-------|\n"
            for i, s in enumerate(steps, 1):
                state_emoji = {"COMPLETED": "✅", "ACTIVE": "🔄", "PENDING": "⏳", "SKIPPED": "⏭️", "ON_HOLD": "⏸️"}.get(s.get("state"), "📌")
                step_name = s.get('step_name') or s.get('name') or s.get('step_type', 'Step')
                assignee = s.get('assigned_to') or s.get('assignee', {})
                assignee_name = assignee.get('display_name', 'Unassigned') if assignee else "Unassigned"
                step_notes = len(s.get("notes", []))
                result += f"| {i} | {step_name} | {s.get('step_type')} | {state_emoji} {s.get('state')} | {assignee_name} | {step_notes} |\n"
        
        result += "\n💡 *Use `get_ticket_notes`, `get_ticket_info_requests`, or `get_attachments` for detailed information.*"
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_details error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_ticket_notes(ticket_id: str) -> str:
    """
    Get ALL notes for a ticket from ALL sources:
    - Requester notes (on ticket.requester_notes[])
    - Task/Agent notes (on ticket_steps.data.notes[])
    
    Args:
        ticket_id: The ticket ID (e.g., TKT-a814d506ae6d)
    """
    logger.info(f"TOOL: get_ticket_notes({ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        ticket = await db.tickets.find_one({"ticket_id": clean_id})
        if not ticket:
            return f"❌ Ticket **{clean_id}** not found."
        
        result = f"## 📝 All Notes for {clean_id}\n\n"
        total_notes = 0
        
        # 1. Requester notes from ticket document (ticket-level notes)
        requester_notes = ticket.get("requester_notes", []) or []
        if requester_notes:
            result += "### 👤 Requester Notes (Ticket-level)\n"
            for note in requester_notes:
                if not isinstance(note, dict):
                    continue
                actor = note.get("actor", {}) or {}
                actor_name = actor.get('display_name', actor.get('name', 'Unknown'))
                content = note.get('content', note.get('text', 'No content'))
                created = format_datetime(note.get('created_at'))
                result += f"**{actor_name}** ({created})\n"
                result += f"> {content}\n\n"
                total_notes += 1
        
        # 2. Step-level notes from ticket_steps.data.notes[]
        steps = await db.ticket_steps.find({"ticket_id": clean_id}).to_list(100)
        logger.info(f"Found {len(steps)} steps for ticket {clean_id}")
        
        for step in steps:
            step_name = step.get('step_name') or step.get('name') or step.get('step_type', 'Step')
            step_data = step.get("data", {}) or {}
            
            # Notes are stored in step.data.notes[] (this is where the engine stores them)
            data_notes = step_data.get("notes", []) or []
            if data_notes and isinstance(data_notes, list):
                result += f"### 📋 Notes on Step: {step_name}\n"
                for note in data_notes:
                    if not isinstance(note, dict):
                        continue
                    # Get author info - could be in 'actor' or 'author'
                    actor = note.get("actor", {}) or note.get("author", {}) or {}
                    actor_name = actor.get('display_name', actor.get('name', 'Unknown'))
                    content = note.get('content', note.get('text', 'No content'))
                    created = format_datetime(note.get('created_at', note.get('timestamp')))
                    result += f"**{actor_name}** ({created})\n"
                    result += f"> {content}\n\n"
                    total_notes += 1
        
        if total_notes == 0:
            result += "No notes found on this ticket.\n"
            result += "\n*Notes can be added by agents/requesters on the ticket details page.*"
        else:
            result = f"## 📝 All Notes for {clean_id} ({total_notes} total)\n\n" + result.split('\n\n', 1)[1]
        
        logger.info(f"get_ticket_notes: Found {total_notes} notes for {clean_id}")
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_notes error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error retrieving notes: {str(e)}"


@tool
async def get_ticket_info_requests(ticket_id: str) -> str:
    """
    Get ALL info requests (clarification requests) for a ticket.
    Shows full conversation threads with questions and responses.
    
    Args:
        ticket_id: The ticket ID (e.g., TKT-a814d506ae6d)
    """
    logger.info(f"TOOL: get_ticket_info_requests({ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        requests = await db.info_requests.find({"ticket_id": clean_id}).sort("requested_at", 1).to_list(50)
        
        if not requests:
            return f"No info requests found for ticket {clean_id}."
        
        result = f"## 📩 Info Requests for {clean_id} ({len(requests)} total)\n\n"
        
        for i, req in enumerate(requests, 1):
            status_emoji = {"OPEN": "⏳", "RESPONDED": "✅", "CLOSED": "✅", "CANCELLED": "❌"}.get(req.get("status"), "📝")
            
            result += f"### #{i} - {req.get('subject', 'No Subject')} {status_emoji}\n"
            result += f"**Status:** {req.get('status')} | **Step:** {req.get('step_name', 'N/A')}\n"
            result += f"**From:** {format_user(req.get('requested_by'))} → **To:** {format_user(req.get('requested_from'))}\n"
            result += f"**Requested:** {format_datetime(req.get('requested_at'))}\n\n"
            
            # Question
            result += f"**❓ Question:**\n> {req.get('question', req.get('message', 'No question'))}\n\n"
            
            # Response if available
            if req.get('response') or req.get('answer'):
                result += f"**✅ Response:** ({format_datetime(req.get('responded_at'))})\n"
                result += f"> {req.get('response', req.get('answer', ''))}\n\n"
            
            # Response time if available
            if req.get('response_time_seconds'):
                mins = req.get('response_time_seconds', 0) // 60
                result += f"*Response time: {mins} minutes*\n\n"
            
            result += "---\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_info_requests error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_ticket_form_data(ticket_id: str) -> str:
    """
    Get all form data submitted for a ticket.
    Shows form field values from each form step.
    
    Args:
        ticket_id: The ticket ID
    """
    logger.info(f"TOOL: get_ticket_form_data({ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        ticket = await db.tickets.find_one({"ticket_id": clean_id})
        if not ticket:
            return f"❌ Ticket **{clean_id}** not found."
        
        result = f"## 📝 Form Data for {clean_id}\n\n"
        
        # Check ticket-level form values
        form_values = ticket.get("form_values", {})
        if form_values:
            result += "### Ticket Form Values\n"
            for key, value in form_values.items():
                if isinstance(value, dict):
                    value = json.dumps(value, default=str)
                elif isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                result += f"- **{key}:** {value}\n"
            result += "\n"
        
        # Get form steps with their data
        steps = await db.ticket_steps.find({
            "ticket_id": clean_id,
            "step_type": "FORM_STEP"
        }).to_list(20)
        
        for step in steps:
            step_name = step.get('step_name') or step.get('name') or 'Form'
            step_form_values = step.get("form_values", {}) or step.get("submitted_data", {})
            
            if step_form_values:
                result += f"### 📋 {step_name}\n"
                for key, value in step_form_values.items():
                    if isinstance(value, dict):
                        value = json.dumps(value, default=str)
                    elif isinstance(value, list):
                        value = ", ".join(str(v) for v in value)
                    result += f"- **{key}:** {value}\n"
                result += "\n"
        
        if not form_values and not steps:
            result += "No form data found for this ticket.\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_form_data error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_ticket_approvals(ticket_id: str) -> str:
    """
    Get all approval details for a ticket including:
    - Approvers and their decisions
    - Approval comments
    - Decision timestamps
    
    Args:
        ticket_id: The ticket ID
    """
    logger.info(f"TOOL: get_ticket_approvals({ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        result = f"## ✅ Approvals for {clean_id}\n\n"
        
        # Get approval steps
        approval_steps = await db.ticket_steps.find({
            "ticket_id": clean_id,
            "step_type": "APPROVAL_STEP"
        }).sort("step_order", 1).to_list(20)
        
        if not approval_steps:
            return f"No approval steps found for ticket {clean_id}."
        
        result += "| Step | Approver | Decision | Date | Comment |\n"
        result += "|------|----------|----------|------|----------|\n"
        
        for step in approval_steps:
            step_name = step.get('step_name') or step.get('name') or 'Approval'
            assignee = step.get('assigned_to') or step.get('assignee', {})
            approver_name = format_user(assignee) if assignee else "Unassigned"
            
            decision = step.get('decision', step.get('approval_decision', step.get('state', 'PENDING')))
            decision_emoji = "✅" if decision in ["APPROVED", "COMPLETED"] else "❌" if decision == "REJECTED" else "⏳"
            
            decided_at = step.get('decided_at') or step.get('completed_at') or step.get('updated_at')
            comment = step.get('approval_comment', step.get('comment', step.get('decision_comment', '-')))
            if comment and len(str(comment)) > 30:
                comment = str(comment)[:30] + "..."
            
            result += f"| {step_name} | {approver_name} | {decision_emoji} {decision} | {format_datetime(decided_at)} | {comment or '-'} |\n"
        
        # Also check approval_tasks collection
        approval_tasks = await db.approval_tasks.find({"ticket_id": clean_id}).to_list(20)
        if approval_tasks:
            result += "\n### 📋 Approval Task Details\n"
            for task in approval_tasks:
                approver = task.get("approver", {})
                result += f"- **{format_user(approver)}**: {task.get('decision', 'PENDING')}"
                if task.get('comment'):
                    result += f" - \"{task.get('comment')}\""
                result += f" ({format_datetime(task.get('decided_at'))})\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_approvals error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_ticket_timeline(ticket_id: str) -> str:
    """
    Get complete timeline/history of a ticket showing all events in chronological order.
    Shows step transitions, approvals, notes added, info requests, status changes.
    
    Args:
        ticket_id: The ticket ID
    """
    logger.info(f"TOOL: get_ticket_timeline({ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        ticket = await db.tickets.find_one({"ticket_id": clean_id})
        if not ticket:
            return f"❌ Ticket **{clean_id}** not found."
        
        result = f"## 📅 Timeline for {clean_id}\n\n"
        events = []
        
        # 1. Ticket created
        events.append({
            "time": ticket.get("created_at"),
            "type": "CREATED",
            "icon": "🎫",
            "desc": f"Ticket created by {format_user(ticket.get('requester'))}"
        })
        
        # 2. Get step events
        steps = await db.ticket_steps.find({"ticket_id": clean_id}).to_list(50)
        for step in steps:
            step_name = step.get('step_name') or step.get('name') or step.get('step_type', 'Step')
            
            # Step activated
            if step.get("activated_at"):
                events.append({
                    "time": step.get("activated_at"),
                    "type": "STEP_ACTIVE",
                    "icon": "▶️",
                    "desc": f"Step '{step_name}' activated"
                })
            
            # Step completed
            if step.get("completed_at"):
                assignee = step.get('assigned_to') or step.get('assignee', {})
                by_user = format_user(assignee) if assignee else "System"
                if step.get('step_type') == "APPROVAL_STEP":
                    decision = step.get('decision', 'COMPLETED')
                    events.append({
                        "time": step.get("completed_at"),
                        "type": "APPROVAL",
                        "icon": "✅" if decision in ["APPROVED", "COMPLETED"] else "❌",
                        "desc": f"'{step_name}' - {decision} by {by_user}"
                    })
                else:
                    events.append({
                        "time": step.get("completed_at"),
                        "type": "STEP_COMPLETED",
                        "icon": "✅",
                        "desc": f"Step '{step_name}' completed by {by_user}"
                    })
            
            # Notes on step
            for note in step.get("notes", []):
                actor = note.get("actor", {})
                events.append({
                    "time": note.get("created_at"),
                    "type": "NOTE",
                    "icon": "📝",
                    "desc": f"Note added by {actor.get('display_name', 'Unknown')} on '{step_name}'"
                })
        
        # 3. Get info requests
        info_reqs = await db.info_requests.find({"ticket_id": clean_id}).to_list(50)
        for req in info_reqs:
            events.append({
                "time": req.get("requested_at"),
                "type": "INFO_REQUEST",
                "icon": "❓",
                "desc": f"Info request: '{req.get('subject', 'Question')}' from {format_user(req.get('requested_by'))}"
            })
            if req.get("responded_at"):
                events.append({
                    "time": req.get("responded_at"),
                    "type": "INFO_RESPONSE",
                    "icon": "💬",
                    "desc": f"Info request responded by {format_user(req.get('requested_from'))}"
                })
        
        # 4. Get audit events for this ticket
        audit_events = await db.audit_events.find({"ticket_id": clean_id}).limit(30).to_list(30)
        for event in audit_events:
            if event.get("event_type") not in ["TICKET_CREATED"]:  # Avoid duplicates
                events.append({
                    "time": event.get("timestamp"),
                    "type": event.get("event_type"),
                    "icon": "📋",
                    "desc": f"{event.get('event_type')} by {event.get('actor', {}).get('display_name', 'System')}"
                })
        
        # Sort by time
        events.sort(key=lambda x: x.get("time") or datetime.min, reverse=True)
        
        if not events:
            return f"No timeline events found for ticket {clean_id}."
        
        # Format timeline
        for event in events[:30]:  # Limit to 30 most recent
            time_str = format_datetime(event.get("time"))
            result += f"{event['icon']} **{time_str}** - {event['desc']}\n\n"
        
        if len(events) > 30:
            result += f"\n*...and {len(events) - 30} more events*\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_timeline error: {e}")
        return f"Error: {str(e)}"


@tool
async def search_tickets(
    status: Optional[str] = None,
    title_contains: Optional[str] = None,
    requester_email: Optional[str] = None,
    workflow_name: Optional[str] = None,
    created_after: Optional[str] = None,
    limit: int = 15
) -> str:
    """
    Search tickets with multiple filters. All filters are optional.
    
    Args:
        status: Filter by status (IN_PROGRESS, PENDING, COMPLETED, ON_HOLD, CANCELLED, REJECTED)
        title_contains: Search term in ticket title
        requester_email: Filter by requester email
        workflow_name: Filter by workflow name
        created_after: Filter tickets created after this date (YYYY-MM-DD)
        limit: Maximum results (default 15)
    """
    logger.info(f"TOOL: search_tickets(status={status}, title={title_contains})")
    try:
        db = get_async_database()
        query = {}
        
        if status:
            query["status"] = status.upper()
        if title_contains:
            query["title"] = {"$regex": title_contains, "$options": "i"}
        if requester_email:
            query["requester.email"] = {"$regex": requester_email, "$options": "i"}
        if workflow_name:
            query["workflow_name"] = {"$regex": workflow_name, "$options": "i"}
        if created_after:
            try:
                dt = datetime.strptime(created_after, "%Y-%m-%d")
                query["created_at"] = {"$gte": dt}
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid date format '{created_after}': {e}. Expected YYYY-MM-DD.")
        
        tickets = await db.tickets.find(query).sort("created_at", -1).limit(limit).to_list(limit)
        
        if not tickets:
            return "No tickets found matching your criteria."
        
        result = f"## 🔍 Search Results ({len(tickets)} tickets)\n\n"
        for t in tickets:
            emoji = {"COMPLETED": "✅", "IN_PROGRESS": "🔄", "PENDING": "⏳", "ON_HOLD": "⏸️", "CANCELLED": "❌"}.get(t.get("status"), "📋")
            result += f"{emoji} **{t.get('ticket_id')}** - {t.get('title', 'Untitled')}\n"
            result += f"   Status: {t.get('status')} | Workflow: {t.get('workflow_name', 'N/A')} | {format_datetime(t.get('created_at'))}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"search_tickets error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_my_tickets(status: Optional[str] = None, limit: int = 15) -> str:
    """
    Get tickets created by the current user (as requester).
    
    Args:
        status: Optional filter by status
        limit: Maximum tickets (default 15)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_my_tickets(user={user_email})")
    
    try:
        db = get_async_database()
        query = {"requester.email": user_email}
        if status:
            query["status"] = status.upper()
        
        tickets = await db.tickets.find(query).sort("created_at", -1).limit(limit).to_list(limit)
        
        if not tickets:
            return "You don't have any tickets yet. Go to the Catalog page to request a service!"
        
        result = f"## 📋 Your Tickets ({len(tickets)})\n\n"
        for t in tickets:
            emoji = {"COMPLETED": "✅", "IN_PROGRESS": "🔄", "PENDING": "⏳", "ON_HOLD": "⏸️", "CANCELLED": "❌"}.get(t.get("status"), "📋")
            result += f"{emoji} **{t.get('ticket_id')}** - {t.get('title', 'Untitled')}\n"
            result += f"   Status: {t.get('status')} | Workflow: {t.get('workflow_name', 'N/A')}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_my_tickets error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_ticket_statistics() -> str:
    """
    Get comprehensive ticket statistics for the current user.
    Shows counts by status, completion rate, and recent activity.
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_ticket_statistics(user={user_email})")
    
    try:
        db = get_async_database()
        
        total = await db.tickets.count_documents({"requester.email": user_email})
        in_progress = await db.tickets.count_documents({"requester.email": user_email, "status": "IN_PROGRESS"})
        pending = await db.tickets.count_documents({"requester.email": user_email, "status": "PENDING"})
        completed = await db.tickets.count_documents({"requester.email": user_email, "status": "COMPLETED"})
        on_hold = await db.tickets.count_documents({"requester.email": user_email, "status": "ON_HOLD"})
        cancelled = await db.tickets.count_documents({"requester.email": user_email, "status": "CANCELLED"})
        
        rate = round((completed / max(total, 1)) * 100, 1)
        
        return f"""## 📊 Your Ticket Statistics

| Metric | Count |
|--------|-------|
| **Total Tickets** | {total} |
| **In Progress** | {in_progress} |
| **Pending** | {pending} |
| **Completed** | {completed} ✅ |
| **On Hold** | {on_hold} |
| **Cancelled** | {cancelled} |

**Completion Rate:** {rate}%
**Active Tickets:** {in_progress + pending}
"""
    except Exception as e:
        logger.error(f"get_ticket_statistics error: {e}")
        return f"Error: {str(e)}"


# ==================== WORKFLOW TOOLS ====================

@tool
async def get_available_workflows(search: Optional[str] = None, category: Optional[str] = None) -> str:
    """
    Get list of available published workflows/services that users can request.
    
    Args:
        search: Search term for workflow name or description
        category: Filter by category
    """
    logger.info(f"TOOL: get_available_workflows(search={search})")
    try:
        db = get_async_database()
        query = {"status": "PUBLISHED"}
        
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        if category:
            query["category"] = {"$regex": category, "$options": "i"}
        
        workflows = await db.workflows.find(query).to_list(20)
        
        if not workflows:
            return "No published workflows available."
        
        result = f"## 📋 Available Services ({len(workflows)})\n\n"
        for w in workflows:
            result += f"### {w.get('name')}\n"
            result += f"**Category:** {w.get('category', 'General')}\n"
            if w.get('description'):
                result += f"{w.get('description')[:150]}{'...' if len(w.get('description', '')) > 150 else ''}\n"
            result += "\n"
        
        result += "\n💡 *To request a service, go to the Catalog page and select the workflow you need.*"
        return result
        
    except Exception as e:
        logger.error(f"get_available_workflows error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_all_workflows(status: Optional[str] = None) -> str:
    """
    Get all workflows with their details (for designers/admins).
    
    Args:
        status: Filter by status (PUBLISHED, DRAFT, ARCHIVED)
    """
    logger.info(f"TOOL: get_all_workflows(status={status})")
    try:
        db = get_async_database()
        query = {}
        if status:
            query["status"] = status.upper()
        
        workflows = await db.workflows.find(query).to_list(30)
        
        if not workflows:
            return "No workflows found."
        
        result = f"## 📋 All Workflows ({len(workflows)})\n\n"
        for w in workflows:
            emoji = {"PUBLISHED": "✅", "DRAFT": "📝", "ARCHIVED": "📦"}.get(w.get("status"), "📋")
            result += f"{emoji} **{w.get('name')}**\n"
            result += f"   Status: {w.get('status')} | Category: {w.get('category', 'General')}\n"
            result += f"   Version: {w.get('current_version', 1)} | Created: {format_datetime(w.get('created_at'))}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_all_workflows error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_workflow_details(workflow_name: str) -> str:
    """
    Get detailed workflow definition including all steps and transitions.
    Use this when user asks about workflow steps, definition, or structure.
    
    Args:
        workflow_name: Name of the workflow (case-insensitive partial match)
    """
    logger.info(f"TOOL: get_workflow_details(workflow_name={workflow_name})")
    try:
        db = get_async_database()
        
        # Find workflow by name (case-insensitive partial match)
        workflow = await db.workflows.find_one({
            "name": {"$regex": workflow_name, "$options": "i"}
        })
        
        if not workflow:
            # Try searching in archived too
            workflows = await db.workflows.find({
                "name": {"$regex": workflow_name, "$options": "i"}
            }).to_list(5)
            
            if not workflows:
                return f"❌ No workflow found matching '{workflow_name}'. Try `get_all_workflows()` to see available workflows."
            
            workflow = workflows[0]
        
        # Build detailed response
        result = f"## 📋 Workflow: {workflow.get('name')}\n\n"
        result += f"**Status:** {workflow.get('status', 'UNKNOWN')}\n"
        result += f"**Category:** {workflow.get('category', 'General')}\n"
        result += f"**Description:** {workflow.get('description', 'No description')}\n"
        result += f"**Version:** v{workflow.get('current_version', 1)}\n"
        result += f"**Created:** {format_datetime(workflow.get('created_at'))}\n\n"
        
        # Get workflow definition with steps
        definition = workflow.get("definition", {})
        steps = definition.get("steps", [])
        transitions = definition.get("transitions", [])
        
        if steps:
            result += f"### Workflow Steps ({len(steps)})\n\n"
            result += "| # | Step Name | Type | Description |\n"
            result += "|---|-----------|------|-------------|\n"
            
            for i, step in enumerate(steps, 1):
                step_name = step.get("name", f"Step {i}")
                step_type = step.get("type", "UNKNOWN")
                step_desc = step.get("description", "-")[:50]
                
                # Add more details based on step type
                type_info = step_type
                if step_type == "FORM_STEP":
                    form_id = step.get("form_id", "")
                    type_info = f"FORM ({form_id[:20]}...)" if form_id else "FORM"
                elif step_type == "APPROVAL_STEP":
                    approver = step.get("approver", {})
                    if approver.get("type") == "MANAGER":
                        type_info = "APPROVAL (Manager)"
                    elif approver.get("type") == "SPECIFIC_USER":
                        type_info = f"APPROVAL ({approver.get('email', 'User')[:20]})"
                    else:
                        type_info = "APPROVAL"
                elif step_type == "TASK_STEP":
                    assignee = step.get("assignee", {})
                    type_info = f"TASK ({assignee.get('email', 'Agent')[:20]})" if assignee.get('email') else "TASK"
                
                result += f"| {i} | {step_name} | {type_info} | {step_desc} |\n"
            
            result += "\n"
        else:
            result += "⚠️ No steps defined in this workflow.\n\n"
        
        # Show transitions
        if transitions:
            result += f"### Transitions ({len(transitions)})\n\n"
            for t in transitions[:10]:  # Limit to 10
                from_step = t.get("from", "Start")
                to_step = t.get("to", "End")
                condition = t.get("condition", "")
                if condition:
                    result += f"- {from_step} → {to_step} (if: {condition[:30]}...)\n"
                else:
                    result += f"- {from_step} → {to_step}\n"
            result += "\n"
        
        # Summary
        result += "---\n"
        result += f"💡 This workflow has **{len(steps)} steps** and **{len(transitions)} transitions**.\n"
        result += f"To modify this workflow, go to the **Workflow Studio** and click on '{workflow.get('name')}'."
        
        return result
        
    except Exception as e:
        logger.error(f"get_workflow_details error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error retrieving workflow details: {str(e)}"


@tool
async def get_workflow_statistics() -> str:
    """
    Get workflow statistics including counts by status and usage.
    """
    logger.info("TOOL: get_workflow_statistics()")
    try:
        db = get_async_database()
        
        total = await db.workflows.count_documents({})
        published = await db.workflows.count_documents({"status": "PUBLISHED"})
        draft = await db.workflows.count_documents({"status": "DRAFT"})
        archived = await db.workflows.count_documents({"status": "ARCHIVED"})
        
        # Workflow versions
        versions = await db.workflow_versions.count_documents({})
        
        # Tickets per workflow
        pipeline = [
            {"$group": {"_id": "$workflow_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        top_workflows = await db.tickets.aggregate(pipeline).to_list(5)
        
        result = f"""## 📊 Workflow Statistics

| Metric | Count |
|--------|-------|
| **Total Workflows** | {total} |
| **Published** | {published} ✅ |
| **Draft** | {draft} 📝 |
| **Archived** | {archived} |
| **Total Versions** | {versions} |

### Most Used Workflows
"""
        for w in top_workflows:
            result += f"- **{w['_id']}**: {w['count']} tickets\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_workflow_statistics error: {e}")
        return f"Error: {str(e)}"


# ==================== AGENT/TASK TOOLS ====================

@tool
async def get_my_tasks(include_completed: bool = False) -> str:
    """
    Get TASK_STEP tasks assigned to the current user from ticket_steps collection.
    Uses case-insensitive email matching like the backend API.
    
    Args:
        include_completed: Include completed tasks (default False)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_my_tasks(user={user_email})")
    
    try:
        db = get_async_database()
        
        # Use same states as backend: ACTIVE, ON_HOLD, WAITING_FOR_REQUESTER, WAITING_FOR_AGENT
        states = ["ACTIVE", "ON_HOLD", "WAITING_FOR_REQUESTER", "WAITING_FOR_AGENT"]
        if include_completed:
            states.append("COMPLETED")
        
        # Use case-insensitive regex like the backend (assigned_to.email field)
        # Only get TASK_STEP, not FORM_STEP or APPROVAL_STEP
        query = {
            "assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"},
            "state": {"$in": states},
            "step_type": "TASK_STEP"
        }
        
        logger.info(f"My tasks query: {query}")
        steps = await db.ticket_steps.find(query).sort("due_at", 1).limit(20).to_list(20)
        
        if not steps:
            return "🎉 **All caught up!** You have no pending tasks.\n\nIf you need to check your task history or workload summary, just ask!"
        
        result = f"## 📋 Your Tasks ({len(steps)})\n\n"
        for s in steps:
            ticket_id = s.get("ticket_id")
            ticket = await db.tickets.find_one({"ticket_id": ticket_id}, {"title": 1, "workflow_name": 1})
            
            state = s.get("state", "UNKNOWN")
            emoji = {
                "ACTIVE": "🔄", 
                "ON_HOLD": "⏸️", 
                "WAITING_FOR_REQUESTER": "⏳",
                "WAITING_FOR_AGENT": "⏳",
                "COMPLETED": "✅"
            }.get(state, "📌")
            step_name = s.get('step_name') or s.get('name') or s.get('step_type')
            
            result += f"{emoji} **{ticket_id}** - {ticket.get('title') if ticket else 'Unknown'}\n"
            result += f"   Task: {step_name}\n"
            result += f"   State: {state} | Workflow: {ticket.get('workflow_name', 'N/A') if ticket else 'N/A'}\n\n"
        
        result += "\n💡 *Go to the My Tasks page to complete these tasks.*"
        return result
        
    except Exception as e:
        logger.error(f"get_my_tasks error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error retrieving tasks: {str(e)}"


@tool
async def get_agent_workload() -> str:
    """
    Get comprehensive workload summary for the current agent.
    Uses case-insensitive email matching and filters by TASK_STEP only.
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_agent_workload(user={user_email})")
    
    try:
        db = get_async_database()
        
        # Use case-insensitive regex for email matching, filter by TASK_STEP
        query = {
            "assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"},
            "step_type": "TASK_STEP"
        }
        
        pipeline = [
            {"$match": query},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}}
        ]
        
        logger.info(f"Agent workload query: {query}")
        results = await db.ticket_steps.aggregate(pipeline).to_list(20)
        counts = {r["_id"]: r["count"] for r in results}
        
        active = counts.get("ACTIVE", 0)
        on_hold = counts.get("ON_HOLD", 0)
        waiting_requester = counts.get("WAITING_FOR_REQUESTER", 0)
        waiting_agent = counts.get("WAITING_FOR_AGENT", 0)
        completed = counts.get("COMPLETED", 0)
        
        waiting_total = waiting_requester + waiting_agent
        need_attention = active + on_hold + waiting_total
        total = need_attention + completed
        
        return f"""## 📊 Your Workload Summary

| Status | Count |
|--------|-------|
| **Active** | {active} 🔄 |
| **On Hold** | {on_hold} ⏸️ |
| **Waiting for Response** | {waiting_total} ⏳ |
| **Completed** | {completed} ✅ |
| **Total Tasks** | {total} |

**Need Attention:** {need_attention} tasks

💡 *Use "show my tasks" to see the details of each pending task.*
"""
    except Exception as e:
        logger.error(f"get_agent_workload error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_my_tasks_by_status(status: str) -> str:
    """
    Get agent's tasks filtered by specific status.
    Use this when user asks about tasks with a specific status like 'on hold', 'active', etc.
    
    Args:
        status: Task status - 'active', 'on_hold', 'waiting', 'completed', 'all'
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    user_aad_id = ctx.get("user_aad_id", "")
    logger.info(f"TOOL: get_my_tasks_by_status(user={user_email}, status={status})")
    
    try:
        db = get_async_database()
        
        # Map user-friendly status to actual states
        status_map = {
            "active": ["ACTIVE"],
            "on_hold": ["ON_HOLD"],
            "on hold": ["ON_HOLD"],
            "waiting": ["WAITING_FOR_REQUESTER", "WAITING_FOR_AGENT"],
            "completed": ["COMPLETED"],
            "all": ["ACTIVE", "ON_HOLD", "WAITING_FOR_REQUESTER", "WAITING_FOR_AGENT", "COMPLETED"]
        }
        
        states = status_map.get(status.lower(), ["ACTIVE", "ON_HOLD", "WAITING_FOR_REQUESTER", "WAITING_FOR_AGENT"])
        
        # Build query with both email and aad_id for reliable matching
        query_conditions = [
            {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        if user_aad_id:
            query_conditions.append({"assigned_to.aad_id": user_aad_id})
        
        query = {
            "$or": query_conditions,
            "state": {"$in": states},
            "step_type": "TASK_STEP"
        }
        
        logger.info(f"Tasks by status query: {query}")
        steps = await db.ticket_steps.find(query).sort("updated_at", -1).limit(25).to_list(25)
        
        if not steps:
            status_text = status.upper().replace("_", " ")
            return f"✅ You have no tasks with status '{status_text}'.\n\nUse 'show my workload' to see all your task statistics."
        
        status_emoji = {
            "ACTIVE": "🔄",
            "ON_HOLD": "⏸️",
            "WAITING_FOR_REQUESTER": "⏳",
            "WAITING_FOR_AGENT": "⏳",
            "COMPLETED": "✅"
        }
        
        result = f"## 📋 Your Tasks - {status.upper()} ({len(steps)})\n\n"
        
        for s in steps:
            ticket_id = s.get("ticket_id")
            ticket = await db.tickets.find_one({"ticket_id": ticket_id}, {"title": 1, "workflow_name": 1, "status": 1})
            
            state = s.get("state", "UNKNOWN")
            emoji = status_emoji.get(state, "📌")
            step_name = s.get("step_name") or s.get("name") or "Task"
            
            result += f"{emoji} **{ticket_id}** - {ticket.get('title', 'Unknown')[:40] if ticket else 'Unknown'}\n"
            result += f"   Task: {step_name}\n"
            result += f"   State: {state} | Ticket Status: {ticket.get('status', 'N/A') if ticket else 'N/A'}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_my_tasks_by_status error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error retrieving tasks: {str(e)}"


@tool
async def get_tickets_i_work_on(status: Optional[str] = None, limit: int = 20) -> str:
    """
    Get all tickets where the current agent is assigned to any task.
    This shows tickets the agent works on (not tickets they requested).
    
    Args:
        status: Filter by ticket status (IN_PROGRESS, COMPLETED, etc.) - optional
        limit: Maximum tickets to return (default 20)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    user_aad_id = ctx.get("user_aad_id", "")
    logger.info(f"TOOL: get_tickets_i_work_on(user={user_email}, status={status})")
    
    try:
        db = get_async_database()
        limit = min(max(1, limit), 50)
        
        # Find all ticket_ids where user is assigned
        query_conditions = [
            {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        if user_aad_id:
            query_conditions.append({"assigned_to.aad_id": user_aad_id})
        
        step_query = {"$or": query_conditions}
        
        # Get distinct ticket IDs
        steps = await db.ticket_steps.find(step_query, {"ticket_id": 1}).to_list(500)
        ticket_ids = list(set(s.get("ticket_id") for s in steps if s.get("ticket_id")))
        
        if not ticket_ids:
            return "📭 You don't have any tickets assigned to you.\n\nNew tasks will appear here when assigned."
        
        # Get tickets
        ticket_query = {"ticket_id": {"$in": ticket_ids}}
        if status:
            ticket_query["status"] = status.upper()
        
        tickets = await db.tickets.find(ticket_query).sort("updated_at", -1).limit(limit).to_list(limit)
        
        if not tickets:
            return f"No tickets found with status '{status}'." if status else "No tickets found."
        
        result = f"## 🎯 Tickets You Work On ({len(tickets)})\n\n"
        
        status_emoji = {
            "IN_PROGRESS": "🔄",
            "COMPLETED": "✅",
            "CANCELLED": "❌",
            "WAITING_FOR_APPROVAL": "⏳",
            "WAITING_FOR_REQUESTER": "💬",
            "PENDING": "📋"
        }
        
        for t in tickets:
            emoji = status_emoji.get(t.get("status"), "📌")
            result += f"{emoji} **{t.get('ticket_id')}** - {t.get('title', 'Untitled')[:45]}\n"
            result += f"   Status: {t.get('status')} | Workflow: {t.get('workflow_name', 'N/A')}\n"
            result += f"   Requester: {t.get('requester', {}).get('display_name', 'Unknown')}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_tickets_i_work_on error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_agent_task_history(limit: int = 20) -> str:
    """
    Get completed task history for the current agent.
    Shows tasks the agent has completed with completion dates.
    
    Args:
        limit: Maximum tasks to return (default 20)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    user_aad_id = ctx.get("user_aad_id", "")
    logger.info(f"TOOL: get_agent_task_history(user={user_email})")
    
    try:
        db = get_async_database()
        limit = min(max(1, limit), 50)
        
        # Build query with both email and aad_id
        query_conditions = [
            {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        if user_aad_id:
            query_conditions.append({"assigned_to.aad_id": user_aad_id})
        
        query = {
            "$or": query_conditions,
            "state": "COMPLETED",
            "step_type": "TASK_STEP"
        }
        
        steps = await db.ticket_steps.find(query).sort("completed_at", -1).limit(limit).to_list(limit)
        
        if not steps:
            return "📭 No completed tasks found in your history.\n\nYour completed tasks will appear here."
        
        result = f"## ✅ Your Completed Tasks ({len(steps)})\n\n"
        
        for s in steps:
            ticket_id = s.get("ticket_id")
            ticket = await db.tickets.find_one({"ticket_id": ticket_id}, {"title": 1})
            
            step_name = s.get("step_name") or s.get("name") or "Task"
            completed_at = s.get("completed_at")
            
            result += f"✅ **{ticket_id}** - {ticket.get('title', 'Unknown')[:40] if ticket else 'Unknown'}\n"
            result += f"   Task: {step_name}\n"
            result += f"   Completed: {format_datetime(completed_at)}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_agent_task_history error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_agent_statistics() -> str:
    """
    Get comprehensive statistics for the current agent including
    task counts, completion rates, and performance metrics.
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    user_aad_id = ctx.get("user_aad_id", "")
    logger.info(f"TOOL: get_agent_statistics(user={user_email})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Build query with both email and aad_id
        query_conditions = [
            {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        if user_aad_id:
            query_conditions.append({"assigned_to.aad_id": user_aad_id})
        
        base_query = {"$or": query_conditions, "step_type": "TASK_STEP"}
        
        # Get counts by state
        total = await db.ticket_steps.count_documents(base_query)
        active = await db.ticket_steps.count_documents({**base_query, "state": "ACTIVE"})
        on_hold = await db.ticket_steps.count_documents({**base_query, "state": "ON_HOLD"})
        completed = await db.ticket_steps.count_documents({**base_query, "state": "COMPLETED"})
        
        # This week/month
        week_completed = await db.ticket_steps.count_documents({
            **base_query, 
            "state": "COMPLETED",
            "completed_at": {"$gte": week_ago}
        })
        month_completed = await db.ticket_steps.count_documents({
            **base_query, 
            "state": "COMPLETED",
            "completed_at": {"$gte": month_ago}
        })
        
        completion_rate = (completed / total * 100) if total > 0 else 0
        
        result = f"""## 📊 Your Agent Statistics

### Task Summary
| Metric | Count |
|--------|-------|
| **Total Tasks Assigned** | {total} |
| Active | {active} |
| On Hold | {on_hold} |
| Completed | {completed} |
| **Completion Rate** | {completion_rate:.1f}% |

### Recent Performance
| Period | Completed |
|--------|-----------|
| This Week | {week_completed} |
| This Month | {month_completed} |

💡 *Great work! Keep up the productivity!*
"""
        return result
        
    except Exception as e:
        logger.error(f"get_agent_statistics error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


# ==================== MANAGER/APPROVAL TOOLS ====================

@tool
async def get_pending_approvals() -> str:
    """
    Get pending approval requests for the current manager.
    Queries the approval_tasks collection for tasks where the user is the approver.
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    user_aad_id = ctx.get("user_aad_id", "")
    logger.info(f"TOOL: get_pending_approvals(user={user_email}, aad_id={user_aad_id})")
    
    try:
        db = get_async_database()
        
        # Query approval_tasks collection using both email AND aad_id for reliable matching
        # This matches how the backend repository does it
        query_conditions = [
            {"approver.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        
        # Also match by aad_id if available (most reliable method)
        if user_aad_id:
            query_conditions.append({"approver.aad_id": user_aad_id})
        
        query = {
            "decision": "PENDING",
            "$or": query_conditions
        }
        
        logger.info(f"Pending approvals query: {query}")
        approval_tasks = await db.approval_tasks.find(query).sort("created_at", 1).limit(20).to_list(20)
        
        if not approval_tasks:
            return "✅ **No pending approvals!** You're all caught up.\n\nIf you need to review your approval history or check on your team's performance, just let me know!"
        
        result = f"## ⏳ Pending Approvals ({len(approval_tasks)})\n\n"
        for task in approval_tasks:
            ticket_id = task.get("ticket_id")
            ticket = await db.tickets.find_one({"ticket_id": ticket_id})
            
            # Skip cancelled or rejected tickets
            if ticket and ticket.get("status") in ["CANCELLED", "REJECTED"]:
                continue
            
            if ticket:
                req = ticket.get("requester", {})
                result += f"**{ticket_id}** - {ticket.get('title', 'Untitled')}\n"
                result += f"   Workflow: {ticket.get('workflow_name', 'N/A')}\n"
                result += f"   Requested by: {format_user(req)}\n"
                result += f"   Created: {format_datetime(ticket.get('created_at'))}\n\n"
            else:
                result += f"**{ticket_id}** - (Ticket details not found)\n\n"
        
        result += "\n💡 *Go to the Approvals page to approve or reject these requests.*"
        return result
        
    except Exception as e:
        logger.error(f"get_pending_approvals error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error retrieving approvals: {str(e)}"


@tool
async def get_approval_history(limit: int = 20) -> str:
    """
    Get approval decision history for the current manager.
    Shows past approval decisions (APPROVED/REJECTED) from approval_tasks collection.
    
    Args:
        limit: Maximum records (default 20)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    user_aad_id = ctx.get("user_aad_id", "")
    logger.info(f"TOOL: get_approval_history(user={user_email}, aad_id={user_aad_id})")
    
    try:
        db = get_async_database()
        
        # Use both email and aad_id for reliable matching
        query_conditions = [
            {"approver.email": {"$regex": f"^{user_email}$", "$options": "i"}}
        ]
        if user_aad_id:
            query_conditions.append({"approver.aad_id": user_aad_id})
        
        query = {
            "$or": query_conditions,
            "decision": {"$in": ["APPROVED", "REJECTED"]}
        }
        
        logger.info(f"Approval history query: {query}")
        approvals = await db.approval_tasks.find(query).sort("decided_at", -1).limit(limit).to_list(limit)
        
        if not approvals:
            return "No approval history found. Once you make approval decisions, they will appear here."
        
        result = f"## 📋 Your Approval History ({len(approvals)})\n\n"
        
        # Count stats
        approved_count = sum(1 for a in approvals if a.get("decision") == "APPROVED")
        rejected_count = len(approvals) - approved_count
        
        result += f"**Summary:** ✅ {approved_count} approved | ❌ {rejected_count} rejected\n\n"
        
        for a in approvals:
            decision = a.get("decision", "UNKNOWN")
            emoji = "✅" if decision == "APPROVED" else "❌"
            
            # Get ticket title
            ticket_id = a.get('ticket_id')
            ticket = await db.tickets.find_one({"ticket_id": ticket_id}, {"title": 1})
            title = ticket.get("title", "Untitled") if ticket else "Unknown"
            
            result += f"{emoji} **{ticket_id}** - {title}\n"
            result += f"   Decision: {decision} | Date: {format_datetime(a.get('decided_at'))}\n"
            if a.get('comment'):
                comment = a.get('comment')
                if len(comment) > 80:
                    comment = comment[:77] + "..."
                result += f"   Comment: \"{comment}\"\n"
            result += "\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_approval_history error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_team_statistics() -> str:
    """
    Get team performance statistics including tickets, approvals, and SLA metrics.
    """
    logger.info("TOOL: get_team_statistics()")
    try:
        db = get_async_database()
        now = datetime.utcnow()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_ago = now - timedelta(days=7)
        
        total = await db.tickets.count_documents({})
        today_count = await db.tickets.count_documents({"created_at": {"$gte": today}})
        week_count = await db.tickets.count_documents({"created_at": {"$gte": week_ago}})
        
        in_progress = await db.tickets.count_documents({"status": "IN_PROGRESS"})
        pending = await db.tickets.count_documents({"status": "PENDING"})
        completed = await db.tickets.count_documents({"status": "COMPLETED"})
        
        pending_approvals = await db.ticket_steps.count_documents({
            "step_type": "APPROVAL_STEP",
            "state": {"$in": ["PENDING", "ACTIVE", "WAITING_FOR_APPROVAL"]}
        })
        
        completion_rate = round((completed / max(total, 1)) * 100, 1)
        
        return f"""## 📊 Team Statistics

### Ticket Volume
| Metric | Count |
|--------|-------|
| **This Week** | {week_count} |
| **Today** | {today_count} |
| **Total All Time** | {total} |

### Current Status
| Status | Count |
|--------|-------|
| **In Progress** | {in_progress} |
| **Pending** | {pending} |
| **Completed** | {completed} ✅ |

### Metrics
- **Pending Approvals:** {pending_approvals}
- **Completion Rate:** {completion_rate}%
"""
    except Exception as e:
        logger.error(f"get_team_statistics error: {e}")
        return f"Error: {str(e)}"


# ==================== ADMIN TOOLS ====================

@tool
async def get_system_overview() -> str:
    """
    Get comprehensive system overview with all key metrics.
    """
    logger.info("TOOL: get_system_overview()")
    try:
        db = get_async_database()
        now = datetime.utcnow()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Core counts
        tickets = await db.tickets.count_documents({})
        tickets_today = await db.tickets.count_documents({"created_at": {"$gte": today}})
        workflows = await db.workflows.count_documents({})
        published_workflows = await db.workflows.count_documents({"status": "PUBLISHED"})
        users = await db.admin_users.count_documents({})
        
        # Status breakdown
        in_progress = await db.tickets.count_documents({"status": "IN_PROGRESS"})
        pending = await db.tickets.count_documents({"status": "PENDING"})
        completed = await db.tickets.count_documents({"status": "COMPLETED"})
        
        # Activity
        notifications = await db.inapp_notifications.count_documents({"is_read": False})
        audit_events = await db.audit_events.count_documents({"timestamp": {"$gte": today}})
        
        return f"""## 📊 System Overview

### Core Metrics
| Metric | Count |
|--------|-------|
| **Total Tickets** | {tickets} |
| **Tickets Today** | {tickets_today} |
| **Workflows** | {workflows} ({published_workflows} published) |
| **Admin Users** | {users} |

### Ticket Status
| Status | Count |
|--------|-------|
| In Progress | {in_progress} |
| Pending | {pending} |
| Completed | {completed} ✅ |

### Activity
- **Unread Notifications:** {notifications}
- **Audit Events Today:** {audit_events}
- **Last Updated:** {now.strftime('%Y-%m-%d %H:%M UTC')}
"""
    except Exception as e:
        logger.error(f"get_system_overview error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_admin_users() -> str:
    """
    Get list of admin users with their roles and access levels.
    """
    logger.info("TOOL: get_admin_users()")
    try:
        db = get_async_database()
        
        users = await db.admin_users.find({}).to_list(50)
        
        if not users:
            return "No admin users found."
        
        result = f"## 👥 Admin Users ({len(users)})\n\n"
        for u in users:
            active = "✅" if u.get("is_active", True) else "❌"
            result += f"{active} **{u.get('display_name', u.get('email'))}**\n"
            result += f"   Email: {u.get('email')}\n"
            result += f"   Role: {u.get('role', 'user')}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_admin_users error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_user_access_list() -> str:
    """
    Get list of users with their access levels (designer, manager, agent).
    """
    logger.info("TOOL: get_user_access_list()")
    try:
        db = get_async_database()
        
        users = await db.user_access.find({}).to_list(50)
        
        if not users:
            return "No user access records found."
        
        result = f"## 👥 User Access ({len(users)})\n\n"
        for u in users:
            roles = []
            if u.get("has_designer_access"):
                roles.append("Designer")
            if u.get("has_manager_access"):
                roles.append("Manager")
            if u.get("has_agent_access"):
                roles.append("Agent")
            
            result += f"**{u.get('display_name', u.get('email'))}**\n"
            result += f"   Email: {u.get('email')}\n"
            result += f"   Roles: {', '.join(roles) if roles else 'None'}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_user_access_list error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_audit_events(
    event_type: Optional[str] = None,
    ticket_id: Optional[str] = None,
    limit: int = 30
) -> str:
    """
    Get audit events with optional filtering.
    
    Args:
        event_type: Filter by event type
        ticket_id: Filter by ticket ID
        limit: Maximum events (default 30)
    """
    logger.info(f"TOOL: get_audit_events(type={event_type}, ticket={ticket_id})")
    try:
        db = get_async_database()
        query = {}
        
        if event_type:
            query["event_type"] = {"$regex": event_type, "$options": "i"}
        if ticket_id:
            query["ticket_id"] = clean_ticket_id(ticket_id)
        
        events = await db.audit_events.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
        
        if not events:
            return "No audit events found."
        
        result = f"## 📜 Audit Events ({len(events)})\n\n"
        for e in events:
            actor = e.get("actor", {})
            result += f"**{e.get('event_type')}** - {format_datetime(e.get('timestamp'))}\n"
            result += f"   By: {actor.get('display_name', 'System')}\n"
            if e.get("ticket_id"):
                result += f"   Ticket: {e.get('ticket_id')}\n"
            result += "\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_audit_events error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_notifications(unread_only: bool = True, limit: int = 20) -> str:
    """
    Get in-app notifications for the current user.
    
    Args:
        unread_only: Only show unread notifications (default True)
        limit: Maximum notifications (default 20)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_notifications(user={user_email})")
    
    try:
        db = get_async_database()
        query = {"recipient_email": user_email}
        
        if unread_only:
            query["is_read"] = False
        
        notifs = await db.inapp_notifications.find(query).sort("created_at", -1).limit(limit).to_list(limit)
        
        if not notifs:
            return "🔔 No notifications to show."
        
        result = f"## 🔔 Notifications ({len(notifs)})\n\n"
        for n in notifs:
            emoji = "🔵" if not n.get("is_read") else "⚪"
            result += f"{emoji} **{n.get('title', 'Notification')}**\n"
            result += f"   {n.get('message', '')[:100]}\n"
            result += f"   {format_datetime(n.get('created_at'))}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_notifications error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_info_requests(status: Optional[str] = None) -> str:
    """
    Get information requests (clarification requests between users).
    
    Args:
        status: Filter by status (OPEN, RESPONDED, CLOSED, CANCELLED)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_info_requests(user={user_email})")
    
    try:
        db = get_async_database()
        query = {"$or": [
            {"requested_by.email": user_email},
            {"requested_from.email": user_email}
        ]}
        
        if status:
            query["status"] = status.upper()
        
        requests = await db.info_requests.find(query).sort("requested_at", -1).limit(20).to_list(20)
        
        if not requests:
            return "No information requests found."
        
        result = f"## 📩 Information Requests ({len(requests)})\n\n"
        for r in requests:
            emoji = {"OPEN": "⏳", "RESPONDED": "✅", "CLOSED": "✅", "CANCELLED": "❌"}.get(r.get("status"), "📝")
            result += f"{emoji} **{r.get('ticket_id')}** - {r.get('subject', 'No subject')}\n"
            result += f"   Status: {r.get('status')}\n"
            result += f"   From: {format_user(r.get('requested_by'))}\n"
            result += f"   To: {format_user(r.get('requested_from'))}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_info_requests error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_attachments(ticket_id: str) -> str:
    """
    Get ALL attachments for a specific ticket with full details.
    Shows filename, size, type, uploader, and which step it was attached to.
    
    Args:
        ticket_id: The ticket ID
    """
    logger.info(f"TOOL: get_attachments(ticket={ticket_id})")
    try:
        db = get_async_database()
        clean_id = clean_ticket_id(ticket_id)
        
        attachments = await db.attachments.find({"ticket_id": clean_id}).sort("uploaded_at", -1).to_list(50)
        
        if not attachments:
            return f"No attachments found for ticket {clean_id}."
        
        result = f"## 📎 Attachments for {clean_id} ({len(attachments)} files)\n\n"
        result += "| # | Filename | Size | Type | Uploaded By | Step | Date |\n"
        result += "|---|----------|------|------|-------------|------|------|\n"
        
        total_size = 0
        for i, a in enumerate(attachments, 1):
            size_bytes = a.get("size_bytes", a.get("file_size", 0))
            total_size += size_bytes
            
            if size_bytes > 1024 * 1024:
                size_str = f"{round(size_bytes / (1024*1024), 1)} MB"
            else:
                size_str = f"{round(size_bytes / 1024, 1)} KB"
            
            filename = a.get('original_filename', a.get('filename', 'Unknown'))
            if len(filename) > 25:
                filename = filename[:22] + "..."
            
            mime = a.get('mime_type', a.get('content_type', 'Unknown'))
            if len(str(mime)) > 15:
                mime = str(mime)[:12] + "..."
            
            uploader = a.get('uploaded_by', {})
            uploader_name = uploader.get('display_name', uploader.get('name', 'Unknown')) if uploader else 'Unknown'
            
            step_name = a.get('step_name', a.get('step_id', '-'))
            if len(str(step_name)) > 15:
                step_name = str(step_name)[:12] + "..."
            
            result += f"| {i} | {filename} | {size_str} | {mime} | {uploader_name} | {step_name} | {format_datetime(a.get('uploaded_at'))} |\n"
        
        # Total size
        if total_size > 1024 * 1024:
            total_str = f"{round(total_size / (1024*1024), 1)} MB"
        else:
            total_str = f"{round(total_size / 1024, 1)} KB"
        
        result += f"\n**Total Size:** {total_str}\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_attachments error: {e}")
        return f"Error: {str(e)}"


@tool
async def query_any_collection(
    collection: str,
    filter_json: str = "{}",
    limit: int = 10
) -> str:
    """
    Advanced tool: Query any MongoDB collection directly.
    Use for complex queries not covered by other tools.
    
    Args:
        collection: Collection name (tickets, workflows, admin_users, audit_events, etc.)
        filter_json: JSON string for MongoDB filter (e.g., '{"status": "COMPLETED"}')
        limit: Maximum documents (default 10)
    """
    logger.info(f"TOOL: query_any_collection(collection={collection})")
    
    allowed = [
        "tickets", "ticket_steps", "workflows", "workflow_versions",
        "admin_users", "user_access", "audit_events", "admin_audit",
        "approval_tasks", "assignments", "attachments", "info_requests",
        "inapp_notifications", "notification_outbox", "handover_requests"
    ]
    
    if collection not in allowed:
        return f"Collection '{collection}' not accessible. Allowed: {', '.join(allowed)}"
    
    try:
        db = get_async_database()
        
        try:
            query = json.loads(filter_json)
        except json.JSONDecodeError:
            return "Invalid JSON filter format. Use valid JSON like: {\"status\": \"COMPLETED\"}"
        
        docs = await db[collection].find(query).limit(limit).to_list(limit)
        
        if not docs:
            return f"No documents found in '{collection}' with the given filter."
        
        result = f"## 📊 Query Results: {collection} ({len(docs)} documents)\n\n"
        
        for doc in docs:
            doc.pop("_id", None)
            # Truncate long values
            display_doc = {}
            for k, v in list(doc.items())[:10]:
                if isinstance(v, str) and len(v) > 100:
                    display_doc[k] = v[:100] + "..."
                elif isinstance(v, (list, dict)):
                    display_doc[k] = f"[{type(v).__name__}]"
                else:
                    display_doc[k] = v
            result += f"```json\n{json.dumps(display_doc, default=str, indent=2)}\n```\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"query_any_collection error: {e}")
        return f"Error: {str(e)}"


# =============================================================================
# ADVANCED ANALYTICS TOOLS
# =============================================================================

@tool
async def get_tickets_analytics(
    group_by: str = "status",
    date_range: Optional[str] = None
) -> str:
    """
    Get comprehensive ticket analytics with grouping and filtering.
    
    Args:
        group_by: Group tickets by 'status', 'workflow', 'priority', 'requester', or 'agent'
        date_range: Filter by date range: 'today', 'week', 'month', 'all' (default: all)
    """
    logger.info(f"TOOL: get_tickets_analytics(group_by={group_by}, date_range={date_range})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        # Build date filter
        date_filter = {}
        now = datetime.utcnow()
        if date_range == "today":
            date_filter = {"created_at": {"$gte": now.replace(hour=0, minute=0, second=0)}}
        elif date_range == "week":
            date_filter = {"created_at": {"$gte": now - timedelta(days=7)}}
        elif date_range == "month":
            date_filter = {"created_at": {"$gte": now - timedelta(days=30)}}
        
        # Get total count
        total = await db.tickets.count_documents(date_filter)
        
        if total == 0:
            return f"📊 No tickets found for the specified date range ({date_range or 'all time'})."
        
        result = f"## 📊 Ticket Analytics\n"
        result += f"**Total Tickets:** {total}\n"
        result += f"**Date Range:** {date_range or 'All Time'}\n\n"
        
        group_by = group_by.lower()
        
        if group_by == "status":
            statuses = ["PENDING", "IN_PROGRESS", "WAITING_FOR_APPROVAL", "WAITING_FOR_REQUESTER", "COMPLETED", "CANCELLED", "REJECTED"]
            result += "### By Status\n\n| Status | Count | % |\n|--------|-------|---|\n"
            for status in statuses:
                query = {**date_filter, "status": status}
                count = await db.tickets.count_documents(query)
                if count > 0:
                    pct = (count / total) * 100
                    result += f"| {status} | {count} | {pct:.1f}% |\n"
                    
        elif group_by == "workflow":
            pipeline = [
                {"$match": date_filter} if date_filter else {"$match": {}},
                {"$group": {"_id": "$workflow_name", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 15}
            ]
            workflows = await db.tickets.aggregate(pipeline).to_list(15)
            result += "### By Workflow\n\n| Workflow | Count | % |\n|----------|-------|---|\n"
            for w in workflows:
                pct = (w["count"] / total) * 100
                result += f"| {w['_id'] or 'Unknown'} | {w['count']} | {pct:.1f}% |\n"
                
        elif group_by == "priority":
            priorities = ["CRITICAL", "HIGH", "NORMAL", "LOW"]
            result += "### By Priority\n\n| Priority | Count | % |\n|----------|-------|---|\n"
            for priority in priorities:
                query = {**date_filter, "priority": priority}
                count = await db.tickets.count_documents(query)
                if count > 0:
                    pct = (count / total) * 100
                    result += f"| {priority} | {count} | {pct:.1f}% |\n"
                    
        elif group_by == "requester":
            pipeline = [
                {"$match": date_filter} if date_filter else {"$match": {}},
                {"$group": {"_id": "$requester.email", "name": {"$first": "$requester.display_name"}, "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 15}
            ]
            requesters = await db.tickets.aggregate(pipeline).to_list(15)
            result += "### By Requester (Top 15)\n\n| Requester | Count |\n|-----------|-------|\n"
            for r in requesters:
                name = r.get("name") or r["_id"] or "Unknown"
                result += f"| {name} | {r['count']} |\n"
                
        elif group_by == "agent":
            # Get tickets grouped by assigned agent from ticket_steps
            pipeline = [
                {"$match": {"assigned_to": {"$exists": True}, "step_type": "TASK_STEP"}},
                {"$group": {"_id": "$assigned_to.email", "name": {"$first": "$assigned_to.display_name"}, "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 15}
            ]
            agents = await db.ticket_steps.aggregate(pipeline).to_list(15)
            result += "### By Assigned Agent (Top 15)\n\n| Agent | Tasks Assigned |\n|-------|----------------|\n"
            for a in agents:
                name = a.get("name") or a["_id"] or "Unknown"
                result += f"| {name} | {a['count']} |\n"
        else:
            return f"❌ Invalid group_by value: '{group_by}'. Use: status, workflow, priority, requester, or agent."
        
        return result
        
    except Exception as e:
        logger.error(f"get_tickets_analytics error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error getting analytics: {str(e)}"


@tool
async def get_rejected_tickets(limit: int = 20) -> str:
    """
    Get tickets that were rejected or cancelled, including rejection reasons.
    Shows who rejected, when, and why.
    
    Args:
        limit: Maximum number of tickets to return (default 20)
    """
    logger.info(f"TOOL: get_rejected_tickets(limit={limit})")
    
    try:
        db = get_async_database()
        
        # Validate limit
        limit = min(max(1, limit), 50)
        
        # Get rejected/cancelled tickets
        tickets = await db.tickets.find({
            "status": {"$in": ["REJECTED", "CANCELLED"]}
        }).sort("updated_at", -1).limit(limit).to_list(limit)
        
        if not tickets:
            return "✅ No rejected or cancelled tickets found."
        
        result = f"## ❌ Rejected/Cancelled Tickets ({len(tickets)})\n\n"
        
        for ticket in tickets:
            ticket_id = ticket.get("ticket_id", "Unknown")
            title = ticket.get("title", "Untitled")[:50]
            status = ticket.get("status", "UNKNOWN")
            
            # Get rejection details from approval_tasks
            rejection = await db.approval_tasks.find_one({
                "ticket_id": ticket_id,
                "decision": "REJECTED"
            })
            
            result += f"### {ticket_id} - {title}\n"
            result += f"- **Status:** {status}\n"
            result += f"- **Workflow:** {ticket.get('workflow_name', 'N/A')}\n"
            result += f"- **Requester:** {ticket.get('requester', {}).get('display_name', 'Unknown')}\n"
            
            if rejection:
                result += f"- **Rejected by:** {rejection.get('approver', {}).get('display_name', 'Unknown')}\n"
                result += f"- **Rejected at:** {format_datetime(rejection.get('decided_at'))}\n"
                if rejection.get("rejection_reason"):
                    result += f"- **Reason:** {rejection.get('rejection_reason')}\n"
            
            result += f"- **Updated:** {format_datetime(ticket.get('updated_at'))}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_rejected_tickets error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error getting rejected tickets: {str(e)}"


@tool
async def get_approval_analytics() -> str:
    """
    Get comprehensive approval analytics including approval rates, 
    average decision time, and rejection reasons.
    """
    logger.info("TOOL: get_approval_analytics()")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Get approval counts
        total_approvals = await db.approval_tasks.count_documents({})
        pending = await db.approval_tasks.count_documents({"decision": "PENDING"})
        approved = await db.approval_tasks.count_documents({"decision": "APPROVED"})
        rejected = await db.approval_tasks.count_documents({"decision": "REJECTED"})
        
        # This week's approvals
        week_approved = await db.approval_tasks.count_documents({
            "decision": "APPROVED",
            "decided_at": {"$gte": week_ago}
        })
        week_rejected = await db.approval_tasks.count_documents({
            "decision": "REJECTED",
            "decided_at": {"$gte": week_ago}
        })
        
        result = "## 📊 Approval Analytics\n\n"
        
        # Overall stats
        result += "### Overall Statistics\n\n"
        result += f"| Metric | Count |\n|--------|-------|\n"
        result += f"| Total Approval Requests | {total_approvals} |\n"
        result += f"| Pending | {pending} |\n"
        result += f"| Approved | {approved} |\n"
        result += f"| Rejected | {rejected} |\n"
        
        if approved + rejected > 0:
            approval_rate = (approved / (approved + rejected)) * 100
            result += f"| **Approval Rate** | **{approval_rate:.1f}%** |\n"
        
        result += "\n### This Week\n\n"
        result += f"- Approved: {week_approved}\n"
        result += f"- Rejected: {week_rejected}\n"
        
        # Top approvers
        pipeline = [
            {"$match": {"decision": {"$in": ["APPROVED", "REJECTED"]}}},
            {"$group": {
                "_id": "$approver.email",
                "name": {"$first": "$approver.display_name"},
                "approved": {"$sum": {"$cond": [{"$eq": ["$decision", "APPROVED"]}, 1, 0]}},
                "rejected": {"$sum": {"$cond": [{"$eq": ["$decision", "REJECTED"]}, 1, 0]}},
                "total": {"$sum": 1}
            }},
            {"$sort": {"total": -1}},
            {"$limit": 10}
        ]
        approvers = await db.approval_tasks.aggregate(pipeline).to_list(10)
        
        if approvers:
            result += "\n### Top Approvers\n\n"
            result += "| Approver | Approved | Rejected | Total |\n|----------|----------|----------|-------|\n"
            for a in approvers:
                name = a.get("name") or a["_id"] or "Unknown"
                result += f"| {name[:25]} | {a['approved']} | {a['rejected']} | {a['total']} |\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_approval_analytics error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error getting approval analytics: {str(e)}"


@tool
async def get_agent_performance(agent_email: Optional[str] = None) -> str:
    """
    Get agent performance metrics including tasks completed, average resolution time,
    and workload distribution.
    
    Args:
        agent_email: Specific agent email (optional - if not provided, shows all agents)
    """
    logger.info(f"TOOL: get_agent_performance(agent_email={agent_email})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        if agent_email:
            # Single agent performance
            agent_email_lower = agent_email.lower()
            
            # Get task stats
            total_tasks = await db.ticket_steps.count_documents({
                "assigned_to.email": {"$regex": f"^{agent_email_lower}$", "$options": "i"},
                "step_type": "TASK_STEP"
            })
            completed_tasks = await db.ticket_steps.count_documents({
                "assigned_to.email": {"$regex": f"^{agent_email_lower}$", "$options": "i"},
                "step_type": "TASK_STEP",
                "state": "COMPLETED"
            })
            active_tasks = await db.ticket_steps.count_documents({
                "assigned_to.email": {"$regex": f"^{agent_email_lower}$", "$options": "i"},
                "step_type": "TASK_STEP",
                "state": {"$in": ["ACTIVE", "WAITING_FOR_AGENT"]}
            })
            
            # This week completed
            week_completed = await db.ticket_steps.count_documents({
                "assigned_to.email": {"$regex": f"^{agent_email_lower}$", "$options": "i"},
                "step_type": "TASK_STEP",
                "state": "COMPLETED",
                "completed_at": {"$gte": week_ago}
            })
            
            result = f"## 👤 Agent Performance: {agent_email}\n\n"
            result += "### Task Statistics\n\n"
            result += f"| Metric | Count |\n|--------|-------|\n"
            result += f"| Total Tasks Assigned | {total_tasks} |\n"
            result += f"| Completed | {completed_tasks} |\n"
            result += f"| Active/In Progress | {active_tasks} |\n"
            result += f"| Completed This Week | {week_completed} |\n"
            
            if total_tasks > 0:
                completion_rate = (completed_tasks / total_tasks) * 100
                result += f"| **Completion Rate** | **{completion_rate:.1f}%** |\n"
            
        else:
            # All agents performance
            pipeline = [
                {"$match": {"step_type": "TASK_STEP", "assigned_to": {"$exists": True}}},
                {"$group": {
                    "_id": "$assigned_to.email",
                    "name": {"$first": "$assigned_to.display_name"},
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$state", "COMPLETED"]}, 1, 0]}},
                    "active": {"$sum": {"$cond": [{"$in": ["$state", ["ACTIVE", "WAITING_FOR_AGENT"]]}, 1, 0]}}
                }},
                {"$sort": {"total": -1}},
                {"$limit": 20}
            ]
            agents = await db.ticket_steps.aggregate(pipeline).to_list(20)
            
            if not agents:
                return "No agent task data found."
            
            result = "## 👥 All Agents Performance\n\n"
            result += "| Agent | Total Tasks | Completed | Active | Completion % |\n"
            result += "|-------|-------------|-----------|--------|-------------|\n"
            
            for a in agents:
                name = a.get("name") or a["_id"] or "Unknown"
                total = a["total"]
                completed = a["completed"]
                active = a["active"]
                rate = (completed / total * 100) if total > 0 else 0
                result += f"| {name[:25]} | {total} | {completed} | {active} | {rate:.0f}% |\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_agent_performance error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error getting agent performance: {str(e)}"


@tool
async def get_workflow_usage(workflow_name: Optional[str] = None) -> str:
    """
    Get workflow usage statistics - how many tickets use each workflow,
    completion rates, and average completion time.
    
    Args:
        workflow_name: Specific workflow name (optional - if not provided, shows all)
    """
    logger.info(f"TOOL: get_workflow_usage(workflow_name={workflow_name})")
    
    try:
        db = get_async_database()
        
        if workflow_name:
            # Single workflow usage
            query = {"workflow_name": {"$regex": workflow_name, "$options": "i"}}
            
            total = await db.tickets.count_documents(query)
            completed = await db.tickets.count_documents({**query, "status": "COMPLETED"})
            in_progress = await db.tickets.count_documents({**query, "status": "IN_PROGRESS"})
            pending = await db.tickets.count_documents({**query, "status": {"$in": ["PENDING", "WAITING_FOR_APPROVAL", "WAITING_FOR_REQUESTER"]}})
            cancelled = await db.tickets.count_documents({**query, "status": {"$in": ["CANCELLED", "REJECTED"]}})
            
            if total == 0:
                return f"No tickets found for workflow matching '{workflow_name}'."
            
            result = f"## 📈 Workflow Usage: {workflow_name}\n\n"
            result += f"| Metric | Count | % |\n|--------|-------|---|\n"
            result += f"| Total Tickets | {total} | 100% |\n"
            result += f"| Completed | {completed} | {(completed/total*100):.1f}% |\n"
            result += f"| In Progress | {in_progress} | {(in_progress/total*100):.1f}% |\n"
            result += f"| Pending/Waiting | {pending} | {(pending/total*100):.1f}% |\n"
            result += f"| Cancelled/Rejected | {cancelled} | {(cancelled/total*100):.1f}% |\n"
            
        else:
            # All workflows usage
            pipeline = [
                {"$group": {
                    "_id": "$workflow_name",
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$status", "COMPLETED"]}, 1, 0]}},
                    "in_progress": {"$sum": {"$cond": [{"$eq": ["$status", "IN_PROGRESS"]}, 1, 0]}}
                }},
                {"$sort": {"total": -1}},
                {"$limit": 20}
            ]
            workflows = await db.tickets.aggregate(pipeline).to_list(20)
            
            if not workflows:
                return "No workflow usage data found."
            
            result = "## 📈 Workflow Usage Statistics\n\n"
            result += "| Workflow | Total | Completed | In Progress | Completion % |\n"
            result += "|----------|-------|-----------|-------------|-------------|\n"
            
            for w in workflows:
                name = w["_id"] or "Unknown"
                total = w["total"]
                completed = w["completed"]
                in_progress = w["in_progress"]
                rate = (completed / total * 100) if total > 0 else 0
                result += f"| {name[:30]} | {total} | {completed} | {in_progress} | {rate:.0f}% |\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_workflow_usage error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error getting workflow usage: {str(e)}"


@tool
async def get_sla_report() -> str:
    """
    Get SLA compliance report showing overdue tickets, at-risk tickets,
    and average resolution times.
    """
    logger.info("TOOL: get_sla_report()")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        
        # Get overdue tasks (past due date)
        overdue_steps = await db.ticket_steps.count_documents({
            "due_at": {"$lt": now},
            "state": {"$in": ["ACTIVE", "WAITING_FOR_AGENT", "WAITING_FOR_APPROVAL"]}
        })
        
        # Get tasks due soon (within 24 hours)
        soon = now + timedelta(hours=24)
        at_risk = await db.ticket_steps.count_documents({
            "due_at": {"$gte": now, "$lt": soon},
            "state": {"$in": ["ACTIVE", "WAITING_FOR_AGENT", "WAITING_FOR_APPROVAL"]}
        })
        
        # Get open tickets older than 7 days
        week_ago = now - timedelta(days=7)
        stale_tickets = await db.tickets.count_documents({
            "created_at": {"$lt": week_ago},
            "status": {"$in": ["IN_PROGRESS", "WAITING_FOR_APPROVAL", "WAITING_FOR_REQUESTER"]}
        })
        
        # Get total active tickets
        active_tickets = await db.tickets.count_documents({
            "status": {"$in": ["IN_PROGRESS", "PENDING", "WAITING_FOR_APPROVAL", "WAITING_FOR_REQUESTER"]}
        })
        
        result = "## ⏰ SLA Compliance Report\n\n"
        
        # Overall health
        if overdue_steps == 0 and at_risk == 0:
            result += "✅ **SLA Status: HEALTHY** - No overdue or at-risk items!\n\n"
        elif overdue_steps > 0:
            result += f"⚠️ **SLA Status: AT RISK** - {overdue_steps} overdue items!\n\n"
        else:
            result += f"🟡 **SLA Status: CAUTION** - {at_risk} items due soon\n\n"
        
        result += "### Summary\n\n"
        result += f"| Metric | Count |\n|--------|-------|\n"
        result += f"| 🔴 Overdue Tasks | {overdue_steps} |\n"
        result += f"| 🟡 Due Within 24hrs | {at_risk} |\n"
        result += f"| 📅 Stale Tickets (>7 days) | {stale_tickets} |\n"
        result += f"| 📊 Total Active Tickets | {active_tickets} |\n"
        
        # List overdue items
        if overdue_steps > 0:
            overdue_list = await db.ticket_steps.find({
                "due_at": {"$lt": now},
                "state": {"$in": ["ACTIVE", "WAITING_FOR_AGENT", "WAITING_FOR_APPROVAL"]}
            }).sort("due_at", 1).limit(10).to_list(10)
            
            result += "\n### 🔴 Overdue Tasks (Top 10)\n\n"
            result += "| Ticket | Step | Assigned To | Overdue By |\n|--------|------|-------------|------------|\n"
            
            for step in overdue_list:
                ticket_id = step.get("ticket_id", "Unknown")
                step_name = step.get("step_name", "Unknown")[:20]
                assignee = step.get("assigned_to", {}).get("display_name", "Unassigned")[:15]
                due_at = step.get("due_at")
                if due_at:
                    overdue_by = now - due_at
                    days = overdue_by.days
                    hours = overdue_by.seconds // 3600
                    overdue_str = f"{days}d {hours}h" if days > 0 else f"{hours}h"
                else:
                    overdue_str = "N/A"
                result += f"| {ticket_id} | {step_name} | {assignee} | {overdue_str} |\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_sla_report error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error getting SLA report: {str(e)}"


# =============================================================================
# ADDITIONAL COMPREHENSIVE TOOLS
# =============================================================================

@tool
async def get_recent_activity(hours: int = 24, limit: int = 20) -> str:
    """
    Get recent activity across the system - tickets created, updated, completed.
    
    Args:
        hours: Look back period in hours (default 24)
        limit: Maximum items to return (default 20)
    """
    logger.info(f"TOOL: get_recent_activity(hours={hours})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        hours = min(max(1, hours), 168)  # Max 7 days
        limit = min(max(1, limit), 50)
        since = datetime.utcnow() - timedelta(hours=hours)
        
        result = f"## 📰 Recent Activity (Last {hours} hours)\n\n"
        
        # Recently created tickets
        new_tickets = await db.tickets.find({
            "created_at": {"$gte": since}
        }).sort("created_at", -1).limit(10).to_list(10)
        
        if new_tickets:
            result += f"### 🆕 New Tickets ({len(new_tickets)})\n"
            for t in new_tickets:
                result += f"- **{t.get('ticket_id')}** - {t.get('title', 'Untitled')[:40]}\n"
            result += "\n"
        
        # Recently completed tickets
        completed_tickets = await db.tickets.find({
            "status": "COMPLETED",
            "updated_at": {"$gte": since}
        }).sort("updated_at", -1).limit(10).to_list(10)
        
        if completed_tickets:
            result += f"### ✅ Completed ({len(completed_tickets)})\n"
            for t in completed_tickets:
                result += f"- **{t.get('ticket_id')}** - {t.get('title', 'Untitled')[:40]}\n"
            result += "\n"
        
        # Recent approvals
        recent_approvals = await db.approval_tasks.find({
            "decided_at": {"$gte": since},
            "decision": {"$in": ["APPROVED", "REJECTED"]}
        }).sort("decided_at", -1).limit(10).to_list(10)
        
        if recent_approvals:
            result += f"### 📋 Recent Approvals ({len(recent_approvals)})\n"
            for a in recent_approvals:
                emoji = "✅" if a.get("decision") == "APPROVED" else "❌"
                result += f"- {emoji} {a.get('ticket_id')} - {a.get('decision')} by {a.get('approver', {}).get('display_name', 'Unknown')}\n"
            result += "\n"
        
        if not new_tickets and not completed_tickets and not recent_approvals:
            result += "No recent activity found.\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_recent_activity error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_stuck_tickets(days: int = 7, limit: int = 20) -> str:
    """
    Get tickets that haven't been updated in X days - potentially stuck.
    
    Args:
        days: Number of days without update to consider stuck (default 7)
        limit: Maximum tickets to return (default 20)
    """
    logger.info(f"TOOL: get_stuck_tickets(days={days})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        days = min(max(1, days), 90)  # Max 90 days
        limit = min(max(1, limit), 50)
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        # Find tickets not completed/cancelled that haven't been updated
        tickets = await db.tickets.find({
            "status": {"$in": ["IN_PROGRESS", "WAITING_FOR_APPROVAL", "WAITING_FOR_REQUESTER", "WAITING_FOR_AGENT", "PENDING"]},
            "updated_at": {"$lt": cutoff}
        }).sort("updated_at", 1).limit(limit).to_list(limit)
        
        if not tickets:
            return f"✅ No stuck tickets! All active tickets have been updated within the last {days} days."
        
        result = f"## ⚠️ Potentially Stuck Tickets ({len(tickets)})\n"
        result += f"*Tickets not updated in {days}+ days*\n\n"
        
        for t in tickets:
            ticket_id = t.get("ticket_id")
            days_since = (datetime.utcnow() - t.get("updated_at", datetime.utcnow())).days
            
            result += f"### {ticket_id} - {t.get('title', 'Untitled')[:40]}\n"
            result += f"- **Status:** {t.get('status')}\n"
            result += f"- **Last Updated:** {days_since} days ago\n"
            result += f"- **Workflow:** {t.get('workflow_name', 'N/A')}\n"
            result += f"- **Requester:** {t.get('requester', {}).get('display_name', 'Unknown')}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_stuck_tickets error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_high_priority_items(limit: int = 20) -> str:
    """
    Get high and critical priority tickets and tasks that need attention.
    
    Args:
        limit: Maximum items to return (default 20)
    """
    logger.info(f"TOOL: get_high_priority_items()")
    
    try:
        db = get_async_database()
        limit = min(max(1, limit), 50)
        
        # Get high/critical priority open tickets
        tickets = await db.tickets.find({
            "priority": {"$in": ["HIGH", "CRITICAL"]},
            "status": {"$nin": ["COMPLETED", "CANCELLED", "REJECTED"]}
        }).sort("created_at", 1).limit(limit).to_list(limit)
        
        if not tickets:
            return "✅ No high or critical priority items pending!"
        
        critical = [t for t in tickets if t.get("priority") == "CRITICAL"]
        high = [t for t in tickets if t.get("priority") == "HIGH"]
        
        result = f"## 🔴 High Priority Items\n\n"
        
        if critical:
            result += f"### 🚨 CRITICAL ({len(critical)})\n\n"
            for t in critical:
                result += f"- **{t.get('ticket_id')}** - {t.get('title', 'Untitled')[:40]}\n"
                result += f"  Status: {t.get('status')} | Requester: {t.get('requester', {}).get('display_name', 'Unknown')}\n"
            result += "\n"
        
        if high:
            result += f"### ⚠️ HIGH ({len(high)})\n\n"
            for t in high:
                result += f"- **{t.get('ticket_id')}** - {t.get('title', 'Untitled')[:40]}\n"
                result += f"  Status: {t.get('status')} | Requester: {t.get('requester', {}).get('display_name', 'Unknown')}\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_high_priority_items error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_ticket_aging() -> str:
    """
    Get ticket aging report - how long tickets have been open, grouped by age.
    """
    logger.info("TOOL: get_ticket_aging()")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        
        # Define age buckets
        buckets = [
            ("< 1 day", timedelta(days=1)),
            ("1-3 days", timedelta(days=3)),
            ("3-7 days", timedelta(days=7)),
            ("1-2 weeks", timedelta(days=14)),
            ("2-4 weeks", timedelta(days=28)),
            ("> 1 month", timedelta(days=365))
        ]
        
        open_statuses = ["IN_PROGRESS", "WAITING_FOR_APPROVAL", "WAITING_FOR_REQUESTER", "WAITING_FOR_AGENT", "PENDING"]
        
        result = "## 📊 Ticket Aging Report\n\n"
        result += "| Age Bucket | Count |\n|------------|-------|\n"
        
        prev_cutoff = now
        total = 0
        
        for label, delta in buckets:
            cutoff = now - delta
            
            if label.startswith(">"):
                count = await db.tickets.count_documents({
                    "status": {"$in": open_statuses},
                    "created_at": {"$lt": cutoff}
                })
            else:
                count = await db.tickets.count_documents({
                    "status": {"$in": open_statuses},
                    "created_at": {"$gte": cutoff, "$lt": prev_cutoff}
                })
            
            if count > 0:
                result += f"| {label} | {count} |\n"
                total += count
            
            prev_cutoff = cutoff
        
        result += f"| **Total Open** | **{total}** |\n"
        
        # Oldest tickets
        oldest = await db.tickets.find({
            "status": {"$in": open_statuses}
        }).sort("created_at", 1).limit(5).to_list(5)
        
        if oldest:
            result += "\n### 📅 Oldest Open Tickets\n\n"
            for t in oldest:
                age = (now - t.get("created_at", now)).days
                result += f"- **{t.get('ticket_id')}** - {age} days old - {t.get('title', 'Untitled')[:35]}\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_aging error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_pending_info_requests(limit: int = 20) -> str:
    """
    Get pending information requests that need response.
    Shows who is waiting for information from whom.
    
    Args:
        limit: Maximum items to return (default 20)
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    logger.info(f"TOOL: get_pending_info_requests(user={user_email})")
    
    try:
        db = get_async_database()
        limit = min(max(1, limit), 50)
        
        # Get open info requests
        requests = await db.info_requests.find({
            "status": "OPEN"
        }).sort("requested_at", 1).limit(limit).to_list(limit)
        
        if not requests:
            return "✅ No pending information requests."
        
        result = f"## 💬 Pending Info Requests ({len(requests)})\n\n"
        
        # Separate into requests TO user and FROM user
        to_user = [r for r in requests if r.get("requested_from", {}).get("email", "").lower() == user_email.lower()]
        from_user = [r for r in requests if r.get("requested_by", {}).get("email", "").lower() == user_email.lower()]
        others = [r for r in requests if r not in to_user and r not in from_user]
        
        if to_user:
            result += f"### 📥 Awaiting YOUR Response ({len(to_user)})\n\n"
            for r in to_user:
                result += f"- **{r.get('ticket_id')}** - From: {r.get('requested_by', {}).get('display_name', 'Unknown')}\n"
                result += f"  Question: {r.get('question', 'N/A')[:60]}...\n"
            result += "\n"
        
        if from_user:
            result += f"### 📤 Awaiting Response FROM Others ({len(from_user)})\n\n"
            for r in from_user:
                result += f"- **{r.get('ticket_id')}** - To: {r.get('requested_from', {}).get('display_name', 'Unknown')}\n"
                result += f"  Question: {r.get('question', 'N/A')[:60]}...\n"
            result += "\n"
        
        if others and not to_user and not from_user:
            result += "### All Pending Requests\n\n"
            for r in others[:10]:
                result += f"- **{r.get('ticket_id')}** - {r.get('requested_by', {}).get('display_name', 'Unknown')} → {r.get('requested_from', {}).get('display_name', 'Unknown')}\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_pending_info_requests error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_daily_summary() -> str:
    """
    Get a summary of today's activity - tickets created, completed, pending actions.
    """
    ctx = get_tool_context()
    user_email = ctx.get("user_email", "")
    persona = ctx.get("persona", "requester")
    logger.info(f"TOOL: get_daily_summary(user={user_email}, persona={persona})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        result = "## 📅 Today's Summary\n\n"
        
        # System-wide stats
        created_today = await db.tickets.count_documents({"created_at": {"$gte": today}})
        completed_today = await db.tickets.count_documents({
            "status": "COMPLETED",
            "updated_at": {"$gte": today}
        })
        
        result += "### System-wide\n"
        result += f"- Tickets Created: {created_today}\n"
        result += f"- Tickets Completed: {completed_today}\n\n"
        
        # Persona-specific
        if persona == "agent":
            tasks_completed = await db.ticket_steps.count_documents({
                "assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"},
                "state": "COMPLETED",
                "completed_at": {"$gte": today}
            })
            pending_tasks = await db.ticket_steps.count_documents({
                "assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"},
                "state": {"$in": ["ACTIVE", "ON_HOLD"]},
                "step_type": "TASK_STEP"
            })
            result += "### Your Tasks Today\n"
            result += f"- Tasks Completed: {tasks_completed}\n"
            result += f"- Pending Tasks: {pending_tasks}\n"
            
        elif persona == "manager":
            approvals_made = await db.approval_tasks.count_documents({
                "approver.email": {"$regex": f"^{user_email}$", "$options": "i"},
                "decided_at": {"$gte": today}
            })
            pending_approvals = await db.approval_tasks.count_documents({
                "approver.email": {"$regex": f"^{user_email}$", "$options": "i"},
                "decision": "PENDING"
            })
            result += "### Your Approvals Today\n"
            result += f"- Decisions Made: {approvals_made}\n"
            result += f"- Pending Approvals: {pending_approvals}\n"
            
        elif persona == "requester":
            my_tickets = await db.tickets.count_documents({
                "requester.email": {"$regex": f"^{user_email}$", "$options": "i"},
                "created_at": {"$gte": today}
            })
            my_completed = await db.tickets.count_documents({
                "requester.email": {"$regex": f"^{user_email}$", "$options": "i"},
                "status": "COMPLETED",
                "updated_at": {"$gte": today}
            })
            result += "### Your Tickets Today\n"
            result += f"- Submitted: {my_tickets}\n"
            result += f"- Completed: {my_completed}\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_daily_summary error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_step_bottlenecks(workflow_name: Optional[str] = None) -> str:
    """
    Analyze which workflow steps take the longest or have the most delays.
    Helps identify bottlenecks in workflows.
    
    Args:
        workflow_name: Optional workflow name to analyze (analyzes all if not specified)
    """
    logger.info(f"TOOL: get_step_bottlenecks(workflow_name={workflow_name})")
    
    try:
        db = get_async_database()
        
        # Build match clause
        match_clause = {"state": {"$in": ["ACTIVE", "WAITING_FOR_APPROVAL", "WAITING_FOR_AGENT"]}}
        
        if workflow_name:
            # Get tickets for this workflow
            tickets = await db.tickets.find({
                "workflow_name": {"$regex": workflow_name, "$options": "i"}
            }, {"ticket_id": 1}).to_list(500)
            ticket_ids = [t["ticket_id"] for t in tickets]
            if not ticket_ids:
                return f"No tickets found for workflow '{workflow_name}'."
            match_clause["ticket_id"] = {"$in": ticket_ids}
        
        # Aggregate steps by step_name and step_type, count how many are stuck
        pipeline = [
            {"$match": match_clause},
            {"$group": {
                "_id": {"step_name": "$step_name", "step_type": "$step_type"},
                "count": {"$sum": 1},
                "ticket_ids": {"$push": "$ticket_id"}
            }},
            {"$sort": {"count": -1}},
            {"$limit": 15}
        ]
        
        results = await db.ticket_steps.aggregate(pipeline).to_list(15)
        
        if not results:
            return "✅ No bottlenecks detected - no steps are currently waiting."
        
        workflow_text = f" for '{workflow_name}'" if workflow_name else ""
        result = f"## 🚧 Step Bottlenecks{workflow_text}\n\n"
        result += "*Steps with the most items waiting*\n\n"
        result += "| Step Name | Type | Waiting |\n|-----------|------|--------|\n"
        
        for r in results:
            step_name = r["_id"].get("step_name", "Unknown")[:30]
            step_type = r["_id"].get("step_type", "UNKNOWN")
            count = r["count"]
            result += f"| {step_name} | {step_type} | {count} |\n"
        
        # Recommendation
        top_bottleneck = results[0] if results else None
        if top_bottleneck and top_bottleneck["count"] > 5:
            step_type = top_bottleneck["_id"].get("step_type", "")
            if step_type == "APPROVAL_STEP":
                result += "\n💡 **Recommendation:** The bottleneck is at approval steps. Consider following up with approvers."
            elif step_type == "TASK_STEP":
                result += "\n💡 **Recommendation:** Tasks are piling up. Consider reassigning or adding more agents."
        
        return result
        
    except Exception as e:
        logger.error(f"get_step_bottlenecks error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def get_user_tickets(user_email: str, limit: int = 20) -> str:
    """
    Get tickets for a specific user by email.
    Useful for managers/admins to check any user's tickets.
    
    Args:
        user_email: Email of the user to look up
        limit: Maximum tickets to return (default 20)
    """
    logger.info(f"TOOL: get_user_tickets(user_email={user_email})")
    
    try:
        db = get_async_database()
        limit = min(max(1, limit), 50)
        
        tickets = await db.tickets.find({
            "requester.email": {"$regex": f"^{user_email}$", "$options": "i"}
        }).sort("created_at", -1).limit(limit).to_list(limit)
        
        if not tickets:
            return f"No tickets found for user '{user_email}'."
        
        # Get user name
        user_name = tickets[0].get("requester", {}).get("display_name", user_email)
        
        result = f"## 🎫 Tickets for {user_name}\n\n"
        result += f"*{user_email}*\n\n"
        
        status_emoji = {
            "IN_PROGRESS": "🔄",
            "COMPLETED": "✅",
            "CANCELLED": "❌",
            "WAITING_FOR_APPROVAL": "⏳",
            "WAITING_FOR_REQUESTER": "💬",
            "PENDING": "📋"
        }
        
        for t in tickets:
            emoji = status_emoji.get(t.get("status"), "📌")
            result += f"{emoji} **{t.get('ticket_id')}** - {t.get('title', 'Untitled')[:40]}\n"
            result += f"   Status: {t.get('status')} | Created: {format_datetime(t.get('created_at'))}\n\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_user_tickets error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


@tool
async def compare_periods(period1: str = "this_week", period2: str = "last_week") -> str:
    """
    Compare ticket metrics between two time periods.
    
    Args:
        period1: First period - 'today', 'this_week', 'this_month'
        period2: Second period - 'yesterday', 'last_week', 'last_month'
    """
    logger.info(f"TOOL: compare_periods(period1={period1}, period2={period2})")
    
    try:
        db = get_async_database()
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Define period boundaries
        periods = {
            "today": (today, now),
            "yesterday": (today - timedelta(days=1), today),
            "this_week": (today - timedelta(days=today.weekday()), now),
            "last_week": (today - timedelta(days=today.weekday() + 7), today - timedelta(days=today.weekday())),
            "this_month": (today.replace(day=1), now),
            "last_month": ((today.replace(day=1) - timedelta(days=1)).replace(day=1), today.replace(day=1))
        }
        
        p1 = periods.get(period1, periods["this_week"])
        p2 = periods.get(period2, periods["last_week"])
        
        # Get counts for each period
        async def get_period_stats(start, end):
            created = await db.tickets.count_documents({"created_at": {"$gte": start, "$lt": end}})
            completed = await db.tickets.count_documents({
                "status": "COMPLETED",
                "updated_at": {"$gte": start, "$lt": end}
            })
            return {"created": created, "completed": completed}
        
        stats1 = await get_period_stats(*p1)
        stats2 = await get_period_stats(*p2)
        
        result = f"## 📊 Period Comparison\n\n"
        result += f"| Metric | {period1.replace('_', ' ').title()} | {period2.replace('_', ' ').title()} | Change |\n"
        result += "|--------|--------|--------|--------|\n"
        
        for metric in ["created", "completed"]:
            v1 = stats1[metric]
            v2 = stats2[metric]
            if v2 > 0:
                change = ((v1 - v2) / v2) * 100
                change_str = f"+{change:.0f}%" if change > 0 else f"{change:.0f}%"
            else:
                change_str = "N/A"
            result += f"| {metric.title()} | {v1} | {v2} | {change_str} |\n"
        
        return result
        
    except Exception as e:
        logger.error(f"compare_periods error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return f"Error: {str(e)}"


# =============================================================================
# CHANGE REQUEST TOOLS - For viewing and managing Change Requests
# =============================================================================

@tool
async def get_change_request_details(cr_id: str) -> str:
    """
    Get detailed information about a specific change request.
    
    Args:
        cr_id: The Change Request ID (e.g., CR-abc123def456)
    """
    logger.info(f"TOOL: get_change_request_details(cr_id={cr_id})")
    
    try:
        db = get_async_database()
        
        # Get CR with full details
        cr = await db.change_requests.find_one({"change_request_id": cr_id})
        
        if not cr:
            return f"❌ Change Request '{cr_id}' not found."
        
        # Get ticket details
        ticket = await db.tickets.find_one({"ticket_id": cr.get("ticket_id")})
        ticket_title = ticket.get("title", "Unknown") if ticket else "Unknown"
        
        result = f"## 📝 Change Request Details\n\n"
        result += f"**CR ID:** `{cr_id}`\n"
        result += f"**Ticket:** `{cr.get('ticket_id')}` - {ticket_title}\n"
        result += f"**Status:** {cr.get('status', 'PENDING')}\n"
        result += f"**Requested By:** {cr.get('requested_by', {}).get('display_name', 'Unknown')}\n"
        result += f"**Assigned To:** {cr.get('assigned_to', {}).get('display_name', 'Unknown')}\n"
        result += f"**Reason:** {cr.get('reason', 'No reason provided')}\n"
        result += f"**Created At:** {cr.get('created_at', 'Unknown')}\n"
        
        if cr.get("reviewed_at"):
            result += f"**Reviewed At:** {cr.get('reviewed_at')}\n"
            result += f"**Review Notes:** {cr.get('review_notes', 'None')}\n"
        
        # Field changes
        field_changes = cr.get("field_changes", [])
        if field_changes:
            result += f"\n### 📋 Proposed Changes ({len(field_changes)} field(s))\n\n"
            result += "| Field | Old Value | New Value |\n"
            result += "|-------|-----------|----------|\n"
            for change in field_changes[:10]:
                old_val = str(change.get("old_value", "-"))[:30]
                new_val = str(change.get("new_value", "-"))[:30]
                result += f"| {change.get('field_label', 'Field')} | {old_val} | {new_val} |\n"
            if len(field_changes) > 10:
                result += f"\n_...and {len(field_changes) - 10} more changes_\n"
        
        # Attachment changes
        attachment_changes = cr.get("attachment_changes", [])
        if attachment_changes:
            result += f"\n### 📎 Attachment Changes ({len(attachment_changes)})\n"
            for change in attachment_changes:
                result += f"- **{change.get('type', 'Change').upper()}:** {change.get('filename', 'Unknown file')}\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_change_request_details error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_my_pending_change_requests() -> str:
    """
    Get pending change requests that need your approval (for managers/approvers).
    Shows all CRs assigned to you that are still awaiting review.
    """
    logger.info("TOOL: get_my_pending_change_requests()")
    
    try:
        user_email = _current_user_email.get()
        user_aad_id = _current_user_aad_id.get()
        
        if not user_email:
            return "❌ User context not available."
        
        db = get_async_database()
        
        # Build query for pending CRs assigned to this user
        query = {
            "status": "PENDING",
            "$or": [
                {"assigned_to.email": {"$regex": f"^{user_email}$", "$options": "i"}},
            ]
        }
        if user_aad_id:
            query["$or"].append({"assigned_to.aad_id": user_aad_id})
        
        # Get pending CRs
        cursor = db.change_requests.find(query).sort("created_at", -1).limit(20)
        crs = await cursor.to_list(length=20)
        
        if not crs:
            return "✅ No pending change requests require your approval."
        
        # Get ticket titles
        ticket_ids = list(set(cr.get("ticket_id") for cr in crs))
        tickets = await db.tickets.find({"ticket_id": {"$in": ticket_ids}}).to_list(length=len(ticket_ids))
        ticket_map = {t.get("ticket_id"): t.get("title", "Unknown") for t in tickets}
        
        result = f"## 📝 Pending Change Requests ({len(crs)})\n\n"
        result += "| CR ID | Ticket | Requester | Changes | Created |\n"
        result += "|-------|--------|-----------|---------|----------|\n"
        
        for cr in crs:
            cr_id = cr.get("change_request_id", "Unknown")
            ticket_id = cr.get("ticket_id", "Unknown")
            ticket_title = ticket_map.get(ticket_id, "Unknown")[:25]
            requester = cr.get("requested_by", {}).get("display_name", "Unknown")
            changes_count = len(cr.get("field_changes", [])) + len(cr.get("attachment_changes", []))
            created = cr.get("created_at", "")[:10] if cr.get("created_at") else "Unknown"
            
            result += f"| `{cr_id}` | {ticket_title} | {requester} | {changes_count} | {created} |\n"
        
        result += f"\n💡 Use `get_change_request_details(cr_id)` for full details on a specific CR."
        
        return result
        
    except Exception as e:
        logger.error(f"get_my_pending_change_requests error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_change_request_history(ticket_id: str) -> str:
    """
    Get the history of all change requests for a specific ticket.
    Shows all CRs (pending, approved, rejected, cancelled) for the ticket.
    
    Args:
        ticket_id: The Ticket ID (e.g., TKT-abc123def456)
    """
    logger.info(f"TOOL: get_change_request_history(ticket_id={ticket_id})")
    
    try:
        db = get_async_database()
        
        # Get ticket info
        ticket = await db.tickets.find_one({"ticket_id": ticket_id})
        if not ticket:
            return f"❌ Ticket '{ticket_id}' not found."
        
        # Get all CRs for this ticket
        cursor = db.change_requests.find({"ticket_id": ticket_id}).sort("created_at", -1)
        crs = await cursor.to_list(length=50)
        
        if not crs:
            return f"ℹ️ No change requests found for ticket `{ticket_id}`."
        
        result = f"## 📜 Change Request History for `{ticket_id}`\n\n"
        result += f"**Ticket:** {ticket.get('title', 'Unknown')}\n"
        result += f"**Current Version:** {ticket.get('form_version', 1)}\n\n"
        
        # Status emoji map
        status_emoji = {
            "PENDING": "⏳",
            "APPROVED": "✅",
            "REJECTED": "❌",
            "CANCELLED": "🚫"
        }
        
        result += "| CR ID | Status | Requester | Changes | Created | Reviewed |\n"
        result += "|-------|--------|-----------|---------|---------|----------|\n"
        
        for cr in crs:
            status = cr.get("status", "PENDING")
            emoji = status_emoji.get(status, "❓")
            cr_id = cr.get("change_request_id", "Unknown")
            requester = cr.get("requested_by", {}).get("display_name", "Unknown")
            changes_count = len(cr.get("field_changes", [])) + len(cr.get("attachment_changes", []))
            created = cr.get("created_at", "")[:10] if cr.get("created_at") else "-"
            reviewed = cr.get("reviewed_at", "")[:10] if cr.get("reviewed_at") else "-"
            
            result += f"| `{cr_id}` | {emoji} {status} | {requester} | {changes_count} | {created} | {reviewed} |\n"
        
        # Summary
        approved = len([cr for cr in crs if cr.get("status") == "APPROVED"])
        rejected = len([cr for cr in crs if cr.get("status") == "REJECTED"])
        pending = len([cr for cr in crs if cr.get("status") == "PENDING"])
        
        result += f"\n**Summary:** {approved} approved, {rejected} rejected, {pending} pending"
        
        return result
        
    except Exception as e:
        logger.error(f"get_change_request_history error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_ticket_versions(ticket_id: str) -> str:
    """
    Get all form versions for a ticket, showing how the data evolved over time.
    Versions are created when change requests are approved.
    
    Args:
        ticket_id: The Ticket ID (e.g., TKT-abc123def456)
    """
    logger.info(f"TOOL: get_ticket_versions(ticket_id={ticket_id})")
    
    try:
        db = get_async_database()
        
        # Get ticket with versions
        ticket = await db.tickets.find_one({"ticket_id": ticket_id})
        if not ticket:
            return f"❌ Ticket '{ticket_id}' not found."
        
        versions = ticket.get("form_versions", [])
        current_version = ticket.get("form_version", 1)
        
        result = f"## 📚 Version History for `{ticket_id}`\n\n"
        result += f"**Ticket:** {ticket.get('title', 'Unknown')}\n"
        result += f"**Current Version:** {current_version}\n"
        result += f"**Total Versions:** {len(versions)}\n\n"
        
        if not versions:
            result += "ℹ️ Only original version exists (no change requests approved yet).\n"
            return result
        
        result += "| Version | Source | Created At | Created By | Changes |\n"
        result += "|---------|--------|------------|------------|----------|\n"
        
        for ver in versions:
            ver_num = ver.get("version", "?")
            source = ver.get("source", "UNKNOWN")
            source_emoji = "📤" if source == "ORIGINAL" else "📝" if source == "CHANGE_REQUEST" else "❓"
            created_at = ver.get("created_at", "")[:10] if ver.get("created_at") else "-"
            created_by = ver.get("created_by", {}).get("display_name", "Unknown")
            
            # Count field changes for CR-based versions
            changes = len(ver.get("field_changes", []))
            changes_str = f"{changes} field(s)" if changes > 0 else "-"
            
            result += f"| v{ver_num} | {source_emoji} {source} | {created_at} | {created_by} | {changes_str} |\n"
        
        result += f"\n💡 Use the ticket page to view detailed form data for each version."
        
        return result
        
    except Exception as e:
        logger.error(f"get_ticket_versions error: {e}")
        return f"Error: {str(e)}"


@tool
async def get_change_request_statistics() -> str:
    """
    Get overall change request statistics for managers.
    Shows counts by status, approval rates, and recent activity.
    """
    logger.info("TOOL: get_change_request_statistics()")
    
    try:
        db = get_async_database()
        
        # Get counts by status
        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        status_counts = await db.change_requests.aggregate(pipeline).to_list(length=10)
        
        total = sum(s.get("count", 0) for s in status_counts)
        
        if total == 0:
            return "ℹ️ No change requests found in the system."
        
        result = f"## 📊 Change Request Statistics\n\n"
        result += f"**Total CRs:** {total}\n\n"
        
        # Status breakdown
        result += "### Status Breakdown\n\n"
        status_emoji = {
            "PENDING": "⏳",
            "APPROVED": "✅",
            "REJECTED": "❌",
            "CANCELLED": "🚫"
        }
        
        for s in status_counts:
            status = s.get("_id", "UNKNOWN")
            count = s.get("count", 0)
            percentage = (count / total * 100) if total > 0 else 0
            emoji = status_emoji.get(status, "❓")
            result += f"- {emoji} **{status}:** {count} ({percentage:.1f}%)\n"
        
        # Approval rate
        approved = next((s.get("count", 0) for s in status_counts if s.get("_id") == "APPROVED"), 0)
        rejected = next((s.get("count", 0) for s in status_counts if s.get("_id") == "REJECTED"), 0)
        decided = approved + rejected
        
        if decided > 0:
            approval_rate = (approved / decided * 100)
            result += f"\n**Approval Rate:** {approval_rate:.1f}% ({approved} of {decided} decided)\n"
        
        # Recent CRs (last 7 days)
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_count = await db.change_requests.count_documents({
            "created_at": {"$gte": week_ago.isoformat()}
        })
        result += f"\n**CRs in Last 7 Days:** {recent_count}\n"
        
        # Top requesters
        requester_pipeline = [
            {"$group": {"_id": "$requested_by.display_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        top_requesters = await db.change_requests.aggregate(requester_pipeline).to_list(length=5)
        
        if top_requesters:
            result += "\n### Top Requesters\n"
            for r in top_requesters:
                result += f"- **{r.get('_id', 'Unknown')}:** {r.get('count', 0)} CRs\n"
        
        return result
        
    except Exception as e:
        logger.error(f"get_change_request_statistics error: {e}")
        return f"Error: {str(e)}"


# =============================================================================
# TOOL SETS BY PERSONA - Access Control Based on User's Persona Access
# =============================================================================

# =============================================================================
# BASE TOOLS - Available to ALL personas (essential ticket operations)
# =============================================================================
BASE_TOOLS = [
    # Ticket viewing and details
    get_ticket_details,         # View comprehensive ticket details
    get_ticket_notes,           # View all notes on a ticket
    get_ticket_info_requests,   # View info request threads on a ticket
    get_ticket_form_data,       # View form submissions on a ticket
    get_ticket_approvals,       # View approval status on a ticket
    get_ticket_timeline,        # View complete ticket history
    get_attachments,            # View attachments on a ticket
    
    # Search and discovery
    search_tickets,             # Search tickets with filters
    get_available_workflows,    # View available services to request
    
    # Notifications and info requests
    get_notifications,          # View user's notifications
    get_pending_info_requests,  # View pending info requests
    
    # Daily summary
    get_daily_summary,          # Today's summary for user's persona
    
    # Change Request tools
    get_change_request_details, # View details of a specific CR
    get_change_request_history, # View CR history for a ticket
    get_ticket_versions,        # View form version history
]

# Requester-specific tools - for users who submit requests
REQUESTER_TOOLS = [
    get_my_tickets,             # View own tickets
    get_ticket_statistics,      # View own ticket stats
    get_info_requests,          # View info requests sent to/from user
]

# Agent-specific tools - for managing assigned tasks
AGENT_TOOLS = [
    get_my_tasks,               # View tasks assigned to agent
    get_agent_workload,         # View agent's workload summary
    get_my_tasks_by_status,     # Filter tasks by status (on_hold, active, etc.)
    get_tickets_i_work_on,      # View tickets agent is working on
    get_agent_task_history,     # View completed task history
    get_agent_statistics,       # View agent's own performance stats
]

# Manager-specific tools - for approvals and team oversight
MANAGER_TOOLS = [
    get_pending_approvals,      # View pending approval requests
    get_approval_history,       # View past approval decisions
    get_team_statistics,        # View team performance metrics
    get_tickets_analytics,      # Analytics: group by status/workflow/agent/etc.
    get_rejected_tickets,       # View rejected/cancelled tickets with reasons
    get_approval_analytics,     # Approval rates, top approvers, etc.
    get_agent_performance,      # Agent performance metrics
    get_sla_report,             # SLA compliance, overdue tasks
    get_recent_activity,        # Recent activity across system
    get_stuck_tickets,          # Tickets not updated in X days
    get_high_priority_items,    # High/critical priority items
    get_ticket_aging,           # Ticket aging report
    get_step_bottlenecks,       # Workflow step bottlenecks
    get_user_tickets,           # View any user's tickets
    compare_periods,            # Compare metrics between periods
    
    # Change Request tools for managers
    get_my_pending_change_requests,   # View pending CRs needing approval
    get_change_request_statistics,    # CR analytics and trends
]

# Designer-specific tools - for workflow management
DESIGNER_TOOLS = [
    get_all_workflows,          # View all workflows (draft/published/archived)
    get_workflow_details,       # View workflow definition and steps
    get_workflow_statistics,    # View workflow usage statistics
    get_workflow_usage,         # Workflow usage by tickets
    get_step_bottlenecks,       # Analyze workflow step bottlenecks
    get_recent_activity,        # Recent activity
    get_ticket_aging,           # Ticket aging analysis
]

# Admin-specific tools - for system administration
ADMIN_TOOLS = [
    get_system_overview,        # View system-wide metrics
    get_admin_users,            # View admin users
    get_user_access_list,       # View user access levels
    get_audit_events,           # View audit trail
    query_any_collection,       # Query any MongoDB collection
    get_tickets_analytics,      # Analytics: group by status/workflow/agent/etc.
    get_rejected_tickets,       # View rejected/cancelled tickets with reasons
    get_approval_analytics,     # Approval rates, top approvers, etc.
    get_agent_performance,      # Agent performance metrics
    get_workflow_usage,         # Workflow usage by tickets
    get_sla_report,             # SLA compliance, overdue tasks
    get_recent_activity,        # Recent activity across system
    get_stuck_tickets,          # Tickets not updated in X days
    get_high_priority_items,    # High/critical priority items
    get_ticket_aging,           # Ticket aging report
    get_step_bottlenecks,       # Workflow step bottlenecks
    get_user_tickets,           # View any user's tickets
    compare_periods,            # Compare metrics between periods
]


def get_tools_for_persona(persona: str) -> List:
    """
    Get tools available for a specific persona.
    
    Tool access is based on the user's persona:
    - requester: Base + Requester tools
    - agent: Base + Requester + Agent tools
    - manager: Base + Requester + Manager tools
    - designer: Base + Requester + Designer + Admin tools (for analytics)
    - admin/superadmin: ALL tools
    
    All tools are READ-ONLY - no write/update/delete operations.
    """
    persona = persona.lower()
    tools = list(BASE_TOOLS)
    
    if persona == "requester":
        # Requesters can view their own tickets and available services
        tools.extend(REQUESTER_TOOLS)
        
    elif persona == "agent":
        # Agents can view their tasks + requester capabilities
        tools.extend(REQUESTER_TOOLS)
        tools.extend(AGENT_TOOLS)
        
    elif persona == "manager":
        # Managers can handle approvals + view team + requester capabilities
        tools.extend(REQUESTER_TOOLS)
        tools.extend(MANAGER_TOOLS)
        
    elif persona == "designer":
        # Designers can manage workflows + view analytics
        tools.extend(REQUESTER_TOOLS)
        tools.extend(DESIGNER_TOOLS)
        tools.extend(ADMIN_TOOLS)  # For workflow analytics
        
    elif persona in ["admin", "superadmin"]:
        # Admin/Superadmin gets EVERYTHING
        tools.extend(REQUESTER_TOOLS)
        tools.extend(AGENT_TOOLS)
        tools.extend(MANAGER_TOOLS)
        tools.extend(DESIGNER_TOOLS)
        tools.extend(ADMIN_TOOLS)
        
    else:
        # Default to requester tools for unknown personas
        tools.extend(REQUESTER_TOOLS)
    
    # Remove duplicates while preserving order (use tool name for comparison)
    seen_names = set()
    unique_tools = []
    for tool in tools:
        tool_name = tool.name if hasattr(tool, 'name') else str(tool)
        if tool_name not in seen_names:
            seen_names.add(tool_name)
            unique_tools.append(tool)
    
    return unique_tools


# =============================================================================
# SYSTEM PROMPTS
# =============================================================================

def get_system_prompt(user_name: str, user_email: str, persona: str) -> str:
    """
    Generate comprehensive, persona-specific system prompt.
    
    Each persona gets a tailored prompt with:
    - Role-specific capabilities
    - Available tools for that persona
    - Clear guidance on what questions can be answered
    - Proper handling for out-of-scope questions
    """
    
    # Persona-specific configuration
    persona_config = {
        "requester": {
            "role": "Requester Assistant",
            "description": "I help you track your service requests, view ticket status, browse available services, and understand workflow progress.",
            "capabilities": [
                "View all your submitted tickets and their current status",
                "Get detailed information about any ticket (steps, notes, attachments, form data)",
                "Search tickets by title, status, or workflow",
                "Browse available services/workflows you can request",
                "View your ticket statistics and completion rates",
                "Check your notifications and info requests",
                "View full timeline/history of any ticket"
            ],
            "example_questions": [
                '"What are my tickets?" or "Show my open tickets"',
                '"What is the status of TKT-xxxxx?"',
                '"Show notes on ticket TKT-xxxxx"',
                '"What services are available?"',
                '"Show my ticket statistics"'
            ],
            "tools_summary": "get_my_tickets, get_ticket_details, get_ticket_notes, get_ticket_statistics, get_available_workflows, search_tickets",
            "actions": "To create a new ticket, go to the **Catalog** page and select the service you need.",
            "out_of_scope": "I don't have access to agent task management, approval handling, or admin functions in this view."
        },
        "agent": {
            "role": "Agent Assistant",
            "description": "I help you manage your assigned TASKS (work items), track your workload, view tickets you work on, and monitor your performance. In this context, when you ask about 'tickets' I understand you mean your ASSIGNED WORK, not tickets you submitted.",
            "capabilities": [
                "View all TASKS currently assigned to you (your work queue)",
                "Filter your tasks by status: active, on_hold, waiting, completed",
                "Get your workload summary (active, on hold, completed counts)",
                "View tickets you are working on (assigned to you as an agent)",
                "See your completed task history",
                "View your agent statistics and performance metrics",
                "View detailed ticket information including notes and attachments"
            ],
            "example_questions": [
                '"What tasks are assigned to me?" or "Show my tasks"',
                '"Show my tasks that are on hold" or "Any tickets on hold?" (means tasks on hold)',
                '"What is my workload?"',
                '"Show tickets I work on"',
                '"Show my completed tasks" or "My task history"',
                '"Show my statistics" or "My performance"',
                '"Show details of ticket TKT-xxxxx"'
            ],
            "tools_summary": "get_my_tasks, get_my_tasks_by_status, get_agent_workload, get_tickets_i_work_on, get_agent_task_history, get_agent_statistics",
            "actions": "To complete tasks, go to **My Tasks** page. To request information, use the ticket details page.",
            "out_of_scope": "I don't have access to approval handling, workflow design, or admin functions in this view.",
            "critical_agent_guidance": """
⚠️ CRITICAL FOR AGENT PERSONA - READ THIS FIRST ⚠️

In the Agent context, users are asking about their ASSIGNED WORK (tasks), NOT tickets they submitted as a requester.

TERMINOLOGY TRANSLATION FOR AGENTS:
- "tickets on hold" → means "MY TASKS on hold" → use get_my_tasks_by_status(status='on_hold')
- "which tickets are on hold" → means "which tasks are on hold" → use get_my_tasks_by_status(status='on_hold')  
- "my tickets" → means "my assigned tasks" → use get_my_tasks
- "tickets I'm working on" → use get_tickets_i_work_on
- "any tickets pending" → means "my active tasks" → use get_my_tasks_by_status(status='active')

DO NOT use get_my_tickets for agent queries - that shows tickets the user REQUESTED as a customer.
ALWAYS use get_my_tasks or get_my_tasks_by_status for agent work-related queries.
"""
        },
        "manager": {
            "role": "Manager Assistant",
            "description": "I help you handle approvals, monitor team performance, analyze tickets, track SLA, and view comprehensive analytics.",
            "capabilities": [
                "View all pending approvals waiting for your decision",
                "See your approval history with decisions and comments",
                "Get team statistics and performance metrics",
                "Analyze tickets by status, workflow, agent, priority",
                "View rejected/cancelled tickets with reasons",
                "Get approval analytics (approval rates, top approvers)",
                "Monitor agent performance across the team",
                "View SLA compliance report (overdue, at-risk)",
                "View detailed ticket information"
            ],
            "example_questions": [
                '"Show my pending approvals" or "What approvals are waiting?"',
                '"Show my approval history"',
                '"How many tickets were rejected and why?"',
                '"Show tickets grouped by agent"',
                '"What is the approval rate?"',
                '"Show agent performance"',
                '"Any SLA risks?" or "Show overdue tasks"',
                '"Show tickets by workflow"'
            ],
            "tools_summary": "get_pending_approvals, get_approval_history, get_team_statistics, get_tickets_analytics, get_rejected_tickets, get_approval_analytics, get_agent_performance, get_sla_report",
            "actions": "To approve or reject requests, go to the **Approvals** page.",
            "out_of_scope": "I don't have access to workflow design in this view."
        },
        "designer": {
            "role": "Designer Assistant",
            "description": "I help you manage workflows, view detailed workflow definitions and steps, analyze usage, and monitor workflow performance.",
            "capabilities": [
                "View all workflows (published, draft, archived)",
                "Get DETAILED workflow definition including all steps and transitions",
                "View workflow usage statistics (tickets per workflow)",
                "See which workflows are most used",
                "Get workflow completion rates",
                "Access system data for analysis",
                "Query any collection for insights",
                "View audit events and user access"
            ],
            "example_questions": [
                '"How many workflows do we have?"',
                '"Show all published workflows"',
                '"Tell me the steps in Laptop Procurement workflow"',
                '"What are the workflow statistics?"',
                '"Which workflow is most used?"',
                '"Show usage for Laptop Procurement"',
                '"Show system overview"'
            ],
            "tools_summary": "get_all_workflows, get_workflow_details, get_workflow_statistics, get_workflow_usage, get_system_overview, query_any_collection",
            "actions": "To create or edit workflows, use the **Workflow Designer** page.",
            "out_of_scope": "I cannot create or modify workflows - use the Workflow Designer for that."
        },
        "admin": {
            "role": "Administrator Assistant",
            "description": "I provide full system access for monitoring, analysis, and troubleshooting. I can query any data in the system.",
            "capabilities": [
                "View comprehensive system overview with all metrics",
                "Access all admin users and their roles",
                "Query any MongoDB collection directly",
                "View all audit events and system logs",
                "Access all ticket, workflow, task, and approval data",
                "Monitor agent workload across the system",
                "View all pending approvals and team statistics"
            ],
            "example_questions": [
                '"Show system overview"',
                '"Who are the admin users?"',
                '"Show audit events"',
                '"Query the tickets collection"',
                '"What are all pending approvals?"',
                '"Show workflow statistics"'
            ],
            "tools_summary": "ALL tools available - get_system_overview, get_admin_users, get_audit_events, query_any_collection, plus all other persona tools",
            "actions": "Use the **Admin** pages for user management, system configuration, and advanced operations.",
            "out_of_scope": "I am read-only - I cannot modify, create, or delete any data."
        }
    }
    
    # Get config for persona (default to requester)
    config = persona_config.get(persona.lower(), persona_config["requester"])
    
    # Build capabilities list
    capabilities_list = "\n".join([f"- {c}" for c in config["capabilities"]])
    examples_list = "\n".join([f"- {e}" for e in config["example_questions"]])
    
    # Add critical guidance section for specific personas (Agent needs special handling)
    critical_guidance = ""
    if config.get("critical_agent_guidance"):
        critical_guidance = f"""
---

{config["critical_agent_guidance"]}

---
"""
    
    return f"""You are **NOVA**, an intelligent AI assistant for the NOVA.ai Workflow Platform.
{critical_guidance}

## Current Session
- **User:** {user_name} ({user_email})
- **Persona:** {config["role"]}
- **Time:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}

## About Me
{config["description"]}

## What I Can Help You With
{capabilities_list}

## Example Questions I Can Answer
{examples_list}

## Available Tools
{config["tools_summary"]}

---

## CRITICAL RULES - ALWAYS FOLLOW

### 1. ALWAYS USE TOOLS - NO HALLUCINATION
- **NEVER** make up or guess data. ALWAYS query the database using tools.
- If asked about specific tickets, tasks, or data - USE A TOOL to get real data.
- If a tool returns no results, say "No data found" - don't invent data.

### 2. READ-ONLY MODE - NO WRITE OPERATIONS
I am strictly **read-only**. I can ONLY query and display data.

If the user asks to CREATE, UPDATE, DELETE, CANCEL, or MODIFY anything, respond:
> "I'm a read-only assistant - I can view and search data, but I cannot make changes to the system. 
> {config["actions"]}"

Examples of write requests to DECLINE:
- "Delete this ticket" → Decline, redirect to UI
- "Cancel my request" → Decline, redirect to UI
- "Approve this ticket" → Decline, redirect to Approvals page
- "Create a new workflow" → Decline, redirect to Workflow Designer
- "Update the status" → Decline, redirect to appropriate page

### 3. OUT-OF-SCOPE QUESTIONS
{config["out_of_scope"]}

If asked about capabilities I don't have, respond helpfully:
> "That feature isn't available in the {config["role"]} view. You may need to switch to a different persona (if you have access) or contact your administrator."

### 4. COMPREHENSIVE RESPONSES
- When asked for details, use MULTIPLE tools if needed
- For ticket details, get notes AND info requests AND attachments
- Present data in clear, formatted tables when appropriate
- Include actionable next steps

### 5. USER CONTEXT
- The user's email ({user_email}) is automatically used to filter their personal data
- Tools like `get_my_tickets`, `get_my_tasks`, `get_pending_approvals` filter by this email
- Case-insensitive email matching is used

---

## MongoDB Schema Knowledge

### Core Collections:
| Collection | Key Fields |
|------------|------------|
| **tickets** | ticket_id, title, status, priority, workflow_name, requester, created_at, updated_at |
| **ticket_steps** | ticket_id, step_name, step_type (TASK_STEP/APPROVAL_STEP), state, assigned_to |
| **approval_tasks** | ticket_id, approver.email, decision (PENDING/APPROVED/REJECTED), decided_at |
| **info_requests** | ticket_id, requested_by, requested_from, question, response, status |
| **attachments** | ticket_id, original_filename, size_bytes, mime_type, uploaded_by |
| **workflows** | name, status (PUBLISHED/DRAFT/ARCHIVED), category, description, definition.steps[] |

### Status Values:
- **Ticket Status:** PENDING, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED, REJECTED
- **Step States:** PENDING, ACTIVE, ON_HOLD, WAITING_FOR_REQUESTER, WAITING_FOR_AGENT, COMPLETED
- **Approval Decisions:** PENDING, APPROVED, REJECTED

---

## Tool Selection Guide

### General Tools
| User Question | Tool to Use |
|---------------|-------------|
| "Show ticket details" | `get_ticket_details` |
| "Show notes on ticket" | `get_ticket_notes` |
| "Show info requests on ticket" | `get_ticket_info_requests` |
| "Show attachments" | `get_attachments` |
| "Show ticket timeline" | `get_ticket_timeline` |
| "What services available?" | `get_available_workflows` |

### Requester Tools (for tickets USER SUBMITTED)
| User Question | Tool to Use |
|---------------|-------------|
| "What are my tickets?" (as requester) | `get_my_tickets` |
| "My submitted requests" | `get_my_tickets` |

### Agent Tools (for WORK ASSIGNED to user) - USE THESE IN AGENT PERSONA!
| User Question | Tool to Use |
|---------------|-------------|
| "What tasks are assigned to me?" | `get_my_tasks` |
| "Show my tasks" | `get_my_tasks` |
| "Which tickets/tasks are on hold?" | `get_my_tasks_by_status(status='on_hold')` |
| "Tasks on hold" | `get_my_tasks_by_status(status='on_hold')` |
| "Active tasks" | `get_my_tasks_by_status(status='active')` |
| "Completed tasks" | `get_my_tasks_by_status(status='completed')` |
| "What is my workload?" | `get_agent_workload` |
| "Tickets I work on" | `get_tickets_i_work_on` |
| "My task history" | `get_agent_task_history` |
| "My performance/statistics" | `get_agent_statistics` |

### Manager Tools
| User Question | Tool to Use |
|---------------|-------------|
| "Show pending approvals" | `get_pending_approvals` |
| "Show approval history" | `get_approval_history` |
| "Show team statistics" | `get_team_statistics` |

### Designer/Admin Tools
| User Question | Tool to Use |
|---------------|-------------|
| "Show all workflows" | `get_all_workflows` |
| "Show system overview" | `get_system_overview` |
| "Show audit events" | `get_audit_events` |

---

## Response Formatting

- Use **markdown** for clear formatting
- Use **tables** for statistics and lists
- Use **emojis** sparingly for visual appeal (✅ ❌ ⏳ 📋 📊)
- **Bold** important values
- Always include **next steps** or **actionable advice**
- Keep responses **concise but comprehensive**

---

## Actions for This Persona
{config["actions"]}

---

Remember: Query real data, provide accurate responses, and help users accomplish their goals within this persona's scope!"""


# =============================================================================
# LANGGRAPH AGENT
# =============================================================================

class NOVALangGraphAgent:
    """Production-grade LangGraph agent with comprehensive MongoDB access"""
    
    def __init__(self):
        self.llm = None
        self._init_llm()
    
    def _init_llm(self):
        """Initialize Azure OpenAI LLM"""
        try:
            if settings.azure_openai_endpoint and settings.azure_openai_api_key:
                self.llm = AzureChatOpenAI(
                    azure_endpoint=settings.azure_openai_endpoint,
                    api_key=settings.azure_openai_api_key,
                    api_version=settings.azure_openai_api_version,
                    deployment_name=settings.azure_openai_deployment,
                    temperature=0.3,
                    max_tokens=4000,
                )
                logger.info("NOVA LangGraph Agent: Azure OpenAI LLM initialized")
            else:
                logger.error("NOVA Agent: Azure OpenAI not configured")
        except Exception as e:
            logger.error(f"NOVA Agent LLM init error: {e}")
    
    def _build_graph(self, tools: List) -> StateGraph:
        """Build the LangGraph state machine"""
        
        llm_with_tools = self.llm.bind_tools(tools)
        
        async def agent_node(state: AgentState) -> Dict:
            messages = state["messages"]
            response = await llm_with_tools.ainvoke(messages)
            return {"messages": [response]}
        
        tool_node = ToolNode(tools)
        
        def should_continue(state: AgentState) -> Literal["tools", "end"]:
            messages = state["messages"]
            last_message = messages[-1]
            if hasattr(last_message, "tool_calls") and last_message.tool_calls:
                return "tools"
            return "end"
        
        graph = StateGraph(AgentState)
        graph.add_node("agent", agent_node)
        graph.add_node("tools", tool_node)
        graph.set_entry_point("agent")
        graph.add_conditional_edges("agent", should_continue, {"tools": "tools", "end": END})
        graph.add_edge("tools", "agent")
        
        return graph.compile()
    
    async def chat(
        self,
        message: str,
        user_email: str,
        user_name: str,
        persona: str,
        user_aad_id: str = ""
    ) -> str:
        """Process a chat message through the LangGraph agent"""
        
        if not self.llm:
            return "AI service not configured. Please check Azure OpenAI settings."
        
        session_id = f"{user_email}_{persona}"
        logger.info(f"NOVA Chat: user={user_email}, persona={persona}, message='{message[:50]}...'")
        
        try:
            set_tool_context(user_email, persona, user_aad_id)
            await memory.add(session_id, "user", message)
            history = await memory.get(session_id)
            
            system_prompt = get_system_prompt(user_name, user_email, persona)
            messages: List[BaseMessage] = [SystemMessage(content=system_prompt)]
            
            for h in history[:-1]:
                role = h.get("role", "user")
                content = h.get("content", "")
                if role == "user":
                    messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    messages.append(AIMessage(content=content))
            
            messages.append(HumanMessage(content=message))
            
            tools = get_tools_for_persona(persona)
            tool_names = [t.name for t in tools]
            logger.info(f"Tools for {persona}: {tool_names}")
            graph = self._build_graph(tools)
            
            initial_state: AgentState = {
                "messages": messages,
                "user_email": user_email,
                "user_name": user_name,
                "persona": persona,
                "session_id": session_id,
            }
            
            logger.info(f"Running LangGraph with {len(messages)} messages, {len(tools)} tools for persona={persona}")
            result = await graph.ainvoke(initial_state)
            
            final_messages = result.get("messages", [])
            if final_messages:
                last_message = final_messages[-1]
                if isinstance(last_message, AIMessage):
                    response = last_message.content
                else:
                    response = str(last_message)
            else:
                response = "I couldn't process your request. Please try again."
            
            await memory.add(session_id, "assistant", response)
            logger.info(f"Response: {response[:100]}...")
            return response
            
        except Exception as e:
            logger.error(f"NOVA chat error: {e}")
            logger.error(traceback.format_exc())
            return f"I encountered an error: {str(e)}. Please try again."
    
    async def clear_memory(self, user_email: str, persona: str):
        """Clear conversation memory"""
        session_id = f"{user_email}_{persona}"
        await memory.clear(session_id)
        logger.info(f"Cleared memory for {session_id}")


# =============================================================================
# GLOBAL INSTANCE & INTERFACE
# =============================================================================

_agent: Optional[NOVALangGraphAgent] = None


def get_agent() -> NOVALangGraphAgent:
    """Get or create the agent instance"""
    global _agent
    if _agent is None:
        _agent = NOVALangGraphAgent()
    return _agent


async def chat_with_nova(
    message: str,
    user_email: str,
    user_name: str,
    persona: str,
    user_aad_id: str = ""
) -> Dict[str, Any]:
    """Main chat interface"""
    agent = get_agent()
    response = await agent.chat(message, user_email, user_name, persona, user_aad_id)
    return {"response": response, "actions": []}


async def clear_nova_memory(user_email: str, persona: str):
    """Clear conversation memory"""
    agent = get_agent()
    await agent.clear_memory(user_email, persona)


async def get_nova_history(user_email: str, persona: str) -> List[Dict]:
    """Get conversation history from MongoDB"""
    session_id = f"{user_email}_{persona}"
    return await memory.get(session_id)

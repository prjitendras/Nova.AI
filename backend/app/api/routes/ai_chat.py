"""
AI Chat API Routes - Persona-aware AI assistant endpoints

Provides:
- Chat endpoint for conversational AI
- Quick insights endpoint for dashboard widgets
- Dashboard stats endpoint for real-time metrics
"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..deps import get_current_user_dep
from ...domain.models import ActorContext
from ...services.nova_agent import chat_with_nova, clear_nova_memory
from ...utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/ai-chat", tags=["AI Chat"])


# ============================================================================
# Request/Response Models
# ============================================================================

class ChatMessage(BaseModel):
    """A single chat message"""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Request to send a chat message"""
    message: str = Field(..., min_length=1, max_length=2000, description="User's message")
    persona: str = Field(..., description="Current persona: requester, agent, manager, designer, admin")
    conversation_history: List[ChatMessage] = Field(default=[], description="Previous messages")


class ChatAction(BaseModel):
    """An action suggested by AI"""
    type: str = Field(..., description="Action type: navigate, show_tickets, etc.")
    path: Optional[str] = Field(None, description="Navigation path if applicable")
    filters: Optional[Dict[str, Any]] = Field(None, description="Filters if applicable")


class ChatResponse(BaseModel):
    """Response from AI chat"""
    response: str = Field(..., description="AI's response text")
    actions: List[ChatAction] = Field(default=[], description="Suggested actions")


class InsightItem(BaseModel):
    """A single insight item"""
    type: str = Field(..., description="Insight type: info, warning, error, success, tip")
    icon: str = Field(..., description="Icon name")
    title: str = Field(..., description="Insight title")
    message: str = Field(..., description="Insight message")
    action: Optional[ChatAction] = Field(None, description="Associated action")


class InsightsResponse(BaseModel):
    """Response containing quick insights"""
    insights: List[InsightItem]


class DashboardStatsResponse(BaseModel):
    """Response containing dashboard statistics"""
    stats: Dict[str, Any]
    persona: str


# ============================================================================
# Routes
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Send a message to the NOVA AI Assistant (LangGraph Agent)
    
    This agent has:
    - Access to ALL MongoDB collections
    - Persistent memory (stored in MongoDB)
    - Natural language query capabilities
    - Workflow creation abilities
    
    Returns a conversational response with real data.
    """
    try:
        result = await chat_with_nova(
            message=request.message,
            user_email=actor.email,
            user_name=actor.display_name,
            persona=request.persona.lower(),
            user_aad_id=actor.aad_id  # Pass aad_id for reliable user matching
        )
        
        return ChatResponse(
            response=result["response"],
            actions=[]  # Pure conversational - no navigation actions
        )
    
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "AI_CHAT_ERROR", "message": str(e)}}
        )


@router.get("/insights/{persona}", response_model=InsightsResponse)
async def get_insights(
    persona: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get quick insights for the current user and persona
    """
    # Simple static insights - the main AI is in the chat
    insights = [
        InsightItem(
            type="tip",
            icon="sparkles",
            title="AI-Powered Assistant",
            message="Ask me anything about tickets, workflows, or system data!",
            action=None
        )
    ]
    return InsightsResponse(insights=insights)


@router.get("/stats/{persona}", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    persona: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get persona-specific dashboard statistics
    """
    # Return empty - stats are fetched via chat
    return DashboardStatsResponse(stats={}, persona=persona.lower())


@router.get("/history/{persona}")
async def get_conversation_history(
    persona: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get conversation history for the current user and persona.
    Returns messages from MongoDB for session persistence.
    """
    try:
        from ...services.nova_agent import get_nova_history
        messages = await get_nova_history(actor.email, persona.lower())
        return {"messages": messages, "persona": persona.lower()}
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        return {"messages": [], "persona": persona.lower()}


@router.post("/clear-history/{persona}")
async def clear_conversation_history(
    persona: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Clear conversation history for the current user and persona.
    Memory is stored in MongoDB and persists across sessions.
    """
    try:
        await clear_nova_memory(actor.email, persona.lower())
        return {"success": True, "message": "Conversation history cleared from MongoDB"}
    except Exception as e:
        logger.error(f"Error clearing history: {e}")
        return {"success": False, "message": str(e)}


@router.get("/suggested-prompts/{persona}")
async def get_suggested_prompts(
    persona: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get suggested prompts based on persona
    
    Returns a list of example questions/commands the user can ask.
    """
    prompts = {
        "requester": [
            "How many open tickets do I have?",
            "Show me the details of my latest ticket",
            "What services can I request?",
            "Give me my ticket statistics",
            "What's the status of TKT-..."
        ],
        "agent": [
            "What tasks are assigned to me?",
            "Show my pending work",
            "How many tasks have I completed?",
            "Which tickets need my attention?",
            "Give me my productivity stats"
        ],
        "manager": [
            "What approvals are waiting for me?",
            "Show me team statistics",
            "How many tickets are open system-wide?",
            "Are there any SLA risks?",
            "Generate a performance report"
        ],
        "designer": [
            "Create a workflow for employee onboarding",
            "Generate a purchase approval workflow",
            "Show me all published workflows",
            "Help me design a leave request process",
            "What workflows are in draft status?"
        ],
        "admin": [
            "Show system health status",
            "How many tickets were created today?",
            "Give me the overall statistics",
            "Are there any failed notifications?",
            "System performance overview"
        ]
    }
    
    return {
        "prompts": prompts.get(persona.lower(), prompts["requester"]),
        "persona": persona.lower()
    }


# ============================================================================
# NOVA PULSE - AI-Powered Dashboard Intelligence
# Uses Azure OpenAI to generate true natural language insights
# ============================================================================

class TicketBriefing(BaseModel):
    """AI-generated briefing for a single ticket"""
    ticket_id: str
    title: str
    status: str
    ai_summary: str = Field(..., description="AI-generated natural language summary")
    ai_action: Optional[str] = Field(None, description="Recommended action if any")
    priority_score: int = Field(default=0, description="AI-assessed priority (0-100)")
    sentiment: str = Field(default="neutral", description="Overall sentiment: positive, neutral, urgent")


class NOVAPulseResponse(BaseModel):
    """NOVA Pulse - AI Command Center Response"""
    greeting: str = Field(..., description="Personalized AI greeting")
    overall_summary: str = Field(..., description="AI-generated overall summary")
    ticket_briefings: List[TicketBriefing] = Field(default=[], description="Individual ticket AI briefings")
    smart_recommendations: List[str] = Field(default=[], description="AI recommendations")
    productivity_insight: Optional[str] = Field(None, description="Productivity analysis")
    generated_at: str
    ai_powered: bool = Field(default=True)


@router.get("/nova-pulse", response_model=NOVAPulseResponse)
async def get_nova_pulse(
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    NOVA Pulse - AI Command Center
    
    Uses Azure OpenAI to generate true natural language insights:
    - Personalized greeting based on time and context
    - AI-powered ticket summaries explaining status in plain English
    - Smart action recommendations
    - Productivity analysis
    """
    from datetime import datetime
    from ...repositories.async_mongo import get_async_database
    from ...config.settings import settings
    
    try:
        db = get_async_database()
        user_email = actor.email.lower()
        user_name = actor.display_name.split()[0] if actor.display_name else "there"
        now = datetime.utcnow()
        hour = now.hour
        
        # Get user's tickets - limit to 3 for faster response
        tickets = await db.tickets.find({
            "requester.email": {"$regex": f"^{user_email}$", "$options": "i"}
        }).sort("updated_at", -1).to_list(5)
        
        # Prepare ticket data for AI analysis
        ticket_summaries = []
        for ticket in tickets[:3]:  # Analyze top 3 recent tickets for speed
            ticket_id = ticket.get("ticket_id", "")
            
            # Get current step info
            current_step = await db.ticket_steps.find_one({
                "ticket_id": ticket_id,
                "state": {"$in": ["ACTIVE", "WAITING_FOR_APPROVAL", "WAITING_FOR_AGENT", "WAITING_FOR_REQUESTER"]}
            })
            
            step_info = None
            if current_step:
                assigned_to = current_step.get("assigned_to")
                step_info = {
                    "name": current_step.get("step_name", "Unknown"),
                    "type": current_step.get("step_type", ""),
                    "state": current_step.get("state", ""),
                    "assignee": assigned_to.get("display_name", "") if assigned_to else ""
                }
            
            ticket_summaries.append({
                "ticket_id": ticket_id,
                "title": ticket.get("title", ""),
                "status": ticket.get("status", ""),
                "workflow": ticket.get("workflow_name", ""),
                "created_at": ticket.get("created_at", ""),
                "updated_at": ticket.get("updated_at", ""),
                "current_step": step_info
            })
        
        # Generate AI insights using Azure OpenAI
        briefings, overall_summary, recommendations, productivity = await _generate_ai_insights(
            user_name=user_name,
            tickets=ticket_summaries,
            hour=hour,
            settings=settings
        )
        
        # No greeting in API response - greeting is shown in dashboard header already
        greeting = ""
        
        return NOVAPulseResponse(
            greeting=greeting,
            overall_summary=overall_summary,
            ticket_briefings=briefings,
            smart_recommendations=recommendations,
            productivity_insight=productivity,
            generated_at=now.isoformat(),
            ai_powered=True
        )
        
    except Exception as e:
        logger.error(f"NOVA Pulse error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return NOVAPulseResponse(
            greeting=f"Hello! I'm having trouble analyzing your tickets right now.",
            overall_summary="Unable to generate AI insights at this moment. Please try again.",
            ticket_briefings=[],
            smart_recommendations=["Try refreshing in a moment"],
            productivity_insight=None,
            generated_at=datetime.utcnow().isoformat(),
            ai_powered=False
        )


async def _generate_ai_insights(user_name: str, tickets: list, hour: int, settings) -> tuple:
    """Generate AI insights using Azure OpenAI"""
    from langchain_openai import AzureChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage
    import json
    
    briefings = []
    overall_summary = "No active tickets to analyze."
    recommendations = []
    productivity = None
    
    if not tickets:
        recommendations = [
            "Browse the service catalog to discover available workflows",
            "Start with a simple request to see how the process works"
        ]
        return briefings, overall_summary, recommendations, productivity
    
    try:
        # Initialize Azure OpenAI
        if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
            # Fallback to template-based insights
            return _generate_fallback_insights(tickets)
        
        llm = AzureChatOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
            deployment_name=settings.azure_openai_deployment,
            temperature=0.7,
            max_tokens=1500,
        )
        
        # Prepare prompt
        tickets_json = json.dumps(tickets, indent=2, default=str)
        
        system_prompt = """You are NOVA Pulse, an intelligent AI assistant that provides briefings about service requests.

IMPORTANT: Do NOT include any greetings like "Good morning", "Hello", "Hi" etc. The greeting is already shown in the dashboard.

Your role is to analyze ticket data and provide:
1. A brief overall summary (2-3 sentences) - just describe the ticket status, NO GREETING
2. For each ticket, a natural language explanation of what's happening
3. Smart recommendations based on the current state
4. A brief productivity insight

Be helpful and use plain English. Avoid technical jargon.

IMPORTANT: Respond ONLY with valid JSON:
{
  "overall_summary": "Summary of your tickets (NO GREETING - just status)",
  "ticket_briefings": [
    {
      "ticket_id": "TKT-xxx",
      "ai_summary": "Natural language explanation",
      "ai_action": "Recommended action or null",
      "priority_score": 0-100,
      "sentiment": "positive|neutral|urgent"
    }
  ],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "productivity": "Brief productivity insight"
}"""

        user_prompt = f"""Analyze these tickets and provide a briefing. 
DO NOT include any greeting like "Good morning/afternoon" - just describe the status.

{tickets_json}

Generate the briefing in JSON format. Remember: NO GREETING in the summary."""

        response = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ])
        
        # Parse AI response
        content = response.content.strip()
        # Extract JSON from response (handle markdown code blocks)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        ai_result = json.loads(content)
        
        overall_summary = ai_result.get("overall_summary", "Here's your latest update.")
        recommendations = ai_result.get("recommendations", [])[:3]
        productivity = ai_result.get("productivity")
        
        # Build briefings
        ai_briefings = ai_result.get("ticket_briefings", [])
        for ticket, ai_brief in zip(tickets, ai_briefings):
            briefings.append(TicketBriefing(
                ticket_id=ticket["ticket_id"],
                title=ticket["title"][:50],
                status=ticket["status"],
                ai_summary=ai_brief.get("ai_summary", f"Processing {ticket['title']}"),
                ai_action=ai_brief.get("ai_action"),
                priority_score=ai_brief.get("priority_score", 50),
                sentiment=ai_brief.get("sentiment", "neutral")
            ))
        
        return briefings, overall_summary, recommendations, productivity
        
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        return _generate_fallback_insights(tickets)


def _generate_fallback_insights(tickets: list) -> tuple:
    """Fallback template-based insights when AI is unavailable"""
    briefings = []
    
    in_progress = sum(1 for t in tickets if t["status"] == "IN_PROGRESS")
    waiting = sum(1 for t in tickets if t["status"] == "WAITING_FOR_REQUESTER")
    completed = sum(1 for t in tickets if t["status"] == "COMPLETED")
    
    if waiting > 0:
        overall_summary = f"You have {waiting} request(s) waiting for your input. Please review and respond to keep things moving!"
    elif in_progress > 0:
        overall_summary = f"You have {in_progress} request(s) being processed. Everything is on track!"
    else:
        overall_summary = "All caught up! Your requests are being handled."
    
    for ticket in tickets[:5]:
        status = ticket["status"]
        step = ticket.get("current_step", {})
        
        if status == "WAITING_FOR_REQUESTER":
            summary = f"This request needs your input to continue. Please check and respond."
            action = "Review and respond to the pending question"
            sentiment = "urgent"
            priority = 90
        elif status == "IN_PROGRESS":
            if step:
                summary = f"Currently at '{step.get('name', 'a step')}'"
                if step.get('assignee'):
                    summary += f" with {step['assignee'].split()[0]}"
            else:
                summary = "Being processed"
            action = None
            sentiment = "neutral"
            priority = 50
        elif status == "WAITING_FOR_APPROVAL":
            summary = "Waiting for approval. You'll be notified when a decision is made."
            action = None
            sentiment = "neutral"
            priority = 40
        elif status == "COMPLETED":
            summary = "Successfully completed! 🎉"
            action = None
            sentiment = "positive"
            priority = 20
        else:
            summary = f"Status: {status}"
            action = None
            sentiment = "neutral"
            priority = 30
        
        briefings.append(TicketBriefing(
            ticket_id=ticket["ticket_id"],
            title=ticket["title"][:50],
            status=status,
            ai_summary=summary,
            ai_action=action,
            priority_score=priority,
            sentiment=sentiment
        ))
    
    recommendations = [
        "Check tickets marked as 'urgent' first",
        "Respond to pending information requests promptly"
    ]
    
    if completed > 0:
        productivity = f"Great progress! You've completed {completed} request(s)."
    else:
        productivity = None
    
    return briefings, overall_summary, recommendations, productivity


# ============================================================================
# Full AI Analysis - For AI Insights Page (more tickets)
# ============================================================================

class BasicTicketInfo(BaseModel):
    """Basic ticket info without AI analysis"""
    ticket_id: str
    title: str
    status: str
    priority: str = "NORMAL"
    created_at: str
    updated_at: str

class FullAnalysisResponse(BaseModel):
    """Full AI analysis response for AI Insights page"""
    overall_summary: str
    total_tickets: int
    status_breakdown: Dict[str, int]
    ticket_briefings: List[TicketBriefing]  # Top 20 with AI analysis
    other_tickets: List[BasicTicketInfo] = []  # Remaining tickets (just basic info)
    smart_recommendations: List[str]
    productivity_insight: Optional[str]
    ai_insights: List[str]  # General AI insights about the tickets
    generated_at: str
    ai_powered: bool = True


@router.get("/full-analysis", response_model=FullAnalysisResponse)
async def get_full_analysis(
    actor: ActorContext = Depends(get_current_user_dep),
    ai_limit: int = 20  # Number of tickets to analyze with AI
):
    """
    Full AI analysis for AI Insights page.
    Analyzes top 20 tickets with AI, shows basic info for rest.
    All tickets have "Explain" button for on-demand detailed analysis.
    """
    from datetime import datetime
    from ...repositories.async_mongo import get_async_database
    from ...config.settings import settings
    
    try:
        logger.info(f"Full analysis requested by {actor.email}")
        db = get_async_database()
        user_email = actor.email
        
        # Get ALL user's tickets (up to 100)
        all_tickets = await db.tickets.find({
            "requester.email": {"$regex": f"^{user_email}$", "$options": "i"}
        }).sort("updated_at", -1).to_list(100)
        
        total_tickets = await db.tickets.count_documents({
            "requester.email": {"$regex": f"^{user_email}$", "$options": "i"}
        })
        
        logger.info(f"Full analysis: Found {len(all_tickets)} tickets, total: {total_tickets}")
        
        # Split into AI-analyzed and basic info tickets
        tickets_for_ai = all_tickets[:ai_limit]  # Top 20 for AI analysis
        remaining_tickets = all_tickets[ai_limit:]  # Rest get basic info
        
        # Status breakdown (for all tickets)
        status_breakdown = {}
        for ticket in all_tickets:
            status = ticket.get("status", "UNKNOWN")
            status_breakdown[status] = status_breakdown.get(status, 0) + 1
        
        if not all_tickets:
            return FullAnalysisResponse(
                overall_summary="No tickets found. Submit a request from the catalog to get started!",
                total_tickets=0,
                status_breakdown={},
                ticket_briefings=[],
                other_tickets=[],
                smart_recommendations=["Browse the service catalog to submit your first request"],
                productivity_insight=None,
                ai_insights=[],
                generated_at=datetime.utcnow().isoformat()
            )
        
        # Generate AI briefings for tickets (limit AI call to 10 to avoid timeout)
        # The _generate_ai_insights only handles the AI call for top 10
        hour = datetime.utcnow().hour
        briefings, overall_summary, recommendations, productivity = await _generate_ai_insights(
            user_name=actor.display_name or user_email.split("@")[0],
            tickets=tickets_for_ai[:10],  # Analyze top 10 for AI (to avoid timeout)
            hour=hour,
            settings=settings
        )
        
        # Add remaining tickets (10-20) with template-based briefings
        for ticket in tickets_for_ai[10:]:
            status = ticket.get("status", "UNKNOWN")
            step = ticket.get("current_step", {})
            
            if status == "WAITING_FOR_REQUESTER":
                summary = "This request needs your input to continue."
                action = "Review and respond"
                sentiment = "urgent"
                priority = 90
            elif status == "IN_PROGRESS":
                summary = f"In progress at '{step.get('name', 'current step')}'"
                action = None
                sentiment = "neutral"
                priority = 50
            elif status == "COMPLETED":
                summary = "This request has been completed successfully."
                action = None
                sentiment = "positive"
                priority = 20
            else:
                summary = f"Request is {status.lower().replace('_', ' ')}"
                action = None
                sentiment = "neutral"
                priority = 40
            
            briefings.append(TicketBriefing(
                ticket_id=ticket.get("ticket_id", ""),
                title=ticket.get("title", "")[:50],
                status=status,
                ai_summary=summary,
                ai_action=action,
                priority_score=priority,
                sentiment=sentiment
            ))
        
        # Create basic info for remaining tickets
        other_tickets = [
            BasicTicketInfo(
                ticket_id=t.get("ticket_id", ""),
                title=t.get("title", "")[:100],
                status=t.get("status", "UNKNOWN"),
                priority=t.get("priority", "NORMAL"),
                created_at=str(t.get("created_at", "")),
                updated_at=str(t.get("updated_at", ""))
            )
            for t in remaining_tickets
        ]
        
        # Generate additional AI insights based on status breakdown
        ai_insights = []
        completed = status_breakdown.get("COMPLETED", 0)
        in_progress = status_breakdown.get("IN_PROGRESS", 0)
        waiting = status_breakdown.get("WAITING_FOR_REQUESTER", 0)
        cancelled = status_breakdown.get("CANCELLED", 0)
        
        if completed > 0:
            ai_insights.append(f"You have {completed} completed ticket(s) - great progress!")
        if in_progress > 0:
            ai_insights.append(f"{in_progress} ticket(s) are actively being processed by the team.")
        if waiting > 0:
            ai_insights.append(f"Action needed: {waiting} ticket(s) are waiting for your response.")
        if cancelled > 0:
            ai_insights.append(f"{cancelled} ticket(s) have been cancelled.")
        
        # Efficiency insight
        if total_tickets > 0:
            completion_rate = (completed / total_tickets) * 100
            if completion_rate > 70:
                ai_insights.append(f"Excellent! Your completion rate is {completion_rate:.0f}%.")
            elif completion_rate > 40:
                ai_insights.append(f"Good progress with {completion_rate:.0f}% completion rate.")
        
        return FullAnalysisResponse(
            overall_summary=overall_summary,
            total_tickets=total_tickets,
            status_breakdown=status_breakdown,
            ticket_briefings=briefings,
            other_tickets=other_tickets,
            smart_recommendations=recommendations,
            productivity_insight=productivity,
            ai_insights=ai_insights,
            generated_at=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Full analysis error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return FullAnalysisResponse(
            overall_summary="Analysis temporarily unavailable. Please try again.",
            total_tickets=0,
            status_breakdown={},
            ticket_briefings=[],
            other_tickets=[],
            smart_recommendations=["Try refreshing the page"],
            productivity_insight=None,
            ai_insights=[],
            generated_at=datetime.utcnow().isoformat()
        )


# ============================================================================
# AI Ticket Explainer - Detailed on-demand explanation
# ============================================================================

class WorkflowStepDetail(BaseModel):
    """Detailed workflow step information"""
    order: int
    name: str
    step_type: str
    state: str
    assignee: Optional[str] = None
    assignee_email: Optional[str] = None
    is_current: bool = False
    ai_insight: Optional[str] = None  # AI-generated insight for this step
    # Branch and sub-workflow context
    branch_name: Optional[str] = None
    from_sub_workflow: Optional[str] = None

class TicketExplanationResponse(BaseModel):
    """Detailed AI-generated ticket explanation"""
    ticket_id: str
    title: str
    status: str
    priority: str = "NORMAL"
    requester: str = ""
    workflow_name: str = ""
    created_at: str = ""
    summary: str = Field(..., description="Comprehensive AI explanation")
    current_state: str = Field(..., description="What's happening right now")
    current_step_detail: Optional[Dict[str, str]] = None  # Detailed current step info
    next_steps: List[str] = Field(default=[], description="Recommended next actions")
    workflow_steps: List[WorkflowStepDetail] = Field(default=[], description="All workflow steps")
    timeline_estimate: Optional[str] = Field(None, description="Estimated completion")
    key_details: Dict[str, str] = Field(default={}, description="Important extracted details")
    pending_actions: List[str] = Field(default=[], description="Pending actions needed")
    ai_confidence: str = Field(default="high", description="AI confidence level")
    generated_at: str


@router.get("/explain-ticket/{ticket_id}", response_model=TicketExplanationResponse)
async def explain_ticket(
    ticket_id: str,
    actor: ActorContext = Depends(get_current_user_dep)
):
    """
    Get detailed AI explanation for a specific ticket.
    
    This endpoint is called on-demand when user clicks "AI Explain" button.
    Uses Azure OpenAI for comprehensive natural language explanation.
    Handles all edge cases with robust fallback mechanisms.
    """
    from datetime import datetime, timedelta
    from ...repositories.async_mongo import get_async_database
    from ...config.settings import settings
    
    logger.info(f"[Cortex Analyzer] Starting deep analysis for ticket: {ticket_id}")
    
    try:
        db = get_async_database()
        logger.info(f"[Cortex Analyzer] Database connection established")
        
        # ============================================
        # PHASE 1: Comprehensive Data Collection
        # ============================================
        
        # Get ticket with all fields
        ticket = await db.tickets.find_one({"ticket_id": ticket_id})
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        
        # Get all steps with sorting
        steps = await db.ticket_steps.find({"ticket_id": ticket_id}).sort("created_at", 1).to_list(100)
        
        # Get info requests with details
        info_requests = await db.info_requests.find({"ticket_id": ticket_id}).sort("created_at", -1).to_list(50)
        
        # Get attachments with details
        attachments_list = await db.attachments.find({"ticket_id": ticket_id}).to_list(20)
        attachments_count = len(attachments_list)
        
        # Get approval tasks
        approval_tasks = await db.approval_tasks.find({"ticket_id": ticket_id}).to_list(20)
        
        # Get audit events for timeline
        audit_events = await db.audit_events.find({"ticket_id": ticket_id}).sort("timestamp", -1).limit(20).to_list(20)
        
        # Get notes count
        requester_notes = ticket.get("requester_notes", []) or []
        step_notes = []
        for s in steps:
            step_notes.extend(s.get("data", {}).get("notes", []) or [])
        total_notes_count = len(requester_notes) + len(step_notes)
        
        # ============================================
        # PHASE 2: Analyze Step States
        # ============================================
        
        # Find current active step
        current_step = None
        active_states = ["ACTIVE", "WAITING_FOR_APPROVAL", "WAITING_FOR_AGENT", "WAITING_FOR_REQUESTER", "ON_HOLD"]
        for s in steps:
            if s.get("state") in active_states:
                current_step = s
                break
        
        # Count steps by state
        completed_steps = sum(1 for s in steps if s.get("state") == "COMPLETED")
        skipped_steps = sum(1 for s in steps if s.get("state") == "SKIPPED")
        pending_steps = sum(1 for s in steps if s.get("state") == "PENDING")
        on_hold_steps = sum(1 for s in steps if s.get("state") == "ON_HOLD")
        total_steps = len(steps)
        
        # Find last completed step
        last_completed_step = None
        for s in reversed(steps):
            if s.get("state") == "COMPLETED":
                last_completed_step = s
                break
        
        # ============================================
        # PHASE 3: Calculate Time Metrics
        # ============================================
        
        created_at = ticket.get("created_at")
        updated_at = ticket.get("updated_at")
        
        # Calculate age
        age_description = "Unknown"
        if created_at:
            try:
                if isinstance(created_at, str):
                    created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                age = datetime.utcnow() - created_at.replace(tzinfo=None)
                if age.days > 0:
                    age_description = f"{age.days} day(s) old"
                elif age.seconds > 3600:
                    age_description = f"{age.seconds // 3600} hour(s) old"
                else:
                    age_description = f"{age.seconds // 60} minute(s) old"
            except Exception:
                age_description = "Unknown"
        
        # Calculate time since last update
        last_update_description = "Unknown"
        if updated_at:
            try:
                if isinstance(updated_at, str):
                    updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                since_update = datetime.utcnow() - updated_at.replace(tzinfo=None)
                if since_update.days > 0:
                    last_update_description = f"{since_update.days} day(s) ago"
                elif since_update.seconds > 3600:
                    last_update_description = f"{since_update.seconds // 3600} hour(s) ago"
                else:
                    last_update_description = f"{since_update.seconds // 60} minute(s) ago"
            except Exception:
                last_update_description = "Unknown"
        
        # ============================================
        # PHASE 4: Analyze Approvals
        # ============================================
        
        pending_approvals = [a for a in approval_tasks if a.get("decision") == "PENDING"]
        approved_count = sum(1 for a in approval_tasks if a.get("decision") == "APPROVED")
        rejected_count = sum(1 for a in approval_tasks if a.get("decision") == "REJECTED")
        
        approval_summary = None
        if approval_tasks:
            if pending_approvals:
                approver = pending_approvals[0].get("approver", {}).get("display_name", "Unknown")
                approval_summary = f"Awaiting approval from {approver}"
            elif rejected_count > 0:
                approval_summary = f"Rejected ({rejected_count} rejection(s))"
            elif approved_count > 0:
                approval_summary = f"Approved ({approved_count} approval(s))"
        
        # ============================================
        # PHASE 5: Analyze Info Requests
        # ============================================
        
        open_info_requests = [ir for ir in info_requests if ir.get("status") == "OPEN"]
        responded_info_requests = [ir for ir in info_requests if ir.get("status") == "RESPONDED"]
        
        info_request_summary = None
        if info_requests:
            if open_info_requests:
                info_request_summary = f"{len(open_info_requests)} pending question(s) need response"
            elif responded_info_requests:
                info_request_summary = f"All {len(responded_info_requests)} question(s) answered"
        
        # ============================================
        # PHASE 6: Build Rich Context for AI
        # ============================================
        
        ticket_context = {
            "ticket_id": ticket_id,
            "title": ticket.get("title", "") or "Untitled Request",
            "status": ticket.get("status", "UNKNOWN") or "UNKNOWN",
            "priority": ticket.get("priority", "NORMAL") or "NORMAL",
            "workflow": ticket.get("workflow_name", "") or "Unknown Workflow",
            "category": ticket.get("category", ""),
            "created_at": str(ticket.get("created_at", "")),
            "updated_at": str(ticket.get("updated_at", "")),
            "age": age_description,
            "last_update": last_update_description,
            "requester": ticket.get("requester", {}).get("display_name", "") or "Unknown",
            "requester_email": ticket.get("requester", {}).get("email", ""),
            "description": (ticket.get("description", "") or "")[:1500],
            
            # Progress metrics
            "progress": f"{completed_steps}/{total_steps} steps completed",
            "completed_steps": completed_steps,
            "skipped_steps": skipped_steps,
            "pending_steps": pending_steps,
            "on_hold_steps": on_hold_steps,
            "total_steps": total_steps,
            
            # Current step details
            "current_step": {
                "name": current_step.get("step_name", "") if current_step else "None",
                "type": current_step.get("step_type", "") if current_step else "",
                "state": current_step.get("state", "") if current_step else "",
                "assignee": current_step.get("assigned_to", {}).get("display_name", "Unassigned") if current_step and current_step.get("assigned_to") else "Unassigned",
                "assignee_email": current_step.get("assigned_to", {}).get("email", "") if current_step and current_step.get("assigned_to") else "",
            } if current_step else None,
            
            # Last completed step
            "last_completed_step": last_completed_step.get("step_name", "") if last_completed_step else None,
            
            # All steps with details (including branch and sub-workflow context)
            "all_steps": [
                {
                    "order": i + 1,
                    "name": s.get("step_name", "") or f"Step {i+1}",
                    "type": s.get("step_type", "") or "UNKNOWN",
                    "state": s.get("state", "") or "PENDING",
                    "assignee": s.get("assigned_to", {}).get("display_name", "") if s.get("assigned_to") else "",
                    # Branch context for parallel execution
                    "branch_name": s.get("branch_name", "") or "",
                    "branch_id": s.get("branch_id", "") or "",
                    # Sub-workflow context
                    "from_sub_workflow": s.get("from_sub_workflow_name", "") or "",
                    "is_sub_workflow_step": bool(s.get("parent_sub_workflow_step_id")),
                }
                for i, s in enumerate(steps)
            ],
            
            # Parallel branch info
            "has_parallel_branches": any(s.get("step_type") == "FORK_STEP" for s in steps),
            "has_sub_workflows": any(s.get("step_type") == "SUB_WORKFLOW_STEP" for s in steps),
            "active_branches": [
                {"branch_id": b.get("branch_id"), "branch_name": b.get("branch_name"), "state": b.get("state")}
                for b in (ticket.get("active_branches") or [])
            ],
            
            # Approvals
            "pending_approvals": len(pending_approvals),
            "approved_count": approved_count,
            "rejected_count": rejected_count,
            "approval_summary": approval_summary,
            
            # Info requests
            "pending_info_requests": len(open_info_requests),
            "total_info_requests": len(info_requests),
            "info_request_summary": info_request_summary,
            
            # Attachments and notes
            "attachments_count": attachments_count,
            "attachments": [{"name": a.get("original_filename", ""), "size": a.get("size_bytes", 0)} for a in attachments_list[:5]],
            "notes_count": total_notes_count,
            
            # Form data summary
            "form_data_summary": list((ticket.get("form_values", {}) or {}).keys())[:10],
            
            # Recent activity
            "recent_events": [
                {
                    "type": e.get("event_type", ""),
                    "timestamp": str(e.get("timestamp", "")),
                    "actor": e.get("actor", {}).get("display_name", "") if e.get("actor") else ""
                }
                for e in audit_events[:5]
            ]
        }
        
        logger.info(f"[Cortex Analyzer] Rich context prepared: ticket={ticket_id}, steps={total_steps}, completed={completed_steps}, approvals={len(approval_tasks)}, info_requests={len(info_requests)}")
        
        # ============================================
        # PHASE 7: Generate AI Explanation
        # ============================================
        
        explanation = await _generate_ticket_explanation(ticket_context, settings)
        
        logger.info(f"[Cortex Analyzer] Analysis complete for ticket: {ticket_id}, confidence: {explanation.get('confidence', 'unknown')}")
        
        # Convert all key_details values to strings (AI may return integers)
        key_details_raw = explanation.get("key_details", {}) or {}
        key_details_str = {str(k): str(v) for k, v in key_details_raw.items()} if key_details_raw else {}
        
        # ============================================
        # PHASE 8: Build Detailed Workflow Steps
        # ============================================
        
        workflow_steps_detail = []
        for i, s in enumerate(steps):
            # Ensure is_current is always a boolean (not None)
            is_current = bool(current_step and s.get("_id") == current_step.get("_id"))
            step_state = s.get("state", "PENDING") or "PENDING"
            step_type = s.get("step_type", "UNKNOWN") or "UNKNOWN"
            assignee_name = s.get("assigned_to", {}).get("display_name") if s.get("assigned_to") else None
            
            # Generate detailed AI insight for each step based on type and state
            step_insight = _generate_step_insight(
                step_name=s.get("step_name", f"Step {i+1}"),
                step_type=step_type,
                step_state=step_state,
                is_current=is_current,
                assignee=assignee_name,
                approval_tasks=[a for a in approval_tasks if a.get("ticket_step_id") == s.get("step_id")],
                info_requests=[ir for ir in info_requests if ir.get("ticket_step_id") == s.get("step_id")],
                branch_name=s.get("branch_name") or None,
                from_sub_workflow=s.get("from_sub_workflow_name") or None
            )
            
            workflow_steps_detail.append(WorkflowStepDetail(
                order=i + 1,
                name=s.get("step_name", f"Step {i+1}") or f"Step {i+1}",
                step_type=step_type,
                state=step_state,
                assignee=assignee_name,
                assignee_email=s.get("assigned_to", {}).get("email") if s.get("assigned_to") else None,
                is_current=is_current,
                ai_insight=step_insight,
                branch_name=s.get("branch_name") or None,
                from_sub_workflow=s.get("from_sub_workflow_name") or None
            ))
        
        # Build current step detail
        current_step_detail = None
        if current_step:
            current_step_detail = {
                "name": current_step.get("step_name", ""),
                "type": current_step.get("step_type", ""),
                "state": current_step.get("state", ""),
                "assignee": current_step.get("assigned_to", {}).get("display_name", "Unassigned") if current_step.get("assigned_to") else "Unassigned",
                "assignee_email": current_step.get("assigned_to", {}).get("email", "") if current_step.get("assigned_to") else "",
            }
        
        # Build pending actions
        pending_actions = []
        if len([ir for ir in info_requests if ir.get("status") == "OPEN"]) > 0:
            pending_actions.append("Respond to pending information requests")
        if ticket.get("status") == "WAITING_FOR_REQUESTER":
            pending_actions.append("Your input is required to proceed")
        if ticket.get("status") == "WAITING_FOR_APPROVAL":
            pending_actions.append("Approval pending - follow up with approver if urgent")
        
        return TicketExplanationResponse(
            ticket_id=ticket_id,
            title=ticket.get("title", "")[:100],
            status=ticket.get("status", ""),
            priority=ticket.get("priority", "NORMAL"),
            requester=ticket.get("requester", {}).get("display_name", ""),
            workflow_name=ticket.get("workflow_name", ""),
            created_at=str(ticket.get("created_at", "")),
            summary=explanation.get("summary", "Analysis complete."),
            current_state=explanation.get("current_state", "Processing"),
            current_step_detail=current_step_detail,
            next_steps=explanation.get("next_steps", []),
            workflow_steps=workflow_steps_detail,
            timeline_estimate=explanation.get("timeline_estimate"),
            key_details=key_details_str,
            pending_actions=pending_actions,
            ai_confidence=explanation.get("confidence", "high"),
            generated_at=datetime.utcnow().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Explain ticket error for {ticket_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        # Try to get basic ticket info for a better fallback
        try:
            db = get_async_database()
            ticket = await db.tickets.find_one({"ticket_id": ticket_id})
            steps = await db.ticket_steps.find({"ticket_id": ticket_id}).to_list(50)
            
            if ticket:
                # Use fallback explanation with whatever data we have
                context = {
                    "ticket_id": ticket_id,
                    "title": ticket.get("title", "Request"),
                    "status": ticket.get("status", "UNKNOWN"),
                    "priority": ticket.get("priority", "NORMAL"),
                    "workflow": ticket.get("workflow_name", "workflow"),
                    "requester": ticket.get("requester", {}).get("display_name", ""),
                    "progress": f"{sum(1 for s in steps if s.get('state') == 'COMPLETED')}/{len(steps)} steps completed",
                    "all_steps": [
                        {
                            "name": s.get("step_name", f"Step {i+1}"),
                            "state": s.get("state", "PENDING"),
                            "assignee": s.get("assigned_to", {}).get("display_name", "") if s.get("assigned_to") else ""
                        }
                        for i, s in enumerate(steps)
                    ],
                    "pending_info_requests": 0,
                    "attachments_count": 0,
                    "notes_count": 0,
                }
                
                fallback = _fallback_explanation(context)
                
                # Build workflow steps detail
                workflow_steps_detail = []
                for i, s in enumerate(steps):
                    step_state = s.get("state", "PENDING")
                    workflow_steps_detail.append(WorkflowStepDetail(
                        order=i + 1,
                        name=s.get("step_name", f"Step {i+1}"),
                        step_type=s.get("step_type", "UNKNOWN"),
                        state=step_state,
                        assignee=s.get("assigned_to", {}).get("display_name") if s.get("assigned_to") else None,
                        is_current=step_state in ["ACTIVE", "WAITING_FOR_APPROVAL", "WAITING_FOR_AGENT", "WAITING_FOR_REQUESTER"],
                        ai_insight=f"Step is {step_state.lower().replace('_', ' ')}"
                    ))
                
                return TicketExplanationResponse(
                    ticket_id=ticket_id,
                    title=ticket.get("title", "Request")[:100],
                    status=ticket.get("status", "UNKNOWN"),
                    priority=ticket.get("priority", "NORMAL"),
                    requester=ticket.get("requester", {}).get("display_name", ""),
                    workflow_name=ticket.get("workflow_name", ""),
                    created_at=str(ticket.get("created_at", "")),
                    summary=fallback["summary"],
                    current_state=fallback["current_state"],
                    next_steps=fallback["next_steps"],
                    workflow_steps=workflow_steps_detail,
                    timeline_estimate=fallback["timeline_estimate"],
                    key_details=fallback["key_details"],
                    pending_actions=[],
                    ai_confidence=fallback["confidence"],
                    generated_at=datetime.utcnow().isoformat()
                )
        except Exception as inner_e:
            logger.error(f"Fallback also failed for {ticket_id}: {inner_e}")
        
        # Ultimate fallback - return basic error response
        return TicketExplanationResponse(
            ticket_id=ticket_id,
            title="Unable to analyze",
            status="UNKNOWN",
            summary="I'm having trouble analyzing this ticket right now. This may be due to a temporary issue. Please try again in a moment.",
            current_state="Analysis temporarily unavailable",
            next_steps=[
                "Try refreshing the page",
                "View the ticket details directly",
                "Contact support if the issue persists"
            ],
            ai_confidence="low",
            generated_at=datetime.utcnow().isoformat()
        )


def _generate_step_insight(
    step_name: str,
    step_type: str,
    step_state: str,
    is_current: bool,
    assignee: str = None,
    approval_tasks: list = None,
    info_requests: list = None,
    branch_name: str = None,
    from_sub_workflow: str = None
) -> str:
    """
    Generate detailed AI insight for each workflow step.
    Provides contextual information based on step type, state, and related data.
    Includes context for parallel branches and sub-workflows.
    """
    approval_tasks = approval_tasks or []
    info_requests = info_requests or []
    assignee = assignee or "Unassigned"
    
    # Build context prefix for branches/sub-workflows
    context_prefix = ""
    if branch_name:
        context_prefix = f"[{branch_name}] "
    if from_sub_workflow:
        context_prefix = f"[Sub-workflow: {from_sub_workflow}] " + context_prefix
    
    # Handle special step types (Fork, Join, Sub-workflow)
    if step_type == "FORK_STEP":
        if step_state == "COMPLETED":
            return f"{context_prefix}🔀 Parallel execution started. All branches have been activated."
        elif step_state == "ACTIVE":
            return f"{context_prefix}🔀 Splitting workflow into parallel branches for simultaneous execution."
        else:
            return f"{context_prefix}🔀 Fork point - workflow will split into parallel branches here."
    
    if step_type == "JOIN_STEP":
        if step_state == "COMPLETED":
            return f"{context_prefix}🔗 All parallel branches completed. Workflow has converged."
        elif step_state == "WAITING_FOR_BRANCHES":
            return f"{context_prefix}⏳ Waiting for all parallel branches to complete before proceeding."
        elif step_state == "ACTIVE":
            return f"{context_prefix}🔗 Merge point - collecting results from parallel branches."
        else:
            return f"{context_prefix}🔗 Join point - will wait for branches to complete."
    
    if step_type == "SUB_WORKFLOW_STEP":
        if step_state == "COMPLETED":
            return f"{context_prefix}📦 Sub-workflow completed. All child steps have finished."
        elif step_state == "ACTIVE":
            return f"{context_prefix}📦 Sub-workflow in progress. Check child steps for current status."
        elif step_state == "REJECTED":
            return f"{context_prefix}📦 Sub-workflow was rejected. Review child step decisions."
        else:
            return f"{context_prefix}📦 Embedded sub-workflow will execute when reached."
    
    if step_type == "NOTIFY_STEP":
        if step_state == "COMPLETED":
            return f"{context_prefix}📧 Notifications sent successfully."
        elif step_state == "ACTIVE":
            return f"{context_prefix}📧 Sending notifications to relevant parties."
        else:
            return f"{context_prefix}📧 Notification step - will send alerts when activated."
    
    # Handle different states
    if step_state == "COMPLETED":
        if step_type == "APPROVAL_STEP":
            approved = [a for a in approval_tasks if a.get("decision") == "APPROVED"]
            if approved:
                approver = approved[0].get("approver", {}).get("display_name", "Manager")
                return f"{context_prefix}✅ Approved by {approver}. This step completed successfully."
            return f"{context_prefix}✅ This approval step has been completed successfully."
        elif step_type == "TASK_STEP":
            return f"{context_prefix}✅ Task completed by {assignee}. All required actions were fulfilled."
        elif step_type == "FORM_STEP":
            return f"{context_prefix}✅ Form submitted successfully. All required information was provided."
        else:
            return f"{context_prefix}✅ This step has been successfully completed."
    
    elif step_state == "SKIPPED":
        return f"{context_prefix}⏭️ This step was skipped due to workflow conditions or a decision made during processing."
    
    elif step_state == "PENDING":
        if step_type == "APPROVAL_STEP":
            return f"{context_prefix}⏳ This approval step will be activated once the preceding steps complete."
        elif step_type == "TASK_STEP":
            return f"{context_prefix}⏳ This task will be assigned once the workflow reaches this point."
        else:
            return f"{context_prefix}⏳ This step will be activated after the current step completes."
    
    elif step_state == "ON_HOLD":
        return f"{context_prefix}⏸️ This step is on hold. May be waiting for external dependencies or manual release."
    
    elif is_current:
        # Current active step - provide detailed guidance
        if step_type == "APPROVAL_STEP":
            pending = [a for a in approval_tasks if a.get("decision") == "PENDING"]
            if pending:
                approver = pending[0].get("approver", {}).get("display_name", "Manager")
                return f"{context_prefix}🔄 Awaiting approval from {approver}. Contact them directly if this is urgent."
            return f"{context_prefix}🔄 In approval process. Assigned to {assignee} for review."
        
        elif step_type == "TASK_STEP":
            if step_state == "WAITING_FOR_AGENT":
                return f"{context_prefix}🔄 Task assigned to {assignee}. Waiting for them to pick it up and process."
            elif step_state == "WAITING_FOR_REQUESTER":
                open_ir = [ir for ir in info_requests if ir.get("status") == "OPEN"]
                if open_ir:
                    return f"{context_prefix}⚠️ Action required from you! {len(open_ir)} question(s) need your response."
                return f"{context_prefix}⚠️ Your input is required to proceed. Please check for pending requests."
            elif step_state == "ACTIVE":
                return f"{context_prefix}🔄 Being actively worked on by {assignee}."
            else:
                return f"{context_prefix}🔄 Currently being processed by {assignee}."
        
        elif step_type == "FORM_STEP":
            if step_state == "WAITING_FOR_REQUESTER":
                return f"{context_prefix}📝 Form awaiting your completion. Please fill out the required information."
            return f"{context_prefix}📝 Form step is currently active."
        
        else:
            return f"{context_prefix}🔄 Currently active and being processed by {assignee}."
    
    # Default based on state
    state_insights = {
        "WAITING_FOR_APPROVAL": f"{context_prefix}⏳ Waiting for approval from {assignee}.",
        "WAITING_FOR_AGENT": f"{context_prefix}⏳ Waiting for {assignee} to process this step.",
        "WAITING_FOR_REQUESTER": f"{context_prefix}⚠️ Your response is needed to proceed.",
        "ACTIVE": f"{context_prefix}🔄 Currently being processed by {assignee}.",
        "REJECTED": f"{context_prefix}❌ This step was rejected.",
        "CANCELLED": f"{context_prefix}🚫 This step was cancelled.",
        "FAILED": f"{context_prefix}❌ This step encountered an error.",
        "WAITING_FOR_BRANCHES": f"{context_prefix}⏳ Waiting for parallel branches to complete.",
    }
    
    return state_insights.get(step_state, f"{context_prefix}Step is in {step_state.lower().replace('_', ' ')} state.")


async def _generate_ticket_explanation(context: dict, settings) -> dict:
    """
    Generate detailed ticket explanation using Azure OpenAI.
    Includes comprehensive error handling and timeout management.
    """
    from langchain_openai import AzureChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage
    import json
    import asyncio
    
    try:
        # Validate settings
        if not settings.azure_openai_endpoint or not settings.azure_openai_api_key:
            logger.warning("[Cortex Analyzer] Azure OpenAI not configured, using fallback")
            return _fallback_explanation(context)
        
        if not settings.azure_openai_deployment:
            logger.warning("[Cortex Analyzer] Azure OpenAI deployment not configured, using fallback")
            return _fallback_explanation(context)
        
        llm = AzureChatOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version or "2024-02-15-preview",
            deployment_name=settings.azure_openai_deployment,
            temperature=0.4,  # Slightly lower for more consistent output
            max_tokens=2500,  # Increased for detailed analysis
            request_timeout=30,  # 30 second timeout
        )
        
        logger.info(f"[Cortex Analyzer] Invoking Azure OpenAI for ticket: {context.get('ticket_id')}")
        
        # Build a comprehensive system prompt based on ticket status
        status = context.get("status", "UNKNOWN")
        
        system_prompt = """You are NOVA Cortex, an advanced AI system providing DEEP, COMPREHENSIVE ticket analysis.

## Your Role
You are the "Cortex Analyzer" - a neural deep-dive analysis engine. The user clicked "Explain" to get FULL, DETAILED understanding of their ticket.

## Analysis Framework

### 1. SUMMARY (5-7 sentences - be thorough!)
Provide a complete narrative covering:
- What is this request about? (Purpose/Goal)
- Who submitted it and when?
- What workflow is it going through?
- What has happened so far? (Journey)
- What is the current situation?
- Are there any blockers or issues?

### 2. CURRENT STATE (3-4 sentences)
Be very specific about RIGHT NOW:
- Exactly which step is active?
- Who is responsible for it?
- What are they supposed to do?
- How long has it been in this state?

### 3. NEXT STEPS (5-6 actionable items)
Provide specific, actionable guidance:
- What should the requester do (if anything)?
- What will happen next in the workflow?
- Are there any pending approvals to follow up on?
- Any info requests to respond to?
- What to expect timeline-wise?
- Who to contact if urgent?

### 4. TIMELINE ESTIMATE
Based on the data:
- How many steps remain?
- Any bottlenecks visible?
- Estimated completion time frame

### 5. KEY DETAILS (comprehensive)
Extract and present ALL relevant information:
- Current Step Name
- Assigned Handler
- Progress (X of Y steps)
- Request Age
- Last Updated
- Pending Approvals (count)
- Pending Questions (count)
- Attachments (count)
- Notes (count)
- Priority Level
- Active Branches (if parallel execution)
- Sub-Workflow Status (if embedded workflows)

## Parallel Branches & Sub-Workflows

When analyzing workflows with parallel branches or sub-workflows:

### Parallel Branches (FORK_STEP / JOIN_STEP)
- Steps with `branch_name` are executing in parallel branches
- FORK_STEP splits into multiple parallel paths that execute simultaneously
- JOIN_STEP waits for branches to complete before proceeding
- Explain which branches are active, which are completed, and what the wait conditions are

### Sub-Workflows
- Steps with `from_sub_workflow` are part of an embedded sub-workflow
- A SUB_WORKFLOW_STEP contains child steps from another workflow
- Explain the sub-workflow progress as part of the parent workflow

### Branch/Sub-workflow Guidance
- If multiple branches are active, explain each branch's status
- Highlight which branch might be blocking if JOIN is waiting
- For sub-workflows, describe the overall progress and any steps pending inside

## Status-Specific Guidance

- **COMPLETED**: Summarize the full journey, celebrate success
- **SKIPPED**: Explain why it might have been skipped, what that means
- **CANCELLED/REJECTED**: Be empathetic, explain implications, suggest next steps
- **ON_HOLD**: Explain what's blocking, how to resolve
- **WAITING_FOR_REQUESTER**: Emphasize urgency of user response
- **WAITING_FOR_APPROVAL**: Explain approval process, who to contact
- **IN_PROGRESS**: Provide status update, expected next milestones
- **WAITING_FOR_BRANCHES**: All parallel branches must complete before proceeding

## Response Format

You MUST respond with ONLY valid JSON (no markdown, no explanation):
{
  "summary": "Detailed 5-7 sentence comprehensive summary...",
  "current_state": "Detailed 3-4 sentence current state description...",
  "next_steps": [
    "Specific actionable step 1",
    "Specific actionable step 2",
    "Specific actionable step 3",
    "Specific actionable step 4",
    "Specific actionable step 5"
  ],
  "timeline_estimate": "Realistic estimate with reasoning...",
  "key_details": {
    "Current Step": "Step name or 'N/A'",
    "Handler": "Name or 'Unassigned'",
    "Progress": "X of Y steps completed",
    "Request Age": "X days/hours",
    "Last Updated": "X ago",
    "Pending Approvals": "count",
    "Pending Questions": "count",
    "Attachments": "count",
    "Priority": "level"
  },
  "confidence": "high|medium|low"
}

CRITICAL: Output ONLY the JSON object, no other text!"""

        # Build user prompt with context
        user_prompt = f"""## Ticket Analysis Request

Analyze the following ticket data and provide a comprehensive explanation:

```json
{json.dumps(context, indent=2, default=str)}
```

Generate a detailed, helpful analysis following the framework above. Be thorough - the user wants to understand everything about this ticket."""

        # Call Azure OpenAI with timeout handling
        try:
            response = await asyncio.wait_for(
                llm.ainvoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_prompt)
                ]),
                timeout=30.0  # 30 second timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"[Cortex Analyzer] Azure OpenAI timeout for ticket: {context.get('ticket_id')}")
            return _fallback_explanation(context)
        
        content = response.content.strip()
        logger.info(f"[Cortex Analyzer] Received response, parsing JSON...")
        
        # Extract JSON from response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        # Clean up potential issues
        content = content.strip()
        
        # Parse JSON
        try:
            result = json.loads(content)
            logger.info(f"[Cortex Analyzer] Successfully parsed AI response")
            return result
        except json.JSONDecodeError as je:
            logger.error(f"[Cortex Analyzer] JSON parse error: {je}")
            logger.error(f"[Cortex Analyzer] Raw content: {content[:500]}...")
            return _fallback_explanation(context)
        
    except asyncio.TimeoutError:
        logger.warning(f"[Cortex Analyzer] Request timeout for ticket: {context.get('ticket_id')}")
        return _fallback_explanation(context)
    except Exception as e:
        logger.error(f"[Cortex Analyzer] AI explanation generation error: {e}")
        import traceback
        logger.error(f"[Cortex Analyzer] Traceback: {traceback.format_exc()}")
        return _fallback_explanation(context)


def _fallback_explanation(context: dict) -> dict:
    """
    Comprehensive fallback template-based explanation when AI is unavailable.
    Handles ALL possible ticket statuses and edge cases.
    """
    status = context.get("status", "UNKNOWN")
    title = context.get("title", "Request") or "Request"
    workflow = context.get("workflow", "workflow") or "workflow"
    progress = context.get("progress", "0/0 steps completed") or "0/0 steps completed"
    priority = context.get("priority", "NORMAL")
    requester = context.get("requester", "")
    created_at = context.get("created_at", "")
    
    # Get current step from context
    current_step_info = context.get("current_step", {}) or {}
    current_step = current_step_info.get("name") if current_step_info else None
    current_assignee = current_step_info.get("assignee") if current_step_info else None
    current_state_raw = current_step_info.get("state", "") if current_step_info else ""
    
    # Fallback to all_steps if current_step not set
    all_steps = context.get("all_steps", []) or []
    if not current_step and all_steps:
        for step in all_steps:
            if step.get("state") in ["ACTIVE", "WAITING_FOR_APPROVAL", "WAITING_FOR_AGENT", "WAITING_FOR_REQUESTER", "ON_HOLD"]:
                current_step = step.get("name", "a step")
                current_assignee = step.get("assignee", "")
                current_state_raw = step.get("state", "")
                break
    
    # Find last completed step if no active step
    last_completed_step = None
    for step in all_steps:
        if step.get("state") == "COMPLETED":
            last_completed_step = step.get("name", "")
    
    # Count steps by state
    completed_count = sum(1 for s in all_steps if s.get("state") == "COMPLETED")
    skipped_count = sum(1 for s in all_steps if s.get("state") == "SKIPPED")
    pending_count = sum(1 for s in all_steps if s.get("state") == "PENDING")
    total_count = len(all_steps)
    
    # Comprehensive status explanations covering ALL edge cases
    status_explanations = {
        "IN_PROGRESS": f"Your request '{title}' is actively being processed through the {workflow} workflow. Progress: {progress}. The team is working on it and you'll be notified of any updates or when action is needed from you.",
        
        "WAITING_FOR_REQUESTER": f"Your request '{title}' requires your attention. There's a pending question or information request that needs your response. Progress: {progress}. Please check and respond to keep things moving.",
        
        "WAITING_FOR_APPROVAL": f"Your request '{title}' is pending approval from a manager or supervisor. Progress: {progress}. You'll be automatically notified once a decision is made.",
        
        "WAITING_FOR_AGENT": f"Your request '{title}' is in the queue waiting for an agent to pick it up. Progress: {progress}. An agent will be assigned shortly.",
        
        "COMPLETED": f"Your request '{title}' has been successfully completed! All workflow steps have been finished ({completed_count} completed). No further action is needed.",
        
        "CANCELLED": f"This request '{title}' was cancelled and is no longer active. If you still need this request, please submit a new one through the catalog.",
        
        "REJECTED": f"This request '{title}' was rejected during the approval process. Please review any rejection comments in the ticket details. You may need to submit a new request with updated information.",
        
        "SKIPPED": f"This request '{title}' has been skipped and is not moving forward in the workflow. This may be due to workflow conditions or a decision made during processing. {skipped_count} step(s) were skipped. Review the ticket details for more information.",
        
        "ON_HOLD": f"Your request '{title}' has been placed on hold. This is typically done when additional information or clarification is needed, or when waiting for external dependencies. Progress: {progress}.",
        
        "PENDING": f"Your request '{title}' has been submitted and is pending processing. It will be picked up shortly by the appropriate team. Progress: {progress}.",
        
        "DRAFT": f"This request '{title}' is currently in draft status and has not been submitted yet. Please complete and submit the request to start the workflow.",
        
        "FAILED": f"This request '{title}' encountered an error during processing. Please contact support for assistance or try resubmitting the request.",
        
        "UNKNOWN": f"Your request '{title}' is in the workflow but the current status could not be determined. Progress: {progress}. Please check the ticket details page for more information.",
    }
    
    summary = status_explanations.get(status, f"Your request '{title}' is currently in {status.replace('_', ' ')} status. Progress: {progress}.")
    
    # Build current state description
    if status in ["SKIPPED", "CANCELLED", "REJECTED"]:
        current_state = f"This ticket has been {status.lower().replace('_', ' ')} and is not proceeding. "
        if last_completed_step:
            current_state += f"The last completed step was '{last_completed_step}'. "
        current_state += f"Total progress: {completed_count} completed, {skipped_count} skipped out of {total_count} steps."
    elif status == "COMPLETED":
        current_state = f"All {completed_count} workflow steps have been completed successfully."
    elif current_step:
        current_state = f"Currently at step '{current_step}'"
        if current_assignee:
            current_state += f", assigned to {current_assignee}"
        if current_state_raw:
            current_state += f" (status: {current_state_raw.replace('_', ' ')})"
        current_state += f". Progress: {progress}."
    else:
        current_state = f"Processing through {workflow} workflow. Progress: {progress}."
    
    # Build next steps based on status
    next_steps = []
    if status == "WAITING_FOR_REQUESTER":
        next_steps = [
            "Check for pending questions or info requests",
            "Provide the requested information",
            "Review any attached documents if needed",
            "The workflow will continue automatically once you respond"
        ]
    elif status == "IN_PROGRESS":
        next_steps = [
            "No action needed from you at this time",
            "Monitor the ticket for updates",
            "You'll be notified if input is needed",
            "Check back later for progress updates"
        ]
    elif status == "WAITING_FOR_APPROVAL":
        next_steps = [
            "Wait for the approver to review your request",
            "You'll be notified of the decision",
            "No action needed from you",
            "Contact the approver directly if this is urgent"
        ]
    elif status == "COMPLETED":
        next_steps = [
            "No further action required",
            "Review the completed request if needed",
            "Submit a new request if you need additional help"
        ]
    elif status in ["CANCELLED", "REJECTED"]:
        next_steps = [
            "Review the cancellation/rejection reason in ticket details",
            "Submit a new request if you still need this service",
            "Contact support if you have questions about the decision"
        ]
    elif status == "SKIPPED":
        next_steps = [
            "Review the ticket details to understand why it was skipped",
            "Check if workflow conditions affected this request",
            "Submit a new request if you still need this service",
            "Contact support if you believe this was skipped in error"
        ]
    elif status == "ON_HOLD":
        next_steps = [
            "Check for any pending information requests",
            "Wait for the hold to be released",
            "Contact the assigned agent if you have questions",
            "The workflow will resume once the hold is lifted"
        ]
    elif status == "PENDING":
        next_steps = [
            "Your request is in queue",
            "An agent will be assigned shortly",
            "No action needed from you at this time",
            "You'll be notified when processing begins"
        ]
    else:
        next_steps = [
            "Check the ticket details page for more information",
            "Review the workflow progress and any notes",
            "Contact support if you need assistance"
        ]
    
    # Build comprehensive key details
    key_details = {
        "Status": status.replace("_", " "),
        "Progress": progress,
    }
    
    if priority and priority != "NORMAL":
        key_details["Priority"] = priority
    
    if current_step:
        key_details["Current Step"] = current_step
    elif last_completed_step:
        key_details["Last Completed Step"] = last_completed_step
        
    if current_assignee:
        key_details["Assigned To"] = current_assignee
    
    if completed_count > 0:
        key_details["Completed Steps"] = str(completed_count)
    
    if skipped_count > 0:
        key_details["Skipped Steps"] = str(skipped_count)
        
    if context.get("pending_info_requests", 0) > 0:
        key_details["Pending Questions"] = str(context["pending_info_requests"])
        
    if context.get("attachments_count", 0) > 0:
        key_details["Attachments"] = str(context["attachments_count"])
        
    if context.get("notes_count", 0) > 0:
        key_details["Notes"] = str(context["notes_count"])
    
    # Determine confidence based on status
    confidence = "high" if status in ["COMPLETED", "CANCELLED", "REJECTED", "SKIPPED"] else "medium"
    
    # Timeline estimate based on status
    if status == "COMPLETED":
        timeline_estimate = "Request has been completed"
    elif status in ["CANCELLED", "REJECTED", "SKIPPED"]:
        timeline_estimate = "Request is not proceeding"
    elif status == "ON_HOLD":
        timeline_estimate = "On hold - timeline paused until hold is released"
    elif pending_count > 0:
        timeline_estimate = f"Approximately {pending_count} more step(s) to complete"
    else:
        timeline_estimate = "Depends on current step completion"
    
    return {
        "summary": summary,
        "current_state": current_state,
        "next_steps": next_steps,
        "timeline_estimate": timeline_estimate,
        "key_details": key_details,
        "confidence": confidence
    }

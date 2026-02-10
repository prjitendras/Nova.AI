"""GenAI API Routes - AI workflow generation"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..deps import get_current_user_dep, get_correlation_id_dep
from ...domain.models import ActorContext
from ...domain.errors import DomainError
from ...services.genai_service import GenAIService
from ...utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class GenerateWorkflowRequest(BaseModel):
    """Request to generate workflow draft"""
    prompt_text: str = Field(..., min_length=10, max_length=5000)
    constraints: Optional[Dict[str, Any]] = None
    examples: Optional[List[Dict[str, Any]]] = None


class GenerateWorkflowResponse(BaseModel):
    """Response from workflow generation"""
    draft_definition: Dict[str, Any]
    validation: Dict[str, Any]
    ai_metadata: Dict[str, Any]


class RefineWorkflowRequest(BaseModel):
    """Request to refine generated workflow"""
    current_definition: Dict[str, Any]
    refinement_prompt: str = Field(..., min_length=5, max_length=2000)


# ============================================================================
# Routes
# ============================================================================

@router.post("/workflow-draft", response_model=GenerateWorkflowResponse)
async def generate_workflow_draft(
    request: GenerateWorkflowRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Generate workflow draft using AI
    
    Takes a natural language description and generates a workflow definition.
    The output is always a draft and requires human review before publishing.
    """
    try:
        service = GenAIService()
        result = service.generate_workflow_draft(
            prompt_text=request.prompt_text,
            constraints=request.constraints,
            examples=request.examples,
            actor=actor
        )
        
        logger.info(
            "Generated AI workflow draft",
            extra={"actor_email": actor.email, "prompt_length": len(request.prompt_text)}
        )
        
        return GenerateWorkflowResponse(
            draft_definition=result["draft_definition"],
            validation=result["validation"],
            ai_metadata=result["ai_metadata"]
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/workflow-draft/refine", response_model=GenerateWorkflowResponse)
async def refine_workflow_draft(
    request: RefineWorkflowRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Refine existing workflow draft using AI
    
    Takes an existing draft and a refinement prompt to improve it.
    """
    try:
        service = GenAIService()
        result = service.refine_workflow_draft(
            current_definition=request.current_definition,
            refinement_prompt=request.refinement_prompt,
            actor=actor
        )
        
        return GenerateWorkflowResponse(
            draft_definition=result["draft_definition"],
            validation=result["validation"],
            ai_metadata=result["ai_metadata"]
        )
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/suggest-steps")
async def suggest_steps(
    request: Dict[str, Any],
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Suggest next steps for workflow
    
    Given current workflow context, suggest possible next steps.
    """
    try:
        service = GenAIService()
        suggestions = service.suggest_steps(
            context=request.get("context", {}),
            current_steps=request.get("current_steps", []),
            actor=actor
        )
        
        return {"suggestions": suggestions}
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


@router.post("/validate-description")
async def validate_description(
    request: Dict[str, str],
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Validate workflow description
    
    Check if description is suitable for workflow generation.
    """
    try:
        service = GenAIService()
        result = service.validate_description(
            description=request.get("description", ""),
            actor=actor
        )
        
        return result
    
    except DomainError as e:
        raise HTTPException(status_code=e.http_status, detail=e.to_dict())


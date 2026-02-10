"""Lookup API Routes - Workflow lookup table management"""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field, EmailStr

from ..deps import get_current_user_dep, get_correlation_id_dep
from ...domain.models import ActorContext, WorkflowLookup
from ...domain.errors import DomainError, NotFoundError, AlreadyExistsError, ValidationError
from ...services.lookup_service import LookupService
from ...utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class LookupUserRequest(BaseModel):
    """User within a lookup entry"""
    aad_id: Optional[str] = None
    email: EmailStr
    display_name: str
    is_primary: bool = False
    order: int = 0


class LookupEntryRequest(BaseModel):
    """Entry within a lookup table"""
    entry_id: Optional[str] = None
    key: str = Field(..., min_length=1, max_length=200)
    display_label: Optional[str] = Field(None, max_length=200)
    users: List[LookupUserRequest] = Field(default_factory=list)
    is_active: bool = True


class CreateLookupRequest(BaseModel):
    """Request to create a lookup table"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    source_step_id: Optional[str] = None
    source_field_key: Optional[str] = None


class UpdateLookupRequest(BaseModel):
    """Request to update lookup metadata"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    source_step_id: Optional[str] = None
    source_field_key: Optional[str] = None
    expected_version: Optional[int] = None


class SaveLookupEntriesRequest(BaseModel):
    """Request to save all entries for a lookup"""
    entries: List[LookupEntryRequest]


class AddEntryRequest(BaseModel):
    """Request to add a single entry"""
    key: str = Field(..., min_length=1, max_length=200)
    display_label: Optional[str] = Field(None, max_length=200)
    users: List[LookupUserRequest] = Field(default_factory=list)


class UpdateEntryRequest(BaseModel):
    """Request to update entry metadata"""
    key: Optional[str] = Field(None, min_length=1, max_length=200)
    display_label: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None


class SetEntryUsersRequest(BaseModel):
    """Request to set users for an entry"""
    users: List[LookupUserRequest]


class LookupUserResponse(BaseModel):
    """User response"""
    aad_id: Optional[str] = None
    email: str
    display_name: str
    is_primary: bool
    order: int


class LookupEntryResponse(BaseModel):
    """Entry response"""
    entry_id: str
    key: str
    display_label: Optional[str] = None
    users: List[LookupUserResponse]
    is_active: bool


class LookupResponse(BaseModel):
    """Full lookup response"""
    lookup_id: str
    workflow_id: str
    name: str
    description: Optional[str]
    source_step_id: Optional[str]
    source_field_key: Optional[str]
    entries: List[LookupEntryResponse]
    created_by: Dict[str, Any]
    created_at: str
    updated_by: Optional[Dict[str, Any]]
    updated_at: Optional[str]
    is_active: bool
    version: int


class LookupListResponse(BaseModel):
    """List of lookups"""
    items: List[LookupResponse]


class ResolveUsersResponse(BaseModel):
    """Resolved users for a form value"""
    users: List[LookupUserResponse]


# ============================================================================
# Helper Functions
# ============================================================================

def _lookup_to_response(lookup: WorkflowLookup) -> LookupResponse:
    """Convert lookup model to response"""
    return LookupResponse(
        lookup_id=lookup.lookup_id,
        workflow_id=lookup.workflow_id,
        name=lookup.name,
        description=lookup.description,
        source_step_id=lookup.source_step_id,
        source_field_key=lookup.source_field_key,
        entries=[
            LookupEntryResponse(
                entry_id=e.entry_id,
                key=e.key,
                display_label=e.display_label,
                users=[
                    LookupUserResponse(
                        aad_id=u.aad_id,
                        email=u.email,
                        display_name=u.display_name,
                        is_primary=u.is_primary,
                        order=u.order
                    )
                    for u in sorted(e.users, key=lambda x: (not x.is_primary, x.order))
                ],
                is_active=e.is_active
            )
            for e in lookup.entries
        ],
        created_by=lookup.created_by.model_dump(),
        created_at=lookup.created_at.isoformat(),
        updated_by=lookup.updated_by.model_dump() if lookup.updated_by else None,
        updated_at=lookup.updated_at.isoformat() if lookup.updated_at else None,
        is_active=lookup.is_active,
        version=lookup.version
    )


# ============================================================================
# Routes
# ============================================================================

@router.post("/{workflow_id}", response_model=LookupResponse, status_code=status.HTTP_201_CREATED)
async def create_lookup(
    workflow_id: str,
    request: CreateLookupRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Create a new lookup table for a workflow"""
    try:
        service = LookupService()
        lookup = service.create_lookup(
            workflow_id=workflow_id,
            name=request.name,
            description=request.description,
            source_step_id=request.source_step_id,
            source_field_key=request.source_field_key,
            actor=actor
        )
        
        logger.info(f"Created lookup {lookup.lookup_id} for workflow {workflow_id}", extra={
            "correlation_id": correlation_id,
            "lookup_id": lookup.lookup_id,
            "workflow_id": workflow_id
        })
        
        return _lookup_to_response(lookup)
        
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{workflow_id}", response_model=LookupListResponse)
async def get_lookups(
    workflow_id: str,
    include_inactive: bool = Query(False),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get all lookup tables for a workflow"""
    try:
        service = LookupService()
        lookups = service.get_lookups_for_workflow(workflow_id, include_inactive)
        return LookupListResponse(items=[_lookup_to_response(l) for l in lookups])
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ============================================================================
# Runtime Resolution Routes (MUST be before /{workflow_id}/{lookup_id} routes)
# ============================================================================

@router.get("/{workflow_id}/resolve", response_model=ResolveUsersResponse)
async def resolve_lookup_users(
    workflow_id: str,
    step_id: str = Query(..., description="Form step containing the source field"),
    field_key: str = Query(..., description="Source field key"),
    field_value: str = Query(..., description="Selected value to resolve users for"),
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """
    Resolve users for a form field value.
    Used at runtime to display users in LOOKUP_USER_SELECT fields.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[LOOKUP RESOLVE] workflow_id={workflow_id}, step_id={step_id}, field_key={field_key}, field_value={field_value}")
    
    try:
        service = LookupService()
        users = service.resolve_users_for_form_value(
            workflow_id=workflow_id,
            step_id=step_id,
            field_key=field_key,
            field_value=field_value
        )
        
        logger.info(f"[LOOKUP RESOLVE] Found users: {users}")
        
        if users is None:
            logger.warning(f"[LOOKUP RESOLVE] No lookup found for this field")
            return ResolveUsersResponse(users=[])
        
        return ResolveUsersResponse(users=[
            LookupUserResponse(
                aad_id=u.get("aad_id"),
                email=u["email"],
                display_name=u["display_name"],
                is_primary=u["is_primary"],
                order=idx
            )
            for idx, u in enumerate(users)
        ])
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{workflow_id}/{lookup_id}", response_model=LookupResponse)
async def get_lookup(
    workflow_id: str,
    lookup_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Get a specific lookup table"""
    try:
        service = LookupService()
        lookup = service.get_lookup(lookup_id)
        
        if lookup.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{workflow_id}/{lookup_id}", response_model=LookupResponse)
async def update_lookup(
    workflow_id: str,
    lookup_id: str,
    request: UpdateLookupRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Update lookup metadata"""
    try:
        service = LookupService()
        lookup = service.update_lookup(
            lookup_id=lookup_id,
            name=request.name,
            description=request.description,
            source_step_id=request.source_step_id,
            source_field_key=request.source_field_key,
            actor=actor,
            expected_version=request.expected_version
        )
        
        if lookup.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{workflow_id}/{lookup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lookup(
    workflow_id: str,
    lookup_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Delete a lookup table (soft delete)"""
    try:
        service = LookupService()
        # Verify ownership
        lookup = service.get_lookup(lookup_id)
        if lookup.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        service.delete_lookup(lookup_id)
        
        logger.info(f"Deleted lookup {lookup_id}", extra={
            "correlation_id": correlation_id,
            "lookup_id": lookup_id,
            "workflow_id": workflow_id
        })
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ============================================================================
# Entry Management Routes
# ============================================================================

@router.put("/{workflow_id}/{lookup_id}/entries", response_model=LookupResponse)
async def save_lookup_entries(
    workflow_id: str,
    lookup_id: str,
    request: SaveLookupEntriesRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Save all entries for a lookup (replaces existing entries)"""
    try:
        service = LookupService()
        
        # Verify ownership
        existing = service.get_lookup(lookup_id)
        if existing.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        entries = [
            {
                "entry_id": e.entry_id,
                "key": e.key,
                "display_label": e.display_label,
                "users": [u.model_dump() for u in e.users],
                "is_active": e.is_active
            }
            for e in request.entries
        ]
        
        lookup = service.save_lookup_with_entries(lookup_id, entries, actor)
        
        logger.info(f"Saved {len(entries)} entries for lookup {lookup_id}", extra={
            "correlation_id": correlation_id,
            "lookup_id": lookup_id,
            "workflow_id": workflow_id
        })
        
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{workflow_id}/{lookup_id}/entries", response_model=LookupResponse)
async def add_entry(
    workflow_id: str,
    lookup_id: str,
    request: AddEntryRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Add a single entry to a lookup"""
    try:
        service = LookupService()
        
        # Verify ownership
        existing = service.get_lookup(lookup_id)
        if existing.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        lookup = service.add_entry(
            lookup_id=lookup_id,
            key=request.key,
            display_label=request.display_label,
            users=[u.model_dump() for u in request.users],
            actor=actor
        )
        
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{workflow_id}/{lookup_id}/entries/{entry_id}", response_model=LookupResponse)
async def update_entry(
    workflow_id: str,
    lookup_id: str,
    entry_id: str,
    request: UpdateEntryRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Update an entry's metadata"""
    try:
        service = LookupService()
        
        # Verify ownership
        existing = service.get_lookup(lookup_id)
        if existing.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        lookup = service.update_entry(
            lookup_id=lookup_id,
            entry_id=entry_id,
            key=request.key,
            display_label=request.display_label,
            is_active=request.is_active,
            actor=actor
        )
        
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{workflow_id}/{lookup_id}/entries/{entry_id}", response_model=LookupResponse)
async def remove_entry(
    workflow_id: str,
    lookup_id: str,
    entry_id: str,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Remove an entry from a lookup"""
    try:
        service = LookupService()
        
        # Verify ownership
        existing = service.get_lookup(lookup_id)
        if existing.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        lookup = service.remove_entry(lookup_id, entry_id)
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{workflow_id}/{lookup_id}/entries/{entry_id}/users", response_model=LookupResponse)
async def set_entry_users(
    workflow_id: str,
    lookup_id: str,
    entry_id: str,
    request: SetEntryUsersRequest,
    actor: ActorContext = Depends(get_current_user_dep),
    correlation_id: str = Depends(get_correlation_id_dep)
):
    """Set users for an entry"""
    try:
        service = LookupService()
        
        # Verify ownership
        existing = service.get_lookup(lookup_id)
        if existing.workflow_id != workflow_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lookup not found for this workflow"
            )
        
        lookup = service.set_entry_users(
            lookup_id=lookup_id,
            entry_id=entry_id,
            users=[u.model_dump() for u in request.users],
            actor=actor
        )
        
        return _lookup_to_response(lookup)
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except DomainError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))



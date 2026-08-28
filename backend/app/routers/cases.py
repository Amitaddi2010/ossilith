"""Case CRUD router."""

import shutil
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import Case, CaseStatus

router = APIRouter(prefix="/api/cases", tags=["cases"])


# ── Schemas ────────────────────────────────────────────────


class CaseCreate(BaseModel):
    name: str
    description: str | None = None


class CaseResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: CaseStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CaseListResponse(BaseModel):
    cases: list[CaseResponse]
    total: int


# ── Endpoints ──────────────────────────────────────────────


@router.post("", response_model=CaseResponse, status_code=201)
async def create_case(body: CaseCreate, db: AsyncSession = Depends(get_db)):
    """Create a new case."""
    case = Case(name=body.name, description=body.description)
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return case


@router.get("", response_model=CaseListResponse)
async def list_cases(db: AsyncSession = Depends(get_db)):
    """List all cases, newest first."""
    result = await db.execute(
        select(Case).order_by(Case.created_at.desc())
    )
    cases = result.scalars().all()
    return CaseListResponse(cases=cases, total=len(cases))


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get a single case by ID."""
    result = await db.execute(
        select(Case)
        .options(selectinload(Case.series), selectinload(Case.jobs))
        .where(Case.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.delete("/{case_id}", status_code=204)
async def delete_case(case_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Permanently delete a case, all child artifacts, and its disk data."""
    result = await db.execute(select(Case).where(Case.id == case_id))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    await db.delete(case)
    await db.commit()

    # Clean up disk files
    try:
        case_dir = settings.data_dir / str(case_id)
        if case_dir.exists():
            shutil.rmtree(case_dir, ignore_errors=True)
    except Exception:
        pass

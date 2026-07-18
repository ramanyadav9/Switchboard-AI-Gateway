import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Skill, User
from app.routes.auth import get_current_user

router = APIRouter()


class SkillCreate(BaseModel):
    name: str
    description: str
    content: str
    category: str = "general"


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    content: str | None = None
    category: str | None = None


class SkillResponse(BaseModel):
    id: str
    name: str
    description: str
    content: str
    category: str
    is_public: bool
    usage_count: int
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=SkillResponse, status_code=201)
def create_skill(
    body: SkillCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = Skill(
        id=str(uuid.uuid4()),
        user_id=user.id,
        name=body.name,
        description=body.description,
        content=body.content,
        category=body.category,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.get("", response_model=list[SkillResponse])
def list_skills(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return (
        db.query(Skill)
        .filter((Skill.user_id == user.id) | (Skill.is_public == True))
        .order_by(Skill.usage_count.desc())
        .all()
    )


@router.get("/{skill_id}", response_model=SkillResponse)
def get_skill(
    skill_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill or (skill.user_id != user.id and not skill.is_public):
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.patch("/{skill_id}")
def update_skill(
    skill_id: str,
    body: SkillUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = db.query(Skill).filter(
        Skill.id == skill_id, Skill.user_id == user.id
    ).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if body.name is not None:
        skill.name = body.name
    if body.description is not None:
        skill.description = body.description
    if body.content is not None:
        skill.content = body.content
    if body.category is not None:
        skill.category = body.category
    db.commit()
    return {"detail": "Updated"}


@router.delete("/{skill_id}")
def delete_skill(
    skill_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    skill = db.query(Skill).filter(
        Skill.id == skill_id, Skill.user_id == user.id
    ).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(skill)
    db.commit()
    return {"detail": "Deleted"}

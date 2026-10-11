"""Authenticated, project-scoped record annotations and shared tags."""
from datetime import datetime, timezone
from typing import Literal
import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from database import get_db
from dependencies import check_project_access, get_current_user, get_user_project_role, ROLE_LEVELS
from services.db_backend import DBBackend

router = APIRouter(prefix="/api", tags=["record-collaboration"])


class AnnotationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=10000)
    visibility: Literal["shared", "private"]
    request_id: uuid.UUID = Field(default_factory=uuid.uuid4)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Enter a comment or note")
        return value.strip()


class TagCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = " ".join(value.split())
        if not value:
            raise ValueError("Enter a tag name")
        return value


class TagUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=80)
    archived: StrictBool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return TagCreate.clean_name(value) if value is not None else None

    @model_validator(mode="after")
    def require_change(self):
        if self.name is None and self.archived is None:
            raise ValueError("Provide a name or archive status")
        return self


def _now():
    return datetime.now(timezone.utc).isoformat()


def _project(db, project_id, user, role="viewer"):
    if not db.get("projects", project_id):
        raise HTTPException(404, "Project not found")
    check_project_access(db, project_id, user, min_role=role)


def _study(db, study_id, user, role="viewer"):
    study = db.get("studies", study_id)
    if not study:
        raise HTTPException(404, "Study not found")
    _project(db, study["project_id"], user, role)
    return study


def _can_write(db, project_id, user):
    role = get_user_project_role(user["user_id"], project_id, db)
    return ROLE_LEVELS.get(role, 0) >= ROLE_LEVELS["reviewer"]


def _tag(db, project_id, tag_id):
    tag = db.get("project_tags", tag_id)
    if not tag or tag["project_id"] != project_id:
        raise HTTPException(404, "Tag not found in this project")
    return tag


def _public_tag(tag):
    return {**tag, "archived": bool(tag["archived"])}


def _unique_name(db, project_id, name, exclude_id=None):
    normalized = name.casefold()
    if any(t["normalized_name"] == normalized and t["tag_id"] != exclude_id
           for t in db.query("project_tags", {"project_id": project_id})):
        raise HTTPException(409, "This tag name already exists. Rename or restore the existing tag.")
    return normalized


@router.get("/studies/{study_id}/annotations")
async def list_annotations(study_id: str, user: dict = Depends(get_current_user),
                           db: DBBackend = Depends(get_db)):
    study = _study(db, study_id, user)
    # Private rows are queried with the authenticated author, never returned then hidden in the UI.
    shared = db.query("record_annotations", {"study_id": study_id, "visibility": "shared"})
    private = db.query("record_annotations", {"study_id": study_id, "visibility": "private", "author_id": user["user_id"]})
    return {"annotations": sorted(shared + private, key=lambda r: (r["created_at"], r["annotation_id"])),
            "can_write": _can_write(db, study["project_id"], user)}


@router.post("/studies/{study_id}/annotations")
async def add_annotation(study_id: str, body: AnnotationCreate,
                         user: dict = Depends(get_current_user), db: DBBackend = Depends(get_db)):
    study = _study(db, study_id, user, "reviewer")
    annotation_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'annotation:{study_id}:{user["user_id"]}:{body.request_id}'))
    existing = db.get("record_annotations", annotation_id)
    if existing:
        if existing["text"] != body.text or existing["visibility"] != body.visibility:
            raise HTTPException(409, "This request was already saved with different content")
        return existing
    row = {"annotation_id": annotation_id, "study_id": study_id, "project_id": study["project_id"],
           "author_id": user["user_id"], "author_name": user["username"],
           "text": body.text, "visibility": body.visibility, "created_at": _now()}
    try:
        db.insert("record_annotations", row)
    except sqlite3.IntegrityError:
        existing = db.get("record_annotations", annotation_id)
        if not existing or existing["text"] != body.text or existing["visibility"] != body.visibility:
            raise HTTPException(409, "Comment could not be saved. Refresh and retry.")
        return existing
    db.commit()
    return row


@router.get("/projects/{project_id}/tags")
async def list_tags(project_id: str, q: str = Query("", max_length=80), include_archived: bool = True,
                    user: dict = Depends(get_current_user), db: DBBackend = Depends(get_db)):
    _project(db, project_id, user)
    tags = [_public_tag(t) for t in db.query("project_tags", {"project_id": project_id})
            if (include_archived or not t["archived"]) and q.casefold() in t["name"].casefold()]
    tags.sort(key=lambda t: (t["archived"], t["name"].casefold(), t["tag_id"]))
    ids = {t["tag_id"] for t in tags}
    studies = {s["study_id"] for s in db.query("studies", {"project_id": project_id})}
    study_tags = {}
    for link in db.query("study_tag_links", {"project_id": project_id}):
        if link["tag_id"] in ids and link["study_id"] in studies:
            study_tags.setdefault(link["study_id"], []).append(link["tag_id"])
    return {"tags": tags, "study_tags": study_tags, "can_write": _can_write(db, project_id, user)}


@router.post("/projects/{project_id}/tags")
async def create_tag(project_id: str, body: TagCreate, user: dict = Depends(get_current_user),
                     db: DBBackend = Depends(get_db)):
    _project(db, project_id, user, "reviewer")
    normalized = _unique_name(db, project_id, body.name)
    row = {"tag_id": str(uuid.uuid4()), "project_id": project_id, "name": body.name,
           "normalized_name": normalized, "archived": 0,
           "created_by": user["user_id"], "created_at": _now(), "updated_at": _now()}
    try:
        db.insert("project_tags", row)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "This tag name already exists")
    db.commit()
    return _public_tag(row)


@router.patch("/projects/{project_id}/tags/{tag_id}")
async def update_tag(project_id: str, tag_id: str, body: TagUpdate,
                     user: dict = Depends(get_current_user), db: DBBackend = Depends(get_db)):
    _project(db, project_id, user, "reviewer")
    tag = _tag(db, project_id, tag_id)
    changes = {"updated_at": _now()}
    if body.name is not None:
        changes.update(name=body.name, normalized_name=_unique_name(db, project_id, body.name, tag_id))
    if body.archived is not None:
        changes["archived"] = int(body.archived)
    try:
        saved = db.update("project_tags", tag_id, changes)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "This tag name already exists")
    if not saved:
        raise HTTPException(503, "Tag could not be saved. Please retry.")
    db.commit()
    return _public_tag({**tag, **changes})


@router.get("/projects/{project_id}/tags/{tag_id}/studies")
async def studies_by_tag(project_id: str, tag_id: str, user: dict = Depends(get_current_user),
                         db: DBBackend = Depends(get_db)):
    _project(db, project_id, user)
    _tag(db, project_id, tag_id)
    existing = {s["study_id"] for s in db.query("studies", {"project_id": project_id})}
    return {"study_ids": sorted({r["study_id"] for r in db.query("study_tag_links", {
        "project_id": project_id, "tag_id": tag_id}) if r["study_id"] in existing})}


@router.put("/studies/{study_id}/tags/{tag_id}")
async def attach_tag(study_id: str, tag_id: str, user: dict = Depends(get_current_user),
                     db: DBBackend = Depends(get_db)):
    study = _study(db, study_id, user, "reviewer")
    tag = db.get("project_tags", tag_id)
    if not tag:
        raise HTTPException(404, "Tag not found")
    if tag["project_id"] != study["project_id"]:
        raise HTTPException(400, "Study and tag must belong to the same project")
    if tag["archived"]:
        raise HTTPException(409, "Restore this archived tag before adding it to a record")
    link_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"study-tag:{study_id}:{tag_id}"))
    if not db.get("study_tag_links", link_id):
        try:
            db.insert("study_tag_links", {"link_id": link_id, "project_id": study["project_id"],
                "study_id": study_id, "tag_id": tag_id, "created_by": user["user_id"], "created_at": _now()})
        except sqlite3.IntegrityError:
            if not db.get("study_tag_links", link_id):
                raise HTTPException(503, "Tag could not be attached. Please retry.")
        db.commit()
    return {"study_id": study_id, "tag_id": tag_id, "attached": True}


@router.delete("/studies/{study_id}/tags/{tag_id}")
async def detach_tag(study_id: str, tag_id: str, user: dict = Depends(get_current_user),
                     db: DBBackend = Depends(get_db)):
    study = _study(db, study_id, user, "reviewer")
    _tag(db, study["project_id"], tag_id)
    link_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"study-tag:{study_id}:{tag_id}"))
    if db.get("study_tag_links", link_id) and not db.delete("study_tag_links", link_id):
        raise HTTPException(503, "Tag could not be removed. Please retry.")
    db.commit()
    return {"study_id": study_id, "tag_id": tag_id, "attached": False}

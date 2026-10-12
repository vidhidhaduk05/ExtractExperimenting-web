"""Authentication and authorization dependencies.

JWT-based auth using python-jose and passlib for password hashing.
Provides get_current_user dependency for protected endpoints.
Session management via refresh tokens stored in the sessions table.
"""
from __future__ import annotations
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
import sqlite3

from config import settings
from database import get_db
from services.db_backend import get_db_backend, DBBackend

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Role hierarchy for access control (higher = more permissions)
ROLE_LEVELS = {"viewer": 1, "reviewer": 2, "editor": 3, "owner": 4}


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        plain_bytes = plain.encode("utf-8")[:72]
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(plain_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(user_id: str, username: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.effective_jwt_secret, algorithm=settings.jwt_algorithm)


def create_user(username: str, password: str, email: str = "", role: str = "reviewer",
                db: Optional[DBBackend] = None) -> dict:
    """Create a new user in the database."""
    user_id = str(uuid.uuid4())
    hashed = hash_password(password)
    db = db or get_db_backend()
    # Check if username already exists
    existing = db.query("users", {"username": username})
    if existing:
        raise ValueError(f"Username '{username}' already exists")
    db.insert("users", {
        "user_id": user_id,
        "username": username,
        "password_hash": hashed,
        "email": email,
        "role": role,
    })
    db.commit()
    return {"user_id": user_id, "username": username, "email": email, "role": role}


def authenticate_user(username: str, password: str, db: Optional[DBBackend] = None) -> Optional[dict]:
    """Verify credentials and return user dict, or None."""
    db = db or get_db_backend()
    users = db.query("users", {"username": username})
    if not users:
        return None
    user = users[0]
    if not verify_password(password, user.get("password_hash", "")):
        return None
    return user


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: DBBackend = Depends(get_db),
) -> dict:
    """Decode JWT and return user info. Raises 401 if invalid."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.effective_jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.get("users", user_id)
    if not user:
        raise credentials_exception
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    db: DBBackend = Depends(get_db),
) -> Optional[dict]:
    """Like get_current_user but returns None if token is missing. Raises 401 if invalid token is provided."""
    if not token:
        return None
    return await get_current_user(token, db)


# ── Session management (refresh tokens) ──

def _hash_token(token: str) -> str:
    """Hash a refresh token for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_refresh_token(user_id: str, ip_address: str = "", user_agent: str = "",
                         db: Optional[DBBackend] = None) -> tuple[str, str]:
    """Create a refresh token and store its hash in the sessions table.
    Returns (session_id, refresh_token).
    """
    session_id = str(uuid.uuid4())
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    expires_at = (datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)).isoformat()

    db = db or get_db_backend()
    db.insert("sessions", {
        "session_id": session_id,
        "user_id": user_id,
        "refresh_token": token_hash,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "expires_at": expires_at,
        "is_revoked": 0,
    })
    db.commit()
    return session_id, raw_token


def verify_refresh_token(token: str, db: Optional[DBBackend] = None) -> Optional[dict]:
    """Verify a refresh token and return {session_id, user_id} or None."""
    token_hash = _hash_token(token)
    db = db or get_db_backend()
    sessions = db.query("sessions", {"refresh_token": token_hash})
    if not sessions:
        return None
    session = sessions[0]
    if session.get("is_revoked"):
        return None
    expires_at_str = session.get("expires_at", "")
    if expires_at_str and datetime.utcnow() > datetime.fromisoformat(expires_at_str):
        return None

    # Get user details (decomposed JOIN)
    user = db.get("users", session.get("user_id", ""))
    username = user.get("username", "") if user else ""
    role = user.get("role", "") if user else ""

    # Update last_active
    db.update("sessions", session["session_id"], {"last_active": datetime.utcnow().isoformat()})
    db.commit()

    return {
        "session_id": session["session_id"],
        "user_id": session["user_id"],
        "username": username,
        "role": role,
    }


def rotate_refresh_token(old_token: str, ip_address: str = "", user_agent: str = "",
                         db: Optional[DBBackend] = None) -> Optional[tuple[str, str, str, str, str]]:
    """Revoke old refresh token and issue a new one.
    Returns (session_id, new_token, user_id, username, role) or None.
    """
    db = db or get_db_backend()
    info = verify_refresh_token(old_token, db=db)
    if not info:
        return None
    # Revoke old session
    revoke_session(info["session_id"], db=db)
    # Create new session
    session_id, new_token = create_refresh_token(info["user_id"], ip_address, user_agent, db=db)
    return session_id, new_token, info["user_id"], info["username"], info["role"]


def revoke_session(session_id: str, db: Optional[DBBackend] = None):
    """Mark a session as revoked."""
    db = db or get_db_backend()
    db.update("sessions", session_id, {"is_revoked": 1})
    db.commit()


def revoke_all_user_sessions(user_id: str, db: Optional[DBBackend] = None):
    """Revoke all active sessions for a user."""
    db = db or get_db_backend()
    sessions = db.query("sessions", {"user_id": user_id})
    for s in sessions:
        if not s.get("is_revoked"):
            db.update("sessions", s["session_id"], {"is_revoked": 1})
    db.commit()


def list_user_sessions(user_id: str, db: Optional[DBBackend] = None) -> list[dict]:
    """List all active (non-revoked, non-expired) sessions for a user."""
    db = db or get_db_backend()
    sessions = db.query("sessions", {"user_id": user_id}, order_by="last_active DESC")
    now_iso = datetime.utcnow().isoformat()
    active = []
    for s in sessions:
        if not s.get("is_revoked") and (s.get("expires_at", "") > now_iso):
            active.append(s)
    return active


def revoke_session_by_token(token: str, db: Optional[DBBackend] = None) -> bool:
    """Revoke the session associated with a refresh token. Returns True if found."""
    token_hash = _hash_token(token)
    db = db or get_db_backend()
    sessions = db.query("sessions", {"refresh_token": token_hash})
    if not sessions:
        return False
    db.update("sessions", sessions[0]["session_id"], {"is_revoked": 1})
    db.commit()
    return True


# ── Project access control ──

def get_user_project_role(user_id: str, project_id: str, conn: Any = None) -> Optional[str]:
    """Get the user's role on a project, or None if not a member."""
    db = conn if hasattr(conn, "query") else get_db_backend()
    members = db.query("project_members", {"user_id": user_id, "project_id": project_id})
    return members[0].get("role") if members else None


def can_user_access_project(user_id: str, project_id: str, conn: Any = None, min_role: str = "viewer") -> bool:
    """Check if user has at least min_role on the project."""
    role = get_user_project_role(user_id, project_id, conn)
    if not role:
        return False
    return ROLE_LEVELS.get(role, 0) >= ROLE_LEVELS.get(min_role, 0)


def check_project_access(conn: Any, project_id: str, user: Optional[dict], min_role: str = "viewer"):
    """Raise 403 if user lacks access to the project.

    If user is None (no auth token), silently allow — this preserves backward
    compatibility for dev/testing. Enforcement becomes strict when the frontend
    auth UI is implemented.
    """
    if user is None:
        return
    user_id = user.get("user_id") or user.get("sub", "")
    if not can_user_access_project(user_id, project_id, conn, min_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions (requires {min_role} role)",
        )


def resolve_study_project_id(conn: Any, study_id: str) -> Optional[str]:
    """Get project_id for a study."""
    db = conn if hasattr(conn, "get") else get_db_backend()
    study = db.get("studies", study_id)
    return study.get("project_id") if study else None


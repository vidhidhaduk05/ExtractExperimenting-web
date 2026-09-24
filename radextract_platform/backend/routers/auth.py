"""Authentication router: register, login, refresh, sessions, logout."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional

from database import get_db
from models import (
    UserCreate, Token, LoginRequest, UserResponse,
    RefreshTokenRequest, SessionResponse,
)
from dependencies import (
    create_user, authenticate_user, create_access_token, get_current_user,
    create_refresh_token, verify_refresh_token, rotate_refresh_token,
    revoke_session, revoke_all_user_sessions, list_user_sessions,
    revoke_session_by_token,
)
from services.db_backend import DBBackend

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
async def register(body: UserCreate, conn: DBBackend = Depends(get_db)):
    try:
        user = create_user(body.username, body.password, body.email, body.role, db=conn)
        return UserResponse(**user)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/login", response_model=Token)
async def login(body: LoginRequest, request: Request, conn: DBBackend = Depends(get_db)):
    user = authenticate_user(body.username, body.password, db=conn)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user["user_id"], user["username"], user["role"])
    _, refresh_token = create_refresh_token(
        user["user_id"],
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
        db=conn,
    )
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user["user_id"],
        username=user["username"],
        role=user["role"],
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(body: RefreshTokenRequest, request: Request, conn: DBBackend = Depends(get_db)):
    """Exchange a refresh token for a new access token (and rotated refresh token)."""
    result = rotate_refresh_token(
        body.refresh_token,
        ip_address=request.client.host if request.client else "",
        user_agent=request.headers.get("user-agent", ""),
        db=conn,
    )
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    _, new_refresh, user_id, username, role = result
    access_token = create_access_token(user_id, username, role)
    return Token(
        access_token=access_token,
        refresh_token=new_refresh,
        user_id=user_id,
        username=username,
        role=role,
    )


@router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(user: dict = Depends(get_current_user), conn: DBBackend = Depends(get_db)):
    """List all active sessions for the current user."""
    sessions = list_user_sessions(user["user_id"], db=conn)
    return [SessionResponse(**s) for s in sessions]


@router.delete("/sessions/{session_id}")
async def revoke_one_session(session_id: str, user: dict = Depends(get_current_user), conn: DBBackend = Depends(get_db)):
    """Revoke a specific session."""
    # Verify the session belongs to the current user
    sessions = list_user_sessions(user["user_id"], db=conn)
    if not any(s["session_id"] == session_id for s in sessions):
        raise HTTPException(status_code=404, detail="Session not found")
    revoke_session(session_id, db=conn)
    return {"message": "Session revoked"}


@router.delete("/sessions")
async def revoke_all_sessions(user: dict = Depends(get_current_user), conn: DBBackend = Depends(get_db)):
    """Revoke all sessions for the current user (logout everywhere)."""
    revoke_all_user_sessions(user["user_id"], db=conn)
    return {"message": "All sessions revoked"}


@router.post("/logout")
async def logout(body: RefreshTokenRequest, user: Optional[dict] = Depends(get_current_user), conn: DBBackend = Depends(get_db)):
    """Logout — revoke the current session via refresh token."""
    success = revoke_session_by_token(body.refresh_token, db=conn)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Logged out"}

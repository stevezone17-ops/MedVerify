"""Authentication endpoints — register, login, current user."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, status

from app.db.repositories import profiles_repo
from app.schemas.auth import UserCreate, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate):
    """Create a new user account."""
    if profiles_repo.get_by_email(body.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    now = datetime.now(timezone.utc)
    role = body.role if body.role in ("user", "admin") else "user"
    user_doc = profiles_repo.create_user({
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": role,
    })

    user_id = str(user_doc["id"])
    token = create_token(user_id, role)
    user_resp = UserResponse(id=user_id, name=body.name, email=body.email, role=role, created_at=now)
    return TokenResponse(access_token=token, user=user_resp)


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    """Authenticate and receive a JWT."""
    user = profiles_repo.get_by_email(body.email)
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    user_id = str(user.get("id") or user.get("_id"))
    role = user.get("role", "user")
    token = create_token(user_id, role)
    user_resp = UserResponse(
        id=user_id,
        name=user.get("name") or user.get("full_name", ""),
        email=user["email"],
        role=role,
        created_at=user.get("created_at") or datetime.now(timezone.utc),
    )
    return TokenResponse(access_token=token, user=user_resp)


@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user."""
    user_id = str(user.get("id") or user.get("_id"))
    return UserResponse(
        id=user_id,
        name=user.get("name") or user.get("full_name", ""),
        email=user["email"],
        role=user.get("role", "user"),
        created_at=user.get("created_at") or datetime.now(timezone.utc),
    )

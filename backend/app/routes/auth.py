"""Authentication endpoints — register, login, current user."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, status

from app.database import users_col
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
    if users_col().find_one({"email": body.email}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    user_id = f"user_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)
    doc = {
        "_id": user_id,
        "name": body.name,
        "email": body.email,
        "password_hash": hash_password(body.password),
        "role": body.role if body.role in ("user", "admin") else "user",
        "created_at": now,
    }
    users_col().insert_one(doc)

    token = create_token(user_id, doc["role"])
    user_resp = UserResponse(id=user_id, name=body.name, email=body.email, role=doc["role"], created_at=now)
    return TokenResponse(access_token=token, user=user_resp)


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    """Authenticate and receive a JWT."""
    user = users_col().find_one({"email": body.email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    token = create_token(str(user["_id"]), user["role"])
    user_resp = UserResponse(
        id=str(user["_id"]),
        name=user["name"],
        email=user["email"],
        role=user["role"],
        created_at=user["created_at"],
    )
    return TokenResponse(access_token=token, user=user_resp)


@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return UserResponse(
        id=str(user["_id"]),
        name=user["name"],
        email=user["email"],
        role=user["role"],
        created_at=user["created_at"],
    )

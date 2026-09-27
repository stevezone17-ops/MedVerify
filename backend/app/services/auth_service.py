"""JWT-based authentication and password hashing helpers with Supabase Auth integration."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings
from app.db.repositories import profiles_repo
from app.db.supabase_client import get_supabase_client

logger = logging.getLogger("medverify.auth")
_security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    pwd_bytes = plain.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes)
    payload = {"sub": user_id, "role": role.lower(), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Validate token using local JWT secret or Supabase Auth."""
    # 1. Attempt native local JWT decode
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        pass

    # 2. Attempt Supabase JWT decode if Supabase JWT secret is configured
    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except JWTError:
            pass

    # 3. Attempt Supabase Auth API verification if client is configured
    client = get_supabase_client()
    if client:
        try:
            user_resp = client.auth.get_user(token)
            if user_resp and user_resp.user:
                u = user_resp.user
                role = (u.user_metadata or {}).get("role", "user")
                return {"sub": str(u.id), "email": u.email, "role": role}
        except Exception:
            pass

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")


# ---------------------------------------------------------------------------
# FastAPI dependency — current user
# ---------------------------------------------------------------------------

def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_security)) -> dict:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    payload = decode_token(creds.credentials)
    sub = payload.get("sub")
    email = payload.get("email")

    user = None
    if sub:
        user = profiles_repo.get_by_id(sub)
    if not user and email:
        user = profiles_repo.get_by_email(email)

    if user is None:
        # Auto-provision profile record if authenticated via external Supabase Auth
        if sub and email:
            user = profiles_repo.create_user({
                "id": sub,
                "name": email.split("@")[0].capitalize(),
                "email": email,
                "role": payload.get("role", "user"),
            })
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    if user.get("status") == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled. Contact an administrator.")

    return user


def get_optional_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_security)) -> dict | None:
    if creds is None:
        return None
    try:
        return get_current_user(creds)
    except Exception:
        return None


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if str(user.get("role", "")).lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return user


def require_authenticated_user(user: dict = Depends(get_current_user)) -> dict:
    return user

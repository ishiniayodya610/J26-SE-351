"""
AquaGuard — Auth domain: business logic service.
All database operations and security logic live here.
Routers only call these functions — no raw DB access in routers.
"""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from backend.app.core.security import (
        create_access_token,
        create_refresh_token,
        decode_token,
        hash_password,
        verify_password,
    )
    from backend.app.domains.auth.schemas import (
        LoginRequest,
        RefreshRequest,
        RegisterRequest,
        TokenResponse,
        UserOut,
    )
except ImportError:
    from app.core.security import (
        create_access_token,
        create_refresh_token,
        decode_token,
        hash_password,
        verify_password,
    )
    from app.domains.auth.schemas import (
        LoginRequest,
        RefreshRequest,
        RegisterRequest,
        TokenResponse,
        UserOut,
    )

logger = logging.getLogger("AquaGuard.Auth")


def _fmt_user(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        email=doc["email"],
        full_name=doc["full_name"],
        is_active=doc.get("is_active", True),
    )


async def register_user(req: RegisterRequest, db: AsyncIOMotorDatabase) -> UserOut:
    """
    Create a new user account.
    Raises 409 if the email is already taken.
    """
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    doc = {
        "email": req.email.lower(),
        "hashed_password": hash_password(req.password),
        "full_name": req.full_name,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("New user registered: %s (id=%s)", doc["email"], result.inserted_id)
    return _fmt_user(doc)


async def login_user(req: LoginRequest, db: AsyncIOMotorDatabase) -> TokenResponse:
    """
    Authenticate user and return access + refresh tokens.
    Raises 401 on wrong credentials (deliberately vague message for security).
    """
    _bad = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
    )
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["hashed_password"]):
        raise _bad

    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated.")

    user_id = str(user["_id"])
    access = create_access_token(user_id=user_id, email=user["email"])
    refresh = create_refresh_token(user_id=user_id)

    # Store refresh token hash so we can revoke it on logout
    refresh_payload = decode_token(refresh)
    await db.refresh_tokens.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "user_id": user_id,
                "token": refresh,
                "expires_at": refresh_payload["exp"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    logger.info("User logged in: %s", user["email"])
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=_fmt_user(user),
    )


async def refresh_tokens(req: RefreshRequest, db: AsyncIOMotorDatabase) -> dict:
    """
    Issue a new access token given a valid, non-revoked refresh token.
    """
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token.",
    )

    payload = decode_token(req.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise cred_exc

    user_id = payload.get("sub", "")

    # Check refresh token is still the one we have on record (not logged out)
    stored = await db.refresh_tokens.find_one({"user_id": user_id})
    if not stored or stored["token"] != req.refresh_token:
        raise cred_exc

    # Verify user still exists
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise cred_exc

    new_access = create_access_token(user_id=user_id, email=user["email"])
    return {"access_token": new_access, "token_type": "bearer"}


async def logout_user(user_id: str, db: AsyncIOMotorDatabase) -> None:
    """Revoke the stored refresh token so it cannot be reused."""
    await db.refresh_tokens.delete_one({"user_id": user_id})
    logger.info("User logged out: id=%s", user_id)

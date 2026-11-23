"""
AquaGuard — Auth domain: HTTP router.
Thin layer — only parses HTTP and delegates to service.py.
"""
from fastapi import APIRouter, Depends, status

try:
    from backend.app.core.dependencies import get_current_user
    from backend.app.db.mongo import get_db
    from backend.app.domains.auth.schemas import (
        AccessTokenResponse,
        LoginRequest,
        RefreshRequest,
        RegisterRequest,
        TokenResponse,
        UpdateProfileRequest,
        UserOut,
    )
    from backend.app.domains.auth import service
except ImportError:
    from app.core.dependencies import get_current_user
    from app.db.mongo import get_db
    from app.domains.auth.schemas import (
        AccessTokenResponse,
        LoginRequest,
        RefreshRequest,
        RegisterRequest,
        TokenResponse,
        UpdateProfileRequest,
        UserOut,
    )
    from app.domains.auth import service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new AquaGuard account",
)
async def register(req: RegisterRequest):
    db = get_db()
    return await service.register_user(req, db)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and receive access + refresh tokens",
)
async def login(req: LoginRequest):
    db = get_db()
    return await service.login_user(req, db)


@router.post(
    "/refresh",
    response_model=AccessTokenResponse,
    summary="Exchange a refresh token for a new access token",
)
async def refresh(req: RefreshRequest):
    db = get_db()
    return await service.refresh_tokens(req, db)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Logout — invalidate the refresh token",
)
async def logout(current_user: dict = Depends(get_current_user)):
    db = get_db()
    await service.logout_user(current_user["id"], db)


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get the currently authenticated user's profile",
)
async def me(current_user: dict = Depends(get_current_user)):
    return UserOut(
        id=current_user["id"],
        email=current_user["email"],
        full_name=current_user["full_name"],
        is_active=current_user.get("is_active", True),
    )


@router.patch(
    "/me",
    response_model=UserOut,
    summary="Update the authenticated user's profile",
)
async def update_me(
    req: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    update_fields = req.model_dump(exclude_none=True)
    if update_fields:
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": update_fields},
        )
    updated = await db.users.find_one({"_id": current_user["_id"]})
    return UserOut(
        id=str(updated["_id"]),
        email=updated["email"],
        full_name=updated["full_name"],
        is_active=updated.get("is_active", True),
    )

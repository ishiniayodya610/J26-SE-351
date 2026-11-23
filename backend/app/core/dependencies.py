"""
AquaGuard — FastAPI dependency injectors.
Import these with Depends() in any router.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    from backend.app.core.security import decode_token
    from backend.app.db.mongo import get_db
except ImportError:
    from app.core.security import decode_token
    from app.db.mongo import get_db

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Validate the Bearer JWT and return the user document from MongoDB.
    Raises 401 if the token is missing, invalid, expired, or the user
    no longer exists in the database.
    """
    token = credentials.credentials
    payload = decode_token(token)

    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if payload is None or payload.get("type") != "access":
        raise cred_exc

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise cred_exc

    db = get_db()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available.",
        )

    from bson import ObjectId
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise cred_exc

    if user is None:
        raise cred_exc

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated.",
        )

    # Normalise _id to string so routers don't deal with ObjectId
    user["id"] = str(user["_id"])
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
) -> dict | None:
    """Like get_current_user but returns None instead of raising for public endpoints."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None

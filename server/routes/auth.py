from fastapi import APIRouter, HTTPException, Request, Depends
from server.lib.mongodb import get_database
from server.middleware.auth import JWTBearer
from server.config import settings
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from bson import ObjectId
from typing import Optional
import os
import logging
import pyotp

router = APIRouter()

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = settings.JWT_SECRET or "your-secret-key"
JWT_ALGORITHM = "HS256"

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

@router.post("/login")
async def login(request: Request):
    try:
        body = await request.json()
        email = body.get("email")
        password = body.get("password")

        if not email or not password:
            raise HTTPException(status_code=400, detail="Email and password are required")

        db = await get_database()
        user = await db["users"].find_one({"email": email})

        if not user:
            # Log failed login
            await db["auditlogs"].insert_one({
                "user": "Unknown",
                "userEmail": email,
                "action": "LOGIN_FAILED",
                "resource": "Authentication",
                "details": {"reason": "User not found"},
                "ipAddress": request.client.host if request.client else "unknown",
                "userAgent": request.headers.get("user-agent", "unknown"),
                "severity": "warning",
                "category": "authentication",
                "timestamp": datetime.utcnow()
            })
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if user.get("status") == "suspended":
            await db["auditlogs"].insert_one({
                "user": user.get("name", "Unknown"),
                "userEmail": user["email"],
                "action": "LOGIN_FAILED",
                "resource": "Authentication",
                "details": {"reason": "Account suspended"},
                "ipAddress": request.client.host if request.client else "unknown",
                "userAgent": request.headers.get("user-agent", "unknown"),
                "severity": "warning",
                "category": "authentication",
                "timestamp": datetime.utcnow()
            })
            raise HTTPException(status_code=401, detail="Account is suspended. Please contact administrator.")

        if not verify_password(password, user["password"]):
            await db["auditlogs"].insert_one({
                "user": user.get("name", "Unknown"),
                "userEmail": user["email"],
                "action": "LOGIN_FAILED",
                "resource": "Authentication",
                "details": {"reason": "Invalid password"},
                "ipAddress": request.client.host if request.client else "unknown",
                "userAgent": request.headers.get("user-agent", "unknown"),
                "severity": "warning",
                "category": "authentication",
                "timestamp": datetime.utcnow()
            })
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Update status if verifying and no 2FA
        if user.get("status") == "verifying" and not user.get("twoFASecret"):
            await db["users"].update_one(
                {"_id": user["_id"]},
                {"$set": {"status": "active", "updatedAt": datetime.utcnow().isoformat()}}
            )
            user["status"] = "active"

        # Get role
        role = await db["roles"].find_one({"_id": user["roleId"]})

        # Update last login
        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {"lastLogin": datetime.utcnow().isoformat(), "updatedAt": datetime.utcnow().isoformat()}}
        )

        # Log successful login
        await db["auditlogs"].insert_one({
            "user": user.get("name", "Unknown"),
            "userEmail": user["email"],
            "action": "LOGIN_SUCCESS",
            "resource": "Authentication",
            "ipAddress": request.client.host if request.client else "unknown",
            "userAgent": request.headers.get("user-agent", "unknown"),
            "severity": "info",
            "category": "authentication",
            "timestamp": datetime.utcnow()
        })

        user_data = {
            "_id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": role.get("name", "User") if role else "User",
            "roleId": str(user["roleId"]),
            "status": user["status"],
            "permissions": role.get("permissions", []) if role else [],
            "twoFASecret": user.get("twoFASecret"),
            "passwordResetRequired": user.get("passwordResetRequired", False)
        }

        token = create_access_token({"userId": str(user["_id"]), "permissions": role.get("permissions", []) if role else []})

        return {
            "success": True,
            "user": user_data,
            "token": token,
            "message": "Login successful"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@router.get("/verify")
async def verify_token(request: Request):
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="No token provided")

        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("userId")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        db = await get_database()
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        if user.get("status") != "active":
            raise HTTPException(status_code=401, detail="User account is not active")

        role = await db["roles"].find_one({"_id": user["roleId"]})
        user_data = {
            "_id": str(user["_id"]),
            "name": user["name"],
            "email": user["email"],
            "role": role.get("name", "User") if role else "User",
            "permissions": role.get("permissions", []) if role else [],
            "status": user["status"],
            "avatar": user.get("avatar")
        }

        return {"user": user_data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth verification error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/verify")
async def verify_password_for_dashboard(request: Request):
    try:
        body = await request.json()
        password = body.get("password")
        target_dashboard = body.get("targetDashboard")

        if not password or not target_dashboard:
            raise HTTPException(status_code=400, detail="Password and target dashboard are required")

        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Unauthorized")

        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("userId")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

        db = await get_database()
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password(password, user["password"]):
            await db["auditlogs"].insert_one({
                "user": str(user["_id"]),
                "userEmail": user["email"],
                "action": "DASHBOARD_ACCESS_DENIED",
                "resource": target_dashboard,
                "details": {"reason": "Invalid password"},
                "ipAddress": request.client.host if request.client else "unknown",
                "userAgent": request.headers.get("user-agent", "unknown"),
                "severity": "warning",
                "category": "security",
                "timestamp": datetime.utcnow()
            })
            raise HTTPException(status_code=401, detail="Invalid password")

        role = await db["roles"].find_one({"_id": user["roleId"]})
        permissions = role.get("permissions", []) if role else []

        has_permission = (target_dashboard == "admin" and "admin_access" in permissions) or \
                        (target_dashboard != "admin" and "user_page_access" in permissions)

        if not has_permission:
            await db["auditlogs"].insert_one({
                "user": str(user["_id"]),
                "userEmail": user["email"],
                "action": "DASHBOARD_ACCESS_DENIED",
                "resource": target_dashboard,
                "details": {"reason": "Insufficient permissions"},
                "ipAddress": request.client.host if request.client else "unknown",
                "userAgent": request.headers.get("user-agent", "unknown"),
                "severity": "warning",
                "category": "security",
                "timestamp": datetime.utcnow()
            })
            raise HTTPException(status_code=403, detail="Insufficient permissions")

        temp_token = create_access_token(
            {"userId": str(user["_id"]), "dashboard": target_dashboard, "type": "dashboard_switch"},
            timedelta(minutes=15)
        )

        await db["auditlogs"].insert_one({
            "user": str(user["_id"]),
            "userEmail": user["email"],
            "action": "DASHBOARD_ACCESS_GRANTED",
            "resource": target_dashboard,
            "ipAddress": request.client.host if request.client else "unknown",
            "userAgent": request.headers.get("user-agent", "unknown"),
            "severity": "info",
            "category": "security",
            "timestamp": datetime.utcnow()
        })

        return {
            "success": True,
            "tempToken": temp_token,
            "user": {
                "_id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "role": role.get("name", "User") if role else "User",
                "permissions": permissions,
                "status": user["status"],
                "avatar": user.get("avatar")
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/change-password")
async def change_password(request: Request):
    try:
        body = await request.json()
        user_id = body.get("userId")
        new_password = body.get("newPassword")
        current_password = body.get("currentPassword")

        if not user_id or not new_password:
            raise HTTPException(status_code=400, detail="User ID and new password are required")

        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")

        db = await get_database()
        user = await db["users"].find_one({"_id": ObjectId(user_id)})

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if current_password:
            if not verify_password(current_password, user["password"]):
                raise HTTPException(status_code=400, detail="Current password is incorrect")

        hashed_new_password = get_password_hash(new_password)

        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {
                "password": hashed_new_password,
                "passwordResetRequired": False,
                "updatedAt": datetime.utcnow().isoformat()
            }}
        )

        return {"success": True, "message": "Password changed successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password: {e}")
        raise HTTPException(status_code=500, detail="Failed to change password")

@router.post("/forgot-password/initiate")
async def forgot_password_initiate(request: Request):
    try:
        body = await request.json()
        email = body.get("email", "").strip()

        if not email:
            raise HTTPException(status_code=400, detail="Email is required")

        db = await get_database()
        user = await db["users"].find_one({"email": email})

        if not user:
            raise HTTPException(status_code=404, detail="Email not found")

        two_fa_enabled = bool(user.get("twoFASecret") and user.get("twoFAEnabled", True))

        token = None
        if two_fa_enabled:
            token = create_access_token(
                {"userId": str(user["_id"]), "purpose": "password_reset"},
                timedelta(minutes=10)
            )

        ip_address = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")

        await db["auditlogs"].insert_one({
            "user": user.get("name", "Unknown"),
            "userEmail": user["email"],
            "action": "FORGOT_PASSWORD_REQUEST",
            "resource": "Password Reset",
            "details": "2FA required for password reset" if two_fa_enabled else "No 2FA configured; proceeding to direct password change",
            "ipAddress": ip_address,
            "userAgent": user_agent,
            "severity": "info",
            "category": "authentication",
            "timestamp": datetime.utcnow()
        })

        return {
            "success": True,
            "twoFAEnabled": two_fa_enabled,
            "token": token,
            "user": {
                "_id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"]
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password initiation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate password reset")

@router.post("/forgot-password/verify-2fa")
async def forgot_password_verify_2fa(request: Request):
    try:
        body = await request.json()
        token = body.get("token")
        code = body.get("code")

        if not token or not code:
            raise HTTPException(status_code=400, detail="Token and code are required")

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("userId")
            purpose = payload.get("purpose")
            if purpose != "password_reset":
                raise HTTPException(status_code=400, detail="Invalid token")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        db = await get_database()
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not user.get("twoFASecret"):
            raise HTTPException(status_code=400, detail="2FA not set up")

        totp = pyotp.TOTP(user["twoFASecret"])
        if not totp.verify(code):
            raise HTTPException(status_code=400, detail="Invalid 2FA code")

        # Create a token for password reset
        reset_token = create_access_token(
            {"userId": str(user["_id"]), "purpose": "password_reset_final"},
            timedelta(minutes=15)
        )

        # Log
        await db["auditlogs"].insert_one({
            "user": user.get("name", "Unknown"),
            "userEmail": user["email"],
            "action": "FORGOT_PASSWORD_2FA_SUCCESS",
            "resource": "Password Reset",
            "ipAddress": request.client.host if request.client else "unknown",
            "userAgent": request.headers.get("user-agent", "unknown"),
            "severity": "info",
            "category": "authentication",
            "timestamp": datetime.utcnow()
        })

        return {"success": True, "token": reset_token, "message": "2FA verification successful"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password 2FA verification error: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify 2FA")

@router.post("/forgot-password/reset")
async def forgot_password_reset(request: Request):
    try:
        body = await request.json()
        token = body.get("token")
        new_password = body.get("newPassword")

        if not token or not new_password:
            raise HTTPException(status_code=400, detail="Token and new password are required")

        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("userId")
            purpose = payload.get("purpose")
            if purpose != "password_reset_final":
                raise HTTPException(status_code=400, detail="Invalid token")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        db = await get_database()
        user = await db["users"].find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        hashed_password = get_password_hash(new_password)

        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {
                "password": hashed_password,
                "passwordResetRequired": False,
                "updatedAt": datetime.utcnow().isoformat()
            }}
        )

        # Log
        await db["auditlogs"].insert_one({
            "user": user.get("name", "Unknown"),
            "userEmail": user["email"],
            "action": "FORGOT_PASSWORD_RESET_SUCCESS",
            "resource": "Password Reset",
            "ipAddress": request.client.host if request.client else "unknown",
            "userAgent": request.headers.get("user-agent", "unknown"),
            "severity": "info",
            "category": "authentication",
            "timestamp": datetime.utcnow()
        })

        return {"success": True, "message": "Password reset successful"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Forgot password reset error: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset password")

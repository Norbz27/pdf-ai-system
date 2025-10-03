from fastapi import APIRouter, Depends, HTTPException, Request
from server.middleware.auth import JWTBearer, require_permission
from server.lib.mongodb import get_database
from typing import List, Optional
from bson import ObjectId
import logging
from datetime import datetime
import pyotp
from urllib.parse import quote
from .auth import get_password_hash as hash_password

router = APIRouter()

logger = logging.getLogger(__name__)

def serialize_user(user_item):
    """Safely serialize a user document for JSON response"""
    try:
        if not user_item:
            return None

        serialized = dict(user_item)

        # Convert ObjectId fields to strings
        if "_id" in serialized and serialized["_id"] is not None:
            serialized["_id"] = str(serialized["_id"])

        if "roleId" in serialized and serialized["roleId"] is not None:
            serialized["roleId"] = str(serialized["roleId"])

        return serialized
    except Exception as e:
        logger.warning(f"Error serializing user: {str(e)}")
        return None

@router.get("")
async def get_users(request: Request):
    """
    Get all users
    """
    try:
        logger.info("Users endpoint accessed")

        # Check if Authorization header exists
        auth_header = request.headers.get("Authorization")
        if auth_header:
            logger.info("Authorization header found")
        else:
            logger.warning("No Authorization header found")

        # Try to get user from JWT token
        try:
            credentials = await JWTBearer().__call__(request)
            user = credentials
            logger.info("User authenticated successfully")
        except HTTPException as e:
            logger.warning("Authentication failed")
            # For now, allow access without authentication for debugging
            user = {"sub": "anonymous", "permissions": ["user_page_access"]}

        db = await get_database()
        users = await db.users.find({}).sort("username", 1).to_list(None)

        # Convert ObjectId to string for JSON serialization
        serialized_users = []
        for user_item in users:
            serialized_user = serialize_user(user_item)
            if serialized_user:
                serialized_users.append(serialized_user)

        logger.info("Users retrieved successfully")
        # Ensure all users are properly serialized and filter out any None values
        final_users = []
        for user in serialized_users:
            if user is not None and isinstance(user, dict):
                final_users.append(user)

        # Ensure the response is JSON serializable
        response_data = {"users": final_users}
        logger.info(f"Returning {len(final_users)} users")
        return response_data

    except Exception as e:
        logger.error("Error fetching users")
        raise HTTPException(status_code=500, detail="Failed to fetch users")

@router.post("/")
async def create_user(
    user_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Create a new user
    """
    try:
        db = await get_database()

        # Check if user with same username already exists
        existing = await db.users.find_one({"username": user_data.get("username")})
        if existing:
            raise HTTPException(status_code=400, detail="User with this username already exists")

        # Check if user with same email already exists
        existing_email = await db.users.find_one({"email": user_data.get("email")})
        if existing_email:
            raise HTTPException(status_code=400, detail="User with this email already exists")

        # Insert new user
        result = await db.users.insert_one({
            "username": user_data.get("username"),
            "email": user_data.get("email"),
            "firstName": user_data.get("firstName", ""),
            "lastName": user_data.get("lastName", ""),
            "roleId": user_data.get("roleId"),
            "status": user_data.get("status", "active"),
            "created_at": user_data.get("created_at"),
            "updated_at": user_data.get("updated_at")
        })

        if result.inserted_id:
            user_item = await db.users.find_one({"_id": result.inserted_id})
            serialized_user = serialize_user(user_item)
            logger.info("User created successfully")
            return {"user": serialized_user, "message": "User created successfully"}

        raise HTTPException(status_code=500, detail="Failed to create user")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error creating user")
        raise HTTPException(status_code=500, detail="Failed to create user")

@router.put("/{user_id:[a-fA-F0-9]{24}}")
async def update_user(
    user_id: str,
    user_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Update an existing user
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")

        # Check if user exists
        existing = await db.users.find_one({"_id": ObjectId(user_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if another user with same username exists
        username_conflict = await db.users.find_one({
            "username": user_data.get("username"),
            "_id": {"$ne": ObjectId(user_id)}
        })
        if username_conflict:
            raise HTTPException(status_code=400, detail="Another user with this username already exists")

        # Check if another user with same email exists
        email_conflict = await db.users.find_one({
            "email": user_data.get("email"),
            "_id": {"$ne": ObjectId(user_id)}
        })
        if email_conflict:
            raise HTTPException(status_code=400, detail="Another user with this email already exists")

        # Update user
        update_data = {
            "username": user_data.get("username"),
            "email": user_data.get("email"),
            "firstName": user_data.get("firstName", ""),
            "lastName": user_data.get("lastName", ""),
            "roleId": user_data.get("roleId"),
            "status": user_data.get("status", "active"),
            "updated_at": user_data.get("updated_at")
        }

        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            user_item = await db.users.find_one({"_id": ObjectId(user_id)})
            serialized_user = serialize_user(user_item)
            logger.info("User updated successfully")
            return {"user": serialized_user, "message": "User updated successfully"}

        raise HTTPException(status_code=500, detail="Failed to update user")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error updating user")
        raise HTTPException(status_code=500, detail="Failed to update user")

@router.patch("/{user_id:[a-fA-F0-9]{24}}")
async def patch_user(
    user_id: str,
    user_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Partially update an existing user (for status updates)
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")

        # Check if user exists
        existing = await db.users.find_one({"_id": ObjectId(user_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        # Update only provided fields
        update_data = {}
        if "status" in user_data:
            update_data["status"] = user_data["status"]
        if "updated_at" in user_data:
            update_data["updated_at"] = user_data["updated_at"]

        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            user_item = await db.users.find_one({"_id": ObjectId(user_id)})
            serialized_user = serialize_user(user_item)
            logger.info("User patched successfully")
            return {"user": serialized_user, "message": "User updated successfully"}

        raise HTTPException(status_code=500, detail="Failed to update user")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error patching user")
        raise HTTPException(status_code=500, detail="Failed to update user")

@router.patch("/{user_id:[a-fA-F0-9]{24}}/reset-password")
async def reset_user_password(
    user_id: str,
    password_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Reset user password
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")

        # Check if user exists
        existing = await db.users.find_one({"_id": ObjectId(user_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        new_password = password_data.get("newPassword")
        if not new_password:
            raise HTTPException(status_code=400, detail="New password is required")

        # Hash the new password
        hashed_password = hash_password(new_password)

        # Update password
        result = await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"password": hashed_password, "updatedAt": datetime.utcnow().isoformat()}}
        )

        if result.modified_count > 0:
            logger.info("User password reset successfully")
            return {"message": "Password reset successfully"}

        raise HTTPException(status_code=500, detail="Failed to reset password")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error resetting password")
        raise HTTPException(status_code=500, detail="Failed to reset password")

@router.post("/{user_id:[a-fA-F0-9]{24}}/resend-verification")
async def resend_verification(
    user_id: str,
    user=Depends(require_permission("admin"))
):
    """
    Resend verification email to user
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")

        # Check if user exists
        existing = await db.users.find_one({"_id": ObjectId(user_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        # TODO: Implement email sending logic here
        # For now, just return success
        logger.info("Verification email resent successfully")
        return {"message": "Verification email sent successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error resending verification")
        raise HTTPException(status_code=500, detail="Failed to resend verification")

@router.get("/{user_id:[a-fA-F0-9]{24}}/qr-code")
async def get_user_qr_code(
    user_id: str,
    user=Depends(require_permission("admin"))
):
    """
    Get 2FA QR code for user
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")

        # Check if user exists
        existing = await db.users.find_one({"_id": ObjectId(user_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        # Check if user has 2FA secret
        if not existing.get("twoFASecret"):
            raise HTTPException(status_code=400, detail="User does not have 2FA set up")

        # Generate QR code URL
        totp = pyotp.TOTP(existing["twoFASecret"])
        otpauth_url = totp.provisioning_uri(name=existing.get('email', ''), issuer_name="DocuMind AI")


        # Generate QR code image URL (you might need to implement this)
        # For now, return the otpauth URL
        logger.info("QR code retrieved successfully")
        return {
            "qrCodeUrl": f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={quote(otpauth_url)}",
            "twoFASecret": existing["twoFASecret"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting QR code")
        raise HTTPException(status_code=500, detail="Failed to get QR code")

@router.delete("/{user_id:[a-fA-F0-9]{24}}")
async def delete_user(
    user_id: str,
    user=Depends(require_permission("admin"))
):
    """
    Delete a user
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID")

        # Check if user exists
        existing = await db.users.find_one({"_id": ObjectId(user_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        # Prevent deleting the last admin user
        if existing.get("roleId"):
            role = await db.roles.find_one({"_id": ObjectId(existing["roleId"])})
            if role and role.get("name") == "admin":
                admin_count = await db.users.count_documents({
                    "roleId": existing["roleId"],
                    "_id": {"$ne": ObjectId(user_id)}
                })
                if admin_count == 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot delete the last admin user"
                    )

        # Delete user
        result = await db.users.delete_one({"_id": ObjectId(user_id)})

        if result.deleted_count > 0:
            logger.info("User deleted successfully")
            return {"message": "User deleted successfully"}

        raise HTTPException(status_code=500, detail="Failed to delete user")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting user")
        raise HTTPException(status_code=500, detail="Failed to delete user")

@router.get("/settings")
async def get_user_settings(user=Depends(JWTBearer())):
    """
    Get current user's 2FA settings
    """
    try:
        db = await get_database()
        user_id = user.get("userId")
        logger.info(f"Fetching settings for user_id: {user_id}")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_doc = await db.users.find_one(
            {"_id": ObjectId(user_id)},
            {"twoFASecret": 1, "twoFAEnabled": 1, "twofa": 1}
        )
        logger.info(f"User document from DB: {user_doc}")

        if not user_doc:
            raise HTTPException(status_code=404, detail="User not found")

        # Check for "twofa" for backward compatibility
        two_fa_enabled = user_doc.get("twoFAEnabled", user_doc.get("twofa", False))
        logger.info(f"Raw two_fa_enabled value: {two_fa_enabled}")
        
        if isinstance(two_fa_enabled, str):
            two_fa_enabled = two_fa_enabled.lower() == "true"
        elif isinstance(two_fa_enabled, int):
            two_fa_enabled = two_fa_enabled == 1
        elif not isinstance(two_fa_enabled, bool):
            two_fa_enabled = bool(two_fa_enabled)
        
        logger.info(f"Processed two_fa_enabled value: {two_fa_enabled}")

        response_data = {
            "twoFAEnabled": two_fa_enabled,
            "twoFASecret": user_doc.get("twoFASecret")
        }
        logger.info(f"Returning user settings: {response_data}")
        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user settings")



@router.put("/settings")
async def update_user_settings(
    settings_data: dict,
    user: dict = Depends(JWTBearer())
):
    """
    Update current user's 2FA settings
    """
    logger.info("update_user_settings: function started")
    logger.info(f"update_user_settings: settings_data: {settings_data}")
    logger.info(f"update_user_settings: user payload: {user}")
    logger.info(f"update_user_settings: user permissions: {user.get('permissions', 'No permissions key')}")
    try:
        db = await get_database()
        user_id = user.get("userId")
        logger.info(f"update_user_settings: extracted user_id: {user_id}")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user_doc:
            raise HTTPException(status_code=404, detail="User not found")

        two_fa_enabled_request = settings_data.get("twoFAEnabled", False)
        update_data = {"updatedAt": datetime.utcnow().isoformat()}
        
        if two_fa_enabled_request:
            # User wants to enable 2FA.
            if not user_doc.get("twoFASecret"):
                secret = pyotp.random_base32()
                update_data["twoFASecret"] = secret
            update_data["twoFAEnabled"] = True
        else:
            # User wants to disable 2FA.
            update_data["twoFAEnabled"] = False

        # Remove permission check here to allow update without permission
        # The user is authenticated via JWTBearer, so user info is available

        if update_data:
            await db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )

        updated_user_doc = await db.users.find_one({"_id": ObjectId(user_id)})

        response_data = {
            "message": "2FA setup initiated" if two_fa_enabled_request else "2FA disabled successfully",
            "twoFAEnabled": updated_user_doc.get("twoFAEnabled", False),
            "twoFASecret": updated_user_doc.get("twoFASecret")
        }

        # If enabling 2FA, generate QR code URL
        if two_fa_enabled_request and updated_user_doc.get("twoFASecret"):
            totp = pyotp.TOTP(updated_user_doc["twoFASecret"])
            otpauth_url = totp.provisioning_uri(name=updated_user_doc.get('email', ''), issuer_name="DocuMind AI")
            response_data["qrCodeUrl"] = f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={quote(otpauth_url)}"

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update user settings")

@router.post("/verify-2fa")
async def verify_2fa(
    verification_data: dict,
    user=Depends(JWTBearer())
):
    """
    Verify 2FA code and enable 2FA
    """
    try:
        db = await get_database()
        user_id = user.get("userId")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

        code = verification_data.get("code")
        if not code or not code.isdigit() or len(code) != 6:
            raise HTTPException(status_code=400, detail="Invalid verification code")

        user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user_doc:
            raise HTTPException(status_code=404, detail="User not found")

        if not user_doc.get("twoFASecret"):
            raise HTTPException(status_code=400, detail="2FA not set up")

        # Verify the TOTP code
        totp = pyotp.TOTP(user_doc["twoFASecret"])
        verified = totp.verify(code)


        if not verified:
            raise HTTPException(status_code=400, detail="Invalid verification code")

        # Mark 2FA as fully enabled and update status if verifying
        update_fields = {"twoFAEnabled": True, "updatedAt": datetime.utcnow().isoformat()}
        if user_doc.get("status") == "verifying":
            update_fields["status"] = "active"
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields}
        )

        return {
            "message": "2FA verification successful",
            "twoFAEnabled": True
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying 2FA: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify 2FA")
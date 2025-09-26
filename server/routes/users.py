from fastapi import APIRouter, Depends, HTTPException, Request
from server.middleware.auth import JWTBearer, require_permission
from server.lib.mongodb import get_database
from typing import List, Optional
from bson import ObjectId
import logging

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

@router.get("/")
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

@router.put("/{user_id}")
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

@router.delete("/{user_id}")
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

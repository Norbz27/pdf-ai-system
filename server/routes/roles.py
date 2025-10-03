from fastapi import APIRouter, Depends, HTTPException, Request
from server.middleware.auth import JWTBearer, require_permission
from server.lib.mongodb import get_database
import logging
from datetime import datetime
import asyncio

router = APIRouter()

logger = logging.getLogger(__name__)

@router.get("/")
async def get_roles(request: Request):
    """
    Get all roles
    """
    try:
        logger.info("Roles endpoint accessed")
        logger.info(f"Request headers: {dict(request.headers)}")

        # Check if Authorization header exists
        auth_header = request.headers.get("Authorization")
        if auth_header:
            logger.info(f"Authorization header found: {auth_header[:20]}...")
        else:
            logger.warning("No Authorization header found")

        # Try to get user from JWT token
        try:
            credentials = await JWTBearer().__call__(request)
            user = credentials
            logger.info(f"User authenticated: {user.get('sub', 'unknown')}")
        except HTTPException as e:
            logger.warning(f"Authentication failed: {e.detail}")
            # For now, allow access without authentication for debugging
            user = {"sub": "anonymous", "permissions": ["user_page_access"]}

        db = await get_database()
        roles = await db.roles.find({}).sort("name", 1).to_list(None)

        # Convert ObjectId to string for JSON serialization
        for role in roles:
            role["_id"] = str(role["_id"])

        logger.info(f"Retrieved {len(roles)} roles")
        return {"roles": roles}

    except Exception as e:
        logger.error(f"Error fetching roles: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch roles: {str(e)}")

@router.post("/")
async def create_role(
    role_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Create a new role
    """
    try:
        db = await get_database()

        # Check if role with same name already exists
        existing = await db.roles.find_one({"name": role_data.get("name")})
        if existing:
            raise HTTPException(status_code=400, detail="Role with this name already exists")

        # Insert new role
        result = await db.roles.insert_one({
            "name": role_data.get("name"),
            "description": role_data.get("description", ""),
            "permissions": role_data.get("permissions", []),
            "created_at": role_data.get("created_at"),
            "updated_at": role_data.get("updated_at")
        })

        if result.inserted_id:
            role = await db.roles.find_one({"_id": result.inserted_id})
            role["_id"] = str(role["_id"])
            logger.info(f"Created new role: {role.get('name')}")
            return {"role": role, "message": "Role created successfully"}

        raise HTTPException(status_code=500, detail="Failed to create role")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating role: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create role: {str(e)}")

@router.put("/{role_id}")
async def update_role(
    role_id: str,
    role_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Update an existing role
    """
    try:
        db = await get_database()

        # Validate ObjectId
        from bson import ObjectId
        if not ObjectId.is_valid(role_id):
            raise HTTPException(status_code=400, detail="Invalid role ID")

        # Check if role exists
        existing = await db.roles.find_one({"_id": ObjectId(role_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Role not found")

        # Check if another role with same name exists
        name_conflict = await db.roles.find_one({
            "name": role_data.get("name"),
            "_id": {"$ne": ObjectId(role_id)}
        })
        if name_conflict:
            raise HTTPException(status_code=400, detail="Another role with this name already exists")

        # Update role
        update_data = {
            "name": role_data.get("name"),
            "description": role_data.get("description", ""),
            "permissions": role_data.get("permissions", []),
            "updated_at": role_data.get("updated_at")
        }

        result = await db.roles.update_one(
            {"_id": ObjectId(role_id)},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            role = await db.roles.find_one({"_id": ObjectId(role_id)})
            role["_id"] = str(role["_id"])
            logger.info(f"Updated role: {role.get('name')}")
            return {"role": role, "message": "Role updated successfully"}

        raise HTTPException(status_code=500, detail="Failed to update role")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating role: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update role: {str(e)}")

@router.delete("/{role_id}")
async def delete_role(
    role_id: str,
    user=Depends(require_permission("admin"))
):
    """
    Delete a role
    """
    try:
        db = await get_database()

        # Validate ObjectId
        from bson import ObjectId
        if not ObjectId.is_valid(role_id):
            raise HTTPException(status_code=400, detail="Invalid role ID")

        # Check if role exists
        existing = await db.roles.find_one({"_id": ObjectId(role_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Role not found")

        # Check if role is being used by any users
        users_count = await db.users.count_documents({"roleId": role_id})
        if users_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete role. It is being used by {users_count} user(s)"
            )

        # Delete role
        result = await db.roles.delete_one({"_id": ObjectId(role_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted role: {existing.get('name')}")
            return {"message": "Role deleted successfully"}

        raise HTTPException(status_code=500, detail="Failed to delete role")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting role: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete role: {str(e)}")

@router.post("/recalculate-user-count")
async def recalculate_user_count(user=Depends(require_permission("admin_access"))):
    """
    Recalculate user count for all roles
    """
    try:
        db = await get_database()

        # Get all roles
        roles = await db.roles.find({}).to_list(length=None)

        # Recalculate user count for each role
        update_promises = []
        for role in roles:
            user_count = await db.users.count_documents({"roleId": role["_id"]})
            update_promises.append(
                db.roles.update_one(
                    {"_id": role["_id"]},
                    {"$set": {"userCount": user_count, "updatedAt": datetime.utcnow().isoformat()}}
                )
            )

        # Wait for all updates to complete
        await asyncio.gather(*update_promises)

        # Get updated roles to return
        updated_roles = await db.roles.find({}).to_list(length=None)

        # Convert ObjectId to string
        for role in updated_roles:
            role["_id"] = str(role["_id"])

        logger.info("User counts recalculated successfully")
        return {
            "success": True,
            "message": "User counts recalculated successfully",
            "roles": updated_roles
        }

    except Exception as e:
        logger.error(f"Error recalculating user counts: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to recalculate user counts")

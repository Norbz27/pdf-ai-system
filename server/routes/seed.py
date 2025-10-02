from fastapi import APIRouter, Depends, HTTPException
from server.lib.mongodb import get_database
from .auth import get_password_hash
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/seed")
async def seed_database(db = Depends(get_database)):
    """
    Seed the database with initial data for development/testing
    This endpoint should only be available in development mode
    """
    try:
        # Check if data already exists
        if await db.users.count_documents({}) > 0:
            raise HTTPException(status_code=400, detail="Database already contains data")

        # Create default roles
        roles = [
            {"name": "Admin", "description": "Administrator with full access"},
            {"name": "Manager", "description": "Manager with limited admin access"},
            {"name": "User", "description": "Regular user"}
        ]
        await db.roles.insert_many(roles)
        admin_role = await db.roles.find_one({"name": "Admin"})
        manager_role = await db.roles.find_one({"name": "Manager"})
        user_role = await db.roles.find_one({"name": "User"})

        # Create default categories
        categories = [
            {"name": "Finance", "description": "Financial documents"},
            {"name": "HR", "description": "Human Resources documents"},
            {"name": "Legal", "description": "Legal documents"},
            {"name": "Technical", "description": "Technical documentation"},
            {"name": "Marketing", "description": "Marketing materials"},
        ]
        await db.categories.insert_many(categories)

        # Create default admin user
        admin_user = {
            "email": "admin@example.com",
            "username": "admin",
            "full_name": "System Administrator",
            "password": get_password_hash("admin123"),
            "roleId": admin_role["_id"],
            "is_active": True,
            "email_verified": True
        }
        await db.users.insert_one(admin_user)

        # Create test users
        test_users = [
            {
                "email": "manager@example.com",
                "username": "manager",
                "full_name": "Test Manager",
                "password": get_password_hash("manager123"),
                "roleId": manager_role["_id"],
                "is_active": True,
                "email_verified": True
            },
            {
                "email": "user@example.com",
                "username": "user",
                "full_name": "Test User",
                "password": get_password_hash("user123"),
                "roleId": user_role["_id"],
                "is_active": True,
                "email_verified": True
            }
        ]
        await db.users.insert_many(test_users)

        logger.info("Database seeded successfully")
        return {
            "message": "Database seeded successfully",
            "data": {
                "roles_created": 3,
                "categories_created": len(categories),
                "users_created": 3
            }
        }

    except Exception as e:
        logger.error(f"Error seeding database: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error seeding database: {str(e)}")

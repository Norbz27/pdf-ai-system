from fastapi import APIRouter, Depends, HTTPException, Request
from server.middleware.auth import JWTBearer, require_permission
from server.lib.mongodb import get_database
from typing import List, Optional
from bson import ObjectId
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

@router.get("")
async def get_categories(request: Request):
    """
    Get all categories with document count
    """
    try:
        logger.info("Categories endpoint accessed")

        db = await get_database()

        # Aggregate to get document count for each category
        pipeline = [
            {
                "$lookup": {
                    "from": "documents",
                    "localField": "_id",
                    "foreignField": "categoryId",
                    "as": "documents"
                }
            },
            {
                "$addFields": {
                    "documentCount": {"$size": "$documents"}
                }
            },
            {
                "$project": {
                    "documents": 0
                }
            },
            {"$sort": {"createdAt": -1}}
        ]

        categories = await db.categories.aggregate(pipeline).to_list(length=None)

        # Convert ObjectId to string for JSON serialization
        for category in categories:
            category["_id"] = str(category["_id"])

        logger.info(f"Retrieved {len(categories)} categories with document counts")
        return {"categories": categories}

    except Exception as e:
        logger.error(f"Error fetching categories: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")

@router.post("/")
async def create_category(
    category_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Create a new category
    """
    try:
        db = await get_database()

        # Check if category with same name already exists
        existing = await db.categories.find_one({"name": category_data.get("name")})
        if existing:
            raise HTTPException(status_code=400, detail="Category with this name already exists")

        # Insert new category
        result = await db.categories.insert_one({
            "name": category_data.get("name"),
            "description": category_data.get("description", ""),
            "color": category_data.get("color", "#3B82F6"),  # Default blue color
            "created_at": category_data.get("created_at"),
            "updated_at": category_data.get("updated_at")
        })

        if result.inserted_id:
            category = await db.categories.find_one({"_id": result.inserted_id})
            category["_id"] = str(category["_id"])
            logger.info(f"Created new category: {category.get('name')}")
            return {"category": category, "message": "Category created successfully"}

        raise HTTPException(status_code=500, detail="Failed to create category")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create category: {str(e)}")

@router.put("/{category_id}")
async def update_category(
    category_id: str,
    category_data: dict,
    user=Depends(require_permission("admin"))
):
    """
    Update an existing category
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(category_id):
            raise HTTPException(status_code=400, detail="Invalid category ID")

        # Check if category exists
        existing = await db.categories.find_one({"_id": ObjectId(category_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        # Check if another category with same name exists
        name_conflict = await db.categories.find_one({
            "name": category_data.get("name"),
            "_id": {"$ne": ObjectId(category_id)}
        })
        if name_conflict:
            raise HTTPException(status_code=400, detail="Another category with this name already exists")

        # Update category
        update_data = {
            "name": category_data.get("name"),
            "description": category_data.get("description", ""),
            "color": category_data.get("color", "#3B82F6"),
            "updated_at": category_data.get("updated_at")
        }

        result = await db.categories.update_one(
            {"_id": ObjectId(category_id)},
            {"$set": update_data}
        )

        if result.modified_count > 0:
            category = await db.categories.find_one({"_id": ObjectId(category_id)})
            category["_id"] = str(category["_id"])
            logger.info(f"Updated category: {category.get('name')}")
            return {"category": category, "message": "Category updated successfully"}

        raise HTTPException(status_code=500, detail="Failed to update category")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update category: {str(e)}")

@router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    user=Depends(require_permission("admin"))
):
    """
    Delete a category
    """
    try:
        db = await get_database()

        # Validate ObjectId
        if not ObjectId.is_valid(category_id):
            raise HTTPException(status_code=400, detail="Invalid category ID")

        # Check if category exists
        existing = await db.categories.find_one({"_id": ObjectId(category_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Category not found")

        # Check if category is being used by any documents
        documents_count = await db.documents.count_documents({"categoryId": category_id})
        if documents_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete category. It is being used by {documents_count} document(s)"
            )

        # Delete category
        result = await db.categories.delete_one({"_id": ObjectId(category_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted category: {existing.get('name')}")
            return {"message": "Category deleted successfully"}

        raise HTTPException(status_code=500, detail="Failed to delete category")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete category: {str(e)}")

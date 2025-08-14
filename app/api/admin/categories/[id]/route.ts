import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"

// PUT - Update category
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { name, description } = body
    const categoryId = params.id

    // Validate required fields
    if (!name || !description) {
      return NextResponse.json(
        { error: "Missing required fields: name, description" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if category with same name already exists (excluding current category)
    const existingCategory = await db.collection("categories").findOne({ 
      name, 
      _id: { $ne: new ObjectId(categoryId) }
    })
    if (existingCategory) {
      return NextResponse.json(
        { error: "Category with this name already exists" },
        { status: 409 }
      )
    }

    const updateData = {
      name,
      description,
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("categories").updateOne(
      { _id: new ObjectId(categoryId) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Category updated successfully"
    })
  } catch (error) {
    console.error("Error updating category:", error)
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    )
  }
}

// DELETE - Delete category
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const categoryId = params.id
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if any documents are using this category
    const documentsWithCategory = await db.collection("documents").countDocuments({ 
      categoryId: new ObjectId(categoryId) 
    })
    
    if (documentsWithCategory > 0) {
      return NextResponse.json({ 
        error: `Cannot delete category. ${documentsWithCategory} document(s) are currently using this category.` 
      }, { status: 400 })
    }

    const result = await db.collection("categories").deleteOne({ 
      _id: new ObjectId(categoryId) 
    })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Category deleted successfully"
    })
  } catch (error) {
    console.error("Error deleting category:", error)
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    )
  }
} 
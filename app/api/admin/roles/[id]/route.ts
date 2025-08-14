import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"

// PUT - Update role
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { name, description, permissions } = body
    const roleId = params.id

    // Validate required fields
    if (!name || !description || !permissions) {
      return NextResponse.json(
        { error: "Missing required fields: name, description, permissions" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if role with same name already exists (excluding current role)
    const existingRole = await db.collection("roles").findOne({ 
      name, 
      _id: { $ne: new ObjectId(roleId) }
    })
    if (existingRole) {
      return NextResponse.json(
        { error: "Role with this name already exists" },
        { status: 409 }
      )
    }

    const updateData = {
      name,
      description,
      permissions,
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("roles").updateOne(
      { _id: new ObjectId(roleId) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Role updated successfully"
    })
  } catch (error) {
    console.error("Error updating role:", error)
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    )
  }
}

// DELETE - Delete role
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const roleId = params.id
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if any users are using this role
    const usersWithRole = await db.collection("users").countDocuments({ 
      roleId: new ObjectId(roleId) 
    })
    
    if (usersWithRole > 0) {
      return NextResponse.json(
        { error: `Cannot delete role. ${usersWithRole} user(s) are currently using this role.` },
        { status: 400 }
      )
    }

    const result = await db.collection("roles").deleteOne({ 
      _id: new ObjectId(roleId) 
    })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Role deleted successfully"
    })
  } catch (error) {
    console.error("Error deleting role:", error)
    return NextResponse.json(
      { error: "Failed to delete role" },
      { status: 500 }
    )
  }
} 
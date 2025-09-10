import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { auditLogger } from "@/lib/audit-logger"

// PUT - Update user
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { name, email, role } = body
    const userId = params.id

    // Validate required fields
    if (!name || !email || !role) {
      return NextResponse.json(
        { error: "Missing required fields: name, email, role" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if user with same email already exists (excluding current user)
    const existingUser = await db.collection("users").findOne({ 
      email, 
      _id: { $ne: new ObjectId(userId) }
    })
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      )
    }

    // Get role ID from role name
    const roleDoc = await db.collection("roles").findOne({ name: role })
    if (!roleDoc) {
      return NextResponse.json(
        { error: "Invalid role specified" },
        { status: 400 }
      )
    }

    // Get current user to check if role is changing
    const currentUser = await db.collection("users").findOne({ 
      _id: new ObjectId(userId) 
    })
    if (!currentUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    const updateData = {
      name,
      email,
      roleId: roleDoc._id,
      role: role,
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Update user counts in roles if role changed
    if (currentUser.roleId.toString() !== roleDoc._id.toString()) {
      // Decrease count from old role
      await db.collection("roles").updateOne(
        { _id: currentUser.roleId },
        { $inc: { userCount: -1 } }
      )
      // Increase count in new role
      await db.collection("roles").updateOne(
        { _id: roleDoc._id },
        { $inc: { userCount: 1 } }
      )
    }

    return NextResponse.json({
      success: true,
      message: "User updated successfully"
    })
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    )
  }
}

// PATCH - Toggle user status (suspend/activate)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { status } = body
    const userId = params.id

    if (!status || !['active', 'suspended', 'inactive'].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'active', 'suspended', or 'inactive'" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          status,
          updatedAt: new Date().toISOString()
        } 
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `User ${status === 'active' ? 'activated' : 'suspended'} successfully`
    })
  } catch (error) {
    console.error("Error updating user status:", error)
    return NextResponse.json(
      { error: "Failed to update user status" },
      { status: 500 }
    )
  }
}

// DELETE - Delete user
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Get user to check their role before deletion
    const user = await db.collection("users").findOne({ 
      _id: new ObjectId(userId) 
    })
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    const result = await db.collection("users").deleteOne({ 
      _id: new ObjectId(userId) 
    })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Update user count in roles collection
    if (user.roleId) {
      await db.collection("roles").updateOne(
        { _id: user.roleId },
        { $inc: { userCount: -1 } }
      )
    }

    // Log user deletion
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    await auditLogger.userDeleted('Admin', 'admin@example.com', user.name, user.email, user.role, ipAddress)

    return NextResponse.json({
      success: true,
      message: "User deleted successfully"
    })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

// GET - Fetch all roles
export async function GET(req: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    const roles = await db.collection("roles").find({}).toArray()
    
    return NextResponse.json({ roles })
  } catch (error) {
    console.error("Error fetching roles:", error)
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    )
  }
}

// POST - Create new role
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description, permissions } = body

    // Validate required fields
    if (!name || !description || !permissions) {
      return NextResponse.json(
        { error: "Missing required fields: name, description, permissions" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if role with same name already exists
    const existingRole = await db.collection("roles").findOne({ name })
    if (existingRole) {
      return NextResponse.json(
        { error: "Role with this name already exists" },
        { status: 409 }
      )
    }

    const newRole = {
      name,
      description,
      permissions,
      userCount: 0, // Will be updated when users are assigned
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("roles").insertOne(newRole)

    return NextResponse.json({
      success: true,
      roleId: result.insertedId,
      role: { ...newRole, _id: result.insertedId }
    })
  } catch (error) {
    console.error("Error creating role:", error)
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 }
    )
  }
} 
import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

// GET - Fetch all users
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Build filter object
    const filter: any = {}
    
    if (role && role !== 'all') {
      filter.role = role
    }
    
    if (status && status !== 'all') {
      filter.status = status
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    // Aggregate to get user count per role and join with roles collection
    const users = await db.collection("users").aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "roles",
          localField: "roleId",
          foreignField: "_id",
          as: "roleInfo"
        }
      },
      {
        $addFields: {
          role: { $arrayElemAt: ["$roleInfo.name", 0] }
        }
      },
      {
        $project: {
          roleInfo: 0
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray()
    
    return NextResponse.json({ users })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    )
  }
}

// POST - Create new user
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, role, password } = body

    // Validate required fields
    if (!name || !email || !role || !password) {
      return NextResponse.json(
        { error: "Missing required fields: name, email, role, password" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if user with same email already exists
    const existingUser = await db.collection("users").findOne({ email })
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

    const newUser = {
      name,
      email,
      password, // Store password (in production, hash this with bcrypt)
      roleId: roleDoc._id,
      role: role,
      status: "active",
      avatar: "/placeholder-user.jpg",
      lastLogin: null,
      joinedDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Set default permissions based on role
      permissions: roleDoc.permissions || ["user_page_access"]
    }

    const result = await db.collection("users").insertOne(newUser)

    // Update user count in roles collection
    await db.collection("roles").updateOne(
      { _id: roleDoc._id },
      { $inc: { userCount: 1 } }
    )

    return NextResponse.json({
      success: true,
      userId: result.insertedId,
      user: { ...newUser, _id: result.insertedId }
    })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
} 
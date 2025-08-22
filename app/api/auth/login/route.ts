import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Find user by email
    const user = await db.collection("users").findOne({ email })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    // Check if user is active
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: "Account is suspended. Please contact administrator." },
        { status: 401 }
      )
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    // Get user's role information
    const role = await db.collection("roles").findOne({ _id: user.roleId })

    // Update last login
    await db.collection("users").updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLogin: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } 
      }
    )

    // Return user data without sensitive information
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: role?.name || 'User',
      roleId: user.roleId,
      status: user.status,
      permissions: role?.permissions || []
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    )

    return NextResponse.json({
      success: true,
      user: userData,
      token,
      message: "Login successful"
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    )
  }
}

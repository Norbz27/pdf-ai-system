import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import bcrypt from 'bcryptjs'
import { ObjectId } from "mongodb"
import jwt from 'jsonwebtoken'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, newPassword, currentPassword } = body

    if (!userId || !newPassword) {
      return NextResponse.json(
        { error: "User ID and new password are required" },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Find user by ID
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) })

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // If current password is provided, verify it
    if (currentPassword) {
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password)
      if (!isCurrentPasswordValid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        )
      }
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10)

    // Update user password and clear passwordResetRequired flag
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedNewPassword,
          passwordResetRequired: false,
          updatedAt: new Date().toISOString()
        }
      }
    )

    return NextResponse.json({
      success: true,
      message: "Password changed successfully"
    })

  } catch (error) {
    console.error("Error changing password:", error)
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    )
  }
}

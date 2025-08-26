import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import speakeasy from 'speakeasy'
import jwt from 'jsonwebtoken'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code } = body

    if (!code) {
      return NextResponse.json(
        { error: "2FA code is required" },
        { status: 400 }
      )
    }

    // Get the user ID from the JWT token
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const userId = decoded.userId

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Find user by ID
    const ObjectId = require('mongodb').ObjectId
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) })

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    if (!user.twoFASecret) {
      return NextResponse.json(
        { error: "2FA not configured for this user" },
        { status: 400 }
      )
    }

    // Verify the 2FA code
    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: 'base32',
      token: code,
      window: 2 // Allow 2 time steps (60 seconds) of leeway
    })

    if (!verified) {
      return NextResponse.json(
        { error: "Invalid 2FA code" },
        { status: 401 }
      )
    }

    // Update user status to active if it was verifying
    if (user.status === 'verifying') {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { status: 'active', updatedAt: new Date().toISOString() } }
      )
    }

    return NextResponse.json({
      success: true,
      message: "2FA verification successful"
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("2FA verification error:", errorMessage, errorStack)
    return NextResponse.json(
      { error: "2FA verification failed: " + errorMessage },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { auditLogger } from "@/lib/audit-logger"
import { headers } from 'next/headers'

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

    // Get IP address and user agent for audit logging
    const headersList = headers()
    const ipAddress = req.headers.get('x-forwarded-for') ||
                     req.headers.get('x-real-ip') ||
                     'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Find user by email
    const user = await db.collection("users").findOne({ email })

    if (!user) {
      // Log failed login attempt
      await auditLogger.loginFailed(
        'Unknown',
        email,
        ipAddress,
        userAgent
      )

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    // Check if user is suspended
    if (user.status === 'suspended') {
      // Log failed login attempt for suspended user
      await auditLogger.loginFailed(
        user.name,
        user.email,
        ipAddress,
        userAgent
      )

      return NextResponse.json(
        { error: "Account is suspended. Please contact administrator." },
        { status: 401 }
      )
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      // Log failed login attempt
      await auditLogger.loginFailed(
        user.name,
        user.email,
        ipAddress,
        userAgent
      )

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    // On first login, only update status to 'active' if no 2FA is required
    // If 2FA is configured, keep status as 'verifying' until 2FA is completed
    if (user.status === 'verifying' && !user.twoFASecret) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { status: 'active', updatedAt: new Date().toISOString() } }
      );
      user.status = 'active';
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

    // Log successful login
    await auditLogger.userLogin(
      user.name,
      user.email,
      ipAddress,
      userAgent
    )

    // Return user data without sensitive information
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: role?.name || 'User',
      roleId: user.roleId,
      status: user.status,
      permissions: role?.permissions || [],
      twoFASecret: user.twoFASecret, // Include 2FA secret for frontend verification
      passwordResetRequired: user.passwordResetRequired || false // Include password reset flag
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

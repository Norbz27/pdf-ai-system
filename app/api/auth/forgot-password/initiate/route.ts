import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { logAuditEvent } from "@/lib/audit-logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body as { email?: string };

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    const user = await db.collection("users").findOne({ email: email.trim() });

    if (!user) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    const twoFAEnabled = Boolean(user.twoFASecret && (user.twoFAEnabled ?? true));

    // Generate a short-lived token for 2FA verification if needed
    let token: string | null = null;
    if (twoFAEnabled) {
      if (!process.env.JWT_SECRET) {
        return NextResponse.json(
          { error: "Server configuration error: missing JWT secret" },
          { status: 500 }
        );
      }
      token = jwt.sign(
        { userId: String(user._id), purpose: "password_reset" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );
    }

    // Get IP address and user agent for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Log audit event for forgot password initiation
    await logAuditEvent({
      user: user.name || "Unknown",
      userEmail: user.email,
      action: 'FORGOT_PASSWORD_REQUEST',
      resource: 'Password Reset',
      details: twoFAEnabled ? '2FA required for password reset' : 'No 2FA configured; proceeding to direct password change',
      ipAddress,
      userAgent,
      severity: 'info',
      category: 'authentication'
    });

    return NextResponse.json({
      success: true,
      twoFAEnabled,
      token,
      user: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
      }
    });
  } catch (error) {
    console.error("Forgot password initiation error:", error);
    return NextResponse.json(
      { error: "Failed to initiate password reset" },
      { status: 500 }
    );
  }
}

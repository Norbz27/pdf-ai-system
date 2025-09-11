import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { logAuditEvent } from "@/lib/audit-logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, code } = body as { token?: string; code?: string };

    if (!token || !code) {
      return NextResponse.json(
        { error: "Token and 2FA code are required" },
        { status: 400 }
      );
    }

    if (!process.env.JWT_SECRET) {
      return NextResponse.json(
        { error: "Server configuration error: missing JWT secret" },
        { status: 500 }
      );
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    if (decoded.purpose !== 'password_reset' || !decoded.userId) {
      return NextResponse.json(
        { error: "Invalid token purpose" },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.userId) });
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (!user.twoFASecret) {
      return NextResponse.json(
        { error: "2FA not configured for this user" },
        { status: 400 }
      );
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      // Audit log failed attempt
      const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';
      await logAuditEvent({
        user: user.name || 'Unknown',
        userEmail: user.email,
        action: 'FORGOT_PASSWORD_2FA_FAILED',
        resource: 'Password Reset',
        details: 'Incorrect 2FA code during password reset',
        ipAddress,
        userAgent,
        severity: 'warning',
        category: 'security'
      });

      return NextResponse.json(
        { error: "Invalid 2FA code" },
        { status: 401 }
      );
    }

    // Issue a short-lived auth token to allow password change
    const authToken = jwt.sign(
      { userId: String(user._id) },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Audit log success
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    await logAuditEvent({
      user: user.name || 'Unknown',
      userEmail: user.email,
      action: 'FORGOT_PASSWORD_2FA_VERIFIED',
      resource: 'Password Reset',
      details: '2FA verified for password reset',
      ipAddress,
      userAgent,
      severity: 'info',
      category: 'authentication'
    });

    return NextResponse.json({ success: true, token: authToken, user: { _id: String(user._id), email: user.email, name: user.name } });
  } catch (error) {
    console.error("Forgot password 2FA verification error:", error);
    return NextResponse.json(
      { error: "Failed to verify 2FA for password reset" },
      { status: 500 }
    );
  }
}

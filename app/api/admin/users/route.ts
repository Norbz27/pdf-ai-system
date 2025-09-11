import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import speakeasy from 'speakeasy'
import qrcode from 'qrcode'
import { auditLogger } from "@/lib/audit-logger"
import { ObjectId } from 'mongodb'
import { mkdirSync } from 'fs'

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
          roleInfo: 0,
          password: 0,
          twoFASecret: 0
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

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function sendAccountEmail(email: string, password: string, qrImagePath: string, secret: string) {
  try {
    // Require environment variables for SMTP; do not use insecure defaults
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
      throw new Error('SMTP configuration is missing. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM environment variables.');
    }

    // Log non-sensitive SMTP configuration only
    console.log('SMTP Configuration:', {
      host: smtpHost,
      port: smtpPort,
      from: smtpFrom
    });

    console.log('Sending account email to:', email);
    console.log('QR code path:', qrImagePath);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    // Verify SMTP connection
    await transporter.verify();

    const mailOptions = {
      from: smtpFrom,
      to: email,
      subject: 'Your DocuMind AI Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Your DocuMind AI Account</h2>
          <p>Your account has been created successfully.</p>
          <p><strong>Password:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
          
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <h3 style="color: #059669; margin-top: 0;">Two-Factor Authentication Setup</h3>
            <ol>
              <li>Install an authenticator app like Google Authenticator, Microsoft Authenticator, or Authy on your mobile device</li>
              <li>Scan the QR code below with your authenticator app:</li>
            </ol>
            
            <div style="text-align: center; margin: 20px 0;">
              <img src="cid:qrcode" alt="2FA QR Code" style="width: 200px; height: 200px; border: 1px solid #e5e7eb;" />
            </div>
            
            <p><strong>Manual Setup:</strong> If you cannot scan the QR code, enter this setup key manually:</p>
            <p style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-family: monospace; word-break: break-all;">
              ${secret}
            </p>
          </div>
          
          <p><strong>Important:</strong> The app will generate a 6-digit code that changes every 30 seconds. Use this code when logging in to verify your identity.</p>
          <p><strong>Security Note:</strong> Please save your password securely and complete the 2FA setup immediately. You will not be able to access your account until 2FA is configured.</p>
          
          <div style="background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 20px;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              <strong>⚠️ For security reasons:</strong> This email will only be sent once. Please save these instructions if needed.
            </p>
          </div>
        </div>
      `,
      text: `Your DocuMind AI Account

Your account has been created successfully.

Password: ${password}

Two-Factor Authentication Setup:
1. Install an authenticator app like Google Authenticator, Microsoft Authenticator, or Authy on your mobile device
2. Scan the QR code (attached in HTML version) or use the manual setup key

Manual Setup Key: ${secret}

The app will generate a 6-digit code that changes every 30 seconds. Use this code when logging in.

Important: Please save your password securely and complete the 2FA setup immediately. You will not be able to access your account until 2FA is configured.

For security reasons, this email will only be sent once. Please save these instructions if needed.`,
      attachments: [
        {
          filename: 'qrcode.png',
          path: qrImagePath,
          cid: 'qrcode' // same cid value as in the html img src
        }
      ]
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', email, 'Message ID:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending account email:', error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

 // POST - Create new user
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, role } = body

    // Generate random password
    const password = generateRandomPassword()

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

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10)

    // Generate 2FA secret (store base32)
    const twoFASecret = speakeasy.generateSecret({ name: `DocuMind AI (${email})` });

    const newUser = {
      name,
      email,
      password: hashedPassword, // Store hashed password
      roleId: roleDoc._id,
      role: role,
      status: "verifying",
      avatar: "/placeholder-user.jpg",
      lastLogin: null,
      joinedDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Set default permissions based on role
      permissions: roleDoc.permissions || ["user_page_access"],
      twoFASecret: twoFASecret.base32, // Store 2FA secret (base32)
      passwordResetRequired: true // Require password reset on first login
    }

    const result = await db.collection("users").insertOne(newUser)

    // Update user count in roles collection
    await db.collection("roles").updateOne(
      { _id: roleDoc._id },
      { $inc: { userCount: 1 } }
    )

    // Log user creation
    const forwardedFor = req.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown')
    await auditLogger.userCreated('Admin', 'admin@example.com', name, email, role, ipAddress)

    // Try to generate QR code and send email, but don't fail user creation if it fails
    let emailError = null
    try {
      // Ensure uploads directory exists
      mkdirSync('public/uploads', { recursive: true })
      // Build otpauth URL from stored base32 secret
      const qrUrl = speakeasy.otpauthURL({
        secret: twoFASecret.base32,
        label: `DocuMind AI (${email})`,
        issuer: 'DocuMind AI',
        encoding: 'base32'
      })
      if (!qrUrl) {
        throw new Error("Failed to generate QR code URL")
      }
      const qrImagePath = `public/uploads/${email}-qr.png`
      await qrcode.toFile(qrImagePath, qrUrl)
      await sendAccountEmail(email, password, qrImagePath, twoFASecret.base32)
    } catch (err) {
      console.error("Error preparing or sending account email:", err)
      emailError = err instanceof Error ? err.message : String(err)
    }

    const safeUser = {
      _id: result.insertedId,
      name: newUser.name,
      email: newUser.email,
      roleId: newUser.roleId,
      role: newUser.role,
      status: newUser.status,
      avatar: newUser.avatar,
      lastLogin: newUser.lastLogin,
      joinedDate: newUser.joinedDate,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
      permissions: newUser.permissions,
      passwordResetRequired: newUser.passwordResetRequired
    }

    return NextResponse.json({
      success: true,
      userId: result.insertedId,
      user: safeUser,
      emailError
    })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
}

// PATCH - Admin actions: reset password, resend verification, view qr code
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, action } = body;
    if (!userId || !action) {
      return NextResponse.json({ error: "Missing userId or action" }, { status: 400 });
    }
    const client = await clientPromise;
    const db = client.db("DocuMind_AI");
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (action === "reset_password") {
      const { newPassword } = body;
      if (!newPassword) {
        return NextResponse.json({ error: "New password is required" }, { status: 400 });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.collection("users").updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

      // Log user update
      const forwardedFor = req.headers.get('x-forwarded-for')
      const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown')
      await auditLogger.userUpdated('Admin', 'admin@example.com', user.name, user.email, 'Password reset', ipAddress)

      // Removed email sending on password reset as per user request
      return NextResponse.json({ success: true, message: "Password reset successfully." });
    } else if (action === "resend_verification") {
      // Reuse last password (cannot send plain password, so generate a new one if needed)
      const password = "********"; // Hide password for security
      const qrUrl = speakeasy.otpauthURL({
        secret: user.twoFASecret,
        label: `DocuMind AI (${user.email})`,
        issuer: 'DocuMind AI',
        encoding: 'base32'
      });
      if (!qrUrl) {
        throw new Error("Failed to generate QR code URL");
      }
      // Ensure uploads directory exists and generate QR code as a local image file
      mkdirSync('public/uploads', { recursive: true });
      const qrImagePath = `public/uploads/${user.email}-qr.png`;
      await qrcode.toFile(qrImagePath, qrUrl);
      await sendAccountEmail(user.email, password, qrImagePath, user.twoFASecret);

      // Log user update
      const forwardedFor = req.headers.get('x-forwarded-for')
      const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown')
      await auditLogger.userUpdated('Admin', 'admin@example.com', user.name, user.email, 'Verification email resent', ipAddress)

      return NextResponse.json({ success: true, message: "Verification email resent." });
    } else if (action === "view_qr_code") {
      // Generate QR code for existing user
      if (!user.twoFASecret) {
        return NextResponse.json({ error: "User does not have a 2FA secret" }, { status: 400 });
      }
      const qrUrl = await qrcode.toDataURL(speakeasy.otpauthURL({
        secret: user.twoFASecret,
        label: `DocuMind AI (${user.email})`,
        issuer: 'DocuMind AI',
        encoding: 'base32'
      }));

      // Log user update
      const forwardedFor = req.headers.get('x-forwarded-for')
      const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown')
      await auditLogger.userUpdated('Admin', 'admin@example.com', user.name, user.email, 'QR code viewed', ipAddress)

      return NextResponse.json({
        success: true,
        qrCodeUrl: qrUrl,
        email: user.email
      });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in PATCH /admin/users:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}

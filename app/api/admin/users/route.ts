import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import bcrypt from 'bcryptjs'
import nodemailer from 'nodemailer'
import speakeasy from 'speakeasy'
import qrcode from 'qrcode'

declare module 'nodemailer';
declare module 'speakeasy';
declare module 'qrcode';

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

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function sendAccountEmail(email: string, password: string, qrUrl: string) {
  // Debugger for email sending
  console.log('---EMAIL DEBUG---')
  console.log('SMTP host:', 'oxytecsi.com')
  console.log('SMTP port:', 465)
  console.log('SMTP user:', 'norbertojr@oxytecsi.com')
  console.log('SMTP pass:', 'fOBd;&k+ueq*')
  console.log('From:', 'norbertojr@oxytecsi.com')
  console.log('To:', email)
  console.log('Subject:', 'Your DocuMind AI Account')
  console.log('Password:', password)
  console.log('QR URL:', qrUrl)
  // Configure your SMTP transport here
  const transporter = nodemailer.createTransport({
    host: 'oxytecsi.com', // Use your domain's SMTP server
    port: 465, // SSL port
    secure: true, // Use SSL
    auth: {
      user: 'norbertojr@oxytecsi.com',
      pass: 'fOBd;&k+ueq*'
    }
  });
  await transporter.sendMail({
    from: 'norbertojr@oxytecsi.com',
    to: email,
    subject: 'Your DocuMind AI Account',
    html: `<p>Your account has been created.</p>
           <p>Password: <b>${password}</b></p>
           <p>Scan this QR code with your Authenticator App for 2FA:</p>
           <img src="${qrUrl}" alt="2FA QR Code" />`
  });
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

    // Generate 2FA secret
    const twoFASecret = speakeasy.generateSecret({ name: `DocuMind AI (${email})` })
    const qrUrl = twoFASecret.otpauth_url
      ? await qrcode.toDataURL(twoFASecret.otpauth_url)
      : ""

    const newUser = {
      name,
      email,
      password: hashedPassword, // Store hashed password
      roleId: roleDoc._id,
      role: role,
      status: "active",
      avatar: "/placeholder-user.jpg",
      lastLogin: null,
      joinedDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Set default permissions based on role
      permissions: roleDoc.permissions || ["user_page_access"],
      twoFASecret: twoFASecret.base32 // Store 2FA secret
    }

    const result = await db.collection("users").insertOne(newUser)

    // Update user count in roles collection
    await db.collection("roles").updateOne(
      { _id: roleDoc._id },
      { $inc: { userCount: 1 } }
    )

    // Try to send email, but don't fail user creation if it fails
    let emailError = null
    try {
      await sendAccountEmail(email, password, qrUrl)
    } catch (err) {
      console.error("Error sending account email:", err)
      emailError = err instanceof Error ? err.message : String(err)
    }

    return NextResponse.json({
      success: true,
      userId: result.insertedId,
      user: { ...newUser, _id: result.insertedId },
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
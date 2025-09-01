import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'
import speakeasy from 'speakeasy'
import qrcode from 'qrcode'

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Get the current user from token
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify token
    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await db.collection('users').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { twoFASecret: 1, twoFAEnabled: 1 } }
    )

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      twoFAEnabled: user.twoFAEnabled || false,
      twoFASecret: user.twoFASecret || null
    })

  } catch (error) {
    console.error('Error getting user settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Get the current user from token
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify token
    let decoded: any
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { twoFAEnabled } = body

    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let updateData: any = {
      updatedAt: new Date().toISOString()
    }

    let qrCodeUrl = null

    if (twoFAEnabled) {
      // Enable 2FA - generate secret if not exists
      if (!user.twoFASecret) {
        const secret = speakeasy.generateSecret({
          name: `DocuMind AI (${user.email})`,
          issuer: 'DocuMind AI'
        })

        updateData.twoFASecret = secret.base32
        updateData.twoFAEnabled = false // Don't enable yet, wait for verification

        // Generate QR code
        qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!)
      } else {
        // Secret already exists, just set to false until verified
        updateData.twoFAEnabled = false
        // Generate QR code from existing secret for re-enabling
        const otpauthUrl = speakeasy.otpauthURL({
          secret: user.twoFASecret,
          label: `DocuMind AI (${user.email})`,
          issuer: 'DocuMind AI',
          encoding: 'base32'
        })
        qrCodeUrl = await qrcode.toDataURL(otpauthUrl)
      }
    } else {
      // Disable 2FA - keep secret for potential re-enabling
      updateData.twoFAEnabled = false // Explicitly set to false
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(decoded.userId) },
      { $set: updateData }
    )

    return NextResponse.json({
      message: twoFAEnabled ? '2FA setup initiated' : '2FA disabled successfully',
      qrCodeUrl,
      twoFAEnabled: false // Will be true after verification
    })

  } catch (error) {
    console.error('Error updating user settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

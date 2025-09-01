import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import jwt from 'jsonwebtoken'
import speakeasy from 'speakeasy'

export async function POST(request: NextRequest) {
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
    const { code } = body

    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.twoFASecret) {
      return NextResponse.json({ error: '2FA not set up' }, { status: 400 })
    }

    // Verify the TOTP code
    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      encoding: 'base32',
      token: code,
      window: 2 // Allow 2 time windows (30 seconds each) for clock skew
    })

    if (!verified) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
    }

    // Mark 2FA as fully enabled
    await db.collection('users').updateOne(
      { _id: new ObjectId(decoded.userId) },
      {
        $set: {
          twoFAEnabled: true,
          updatedAt: new Date().toISOString()
        }
      }
    )

    return NextResponse.json({
      message: '2FA verification successful',
      twoFAEnabled: true
    })

  } catch (error) {
    console.error('Error verifying 2FA:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

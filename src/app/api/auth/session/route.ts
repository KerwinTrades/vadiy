import { NextRequest, NextResponse } from 'next/server';
import { SecurityManager, AuditLogger } from '@/lib/security';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { userAgent, timestamp, embedded = false } = body;

    // Generate a unique session ID
    const sessionId = SecurityManager.generateToken(32);
    
    // Create anonymous user ID for tracking
    const anonymousUserId = SecurityManager.generateToken(16);
    
    // Create session token with basic info
    const sessionData = {
      sessionId,
      userId: anonymousUserId,
      userAgent: userAgent || 'unknown',
      timestamp: timestamp || new Date().toISOString(),
      embedded,
      isAnonymous: true,
      securityLevel: 'standard'
    };

    // Generate JWT token
    const sessionToken = await SecurityManager.createJWT(sessionData, '1h');

    // Log session creation
    await AuditLogger.logSecurityEvent(
      anonymousUserId,
      'session_created',
      'auth/session',
      { 
        sessionId, 
        embedded,
        userAgent: userAgent || 'unknown'
      },
      'low',
      request
    );

    return NextResponse.json({
      success: true,
      sessionToken,
      sessionId,
      userId: anonymousUserId,
      expiresIn: 3600, // 1 hour
      metadata: {
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Session creation error:', error);

    await AuditLogger.logSecurityEvent(
      'unknown',
      'session_creation_failed',
      'auth/session',
      { 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      'medium',
      request
    );

    return NextResponse.json({
      success: false,
      error: {
        code: 'SESSION_CREATION_FAILED',
        message: 'Failed to create session',
        timestamp: new Date()
      },
      metadata: {
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 
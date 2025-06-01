import { NextRequest, NextResponse } from 'next/server';
import { AirtableService } from '@/lib/airtable';
import { SecurityManager, RateLimiter, AuditLogger, InputValidator } from '@/lib/security';
import type { ApiResponse, User } from '@/types';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId = 'unknown';

  try {
    // Parse request body
    const body = await request.json();
    const { email, softrToken, userAgent } = body;

    // Input validation
    if (!email || !InputValidator.isValidEmail(email)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Valid email address is required',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 400 });
    }

    // Sanitize inputs
    const sanitizedEmail = InputValidator.sanitizeInput(email);
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Rate limiting
    const rateLimit = RateLimiter.checkRateLimit(
      `auth:${clientIP}`,
      10, // 10 attempts per hour for auth
      3600000 // 1 hour
    );

    if (!rateLimit.allowed) {
      await AuditLogger.logSecurityEvent(
        'unknown',
        'rate_limit_exceeded',
        'auth/verify-user',
        { email: sanitizedEmail, ip: clientIP },
        'medium',
        request
      );

      return NextResponse.json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts. Please try again later.',
          timestamp: new Date()
        },
        metadata: {
          requestId: SecurityManager.generateToken(16),
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          rateLimit: {
            limit: 10,
            remaining: 0,
            resetTime: new Date(rateLimit.resetTime)
          }
        }
      } as ApiResponse, { status: 429 });
    }

    // Verify Softr token if provided
    if (softrToken) {
      try {
        // In a real implementation, you would verify the Softr token
        // For now, we'll assume it's valid if provided
        const tokenPayload = await SecurityManager.verifyJWT(softrToken);
        if (!tokenPayload) {
          throw new Error('Invalid Softr token');
        }
      } catch (error) {
        await AuditLogger.logSecurityEvent(
          'unknown',
          'invalid_token',
          'auth/verify-user',
          { email: sanitizedEmail, error: 'Invalid Softr token' },
          'high',
          request
        );

        return NextResponse.json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid authentication token',
            timestamp: new Date()
          }
        } as ApiResponse, { status: 401 });
      }
    }

    // Get user from Airtable
    const user = await AirtableService.getUserByEmail(sanitizedEmail);
    
    if (!user) {
      await AuditLogger.logSecurityEvent(
        'unknown',
        'user_not_found',
        'auth/verify-user',
        { email: sanitizedEmail },
        'low',
        request
      );

      return NextResponse.json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found. Please ensure you have an account.',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 404 });
    }

    userId = user.id;

    // Check if user account is active
    if (user.securityLevel === 'enhanced' && !softrToken) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'ENHANCED_SECURITY_REQUIRED',
          message: 'Enhanced security verification required',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 403 });
    }

    // Create session
    const sessionId = SecurityManager.generateToken(32);
    const sessionData = {
      userId: user.id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
      securityLevel: user.securityLevel,
      lastActivity: Date.now()
    };

    // Generate JWT for session
    const sessionToken = await SecurityManager.createJWT({
      sessionId,
      userId: user.id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus
    }, '30m'); // 30 minute session

    // Update user's last login
    await AirtableService.updateUserPreferences(
      user.id,
      { ...user.preferences },
      user.id
    );

    // Log successful authentication
    await AuditLogger.logSecurityEvent(
      user.id,
      'user_authenticated',
      'auth/verify-user',
      { 
        email: sanitizedEmail,
        subscriptionStatus: user.subscriptionStatus,
        securityLevel: user.securityLevel
      },
      'low',
      request
    );

    // Check rate limits for this user
    const userRateLimit = await AirtableService.checkUserRateLimit(user.id);

    // Prepare response data (exclude sensitive information)
    const responseUser: Partial<User> = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      subscriptionStatus: user.subscriptionStatus,
      preferences: user.preferences,
      securityLevel: user.securityLevel
    };

    return NextResponse.json({
      success: true,
      data: {
        user: responseUser,
        session: {
          token: sessionToken,
          sessionId,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        },
        rateLimit: userRateLimit
      },
      metadata: {
        requestId: SecurityManager.generateToken(16),
        timestamp: new Date(),
        processingTime: Date.now() - startTime,
        rateLimit: {
          limit: 10,
          remaining: rateLimit.remaining,
          resetTime: new Date(rateLimit.resetTime)
        }
      }
    } as ApiResponse, { status: 200 });

  } catch (error) {
    console.error('Authentication error:', error);

    // Log error
    await AuditLogger.logSecurityEvent(
      userId,
      'authentication_error',
      'auth/verify-user',
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'high',
      request
    );

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred during authentication',
        timestamp: new Date()
      },
      metadata: {
        requestId: SecurityManager.generateToken(16),
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    } as ApiResponse, { status: 500 });
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

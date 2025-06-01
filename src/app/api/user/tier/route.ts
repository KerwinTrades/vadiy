import { NextRequest, NextResponse } from 'next/server';
import { SecurityManager } from '@/lib/security';
import { AirtableService } from '@/lib/airtable';
import { SubscriptionService } from '@/lib/subscription-tiers';

export async function GET(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' }
      }, { status: 401 });
    }

    const sessionToken = authHeader.replace('Bearer ', '');

    // Verify session token
    let sessionData;
    try {
      sessionData = await SecurityManager.verifyJWT(sessionToken);
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Invalid or expired session' }
      }, { status: 401 });
    }

    const userId = sessionData.userId;
    console.log('🔍 Getting tier info for user:', userId);

    // Get user profile from Airtable
    const userProfile = await AirtableService.getUserProfile(userId);
    console.log('👤 User profile:', {
      name: userProfile?.firstName,
      subscription: userProfile?.subscriptionStatus
    });

    // Determine service tier
    const serviceTier = SubscriptionService.determineUserTier(
      userProfile?.subscriptionStatus || 'Free'
    );

    console.log('🎯 Determined tier:', serviceTier.tier);

    return NextResponse.json({
      success: true,
      data: {
        tier: serviceTier.tier,
        serviceTier: serviceTier,
        userProfile: {
          firstName: userProfile?.firstName || null,
          subscriptionStatus: userProfile?.subscriptionStatus || 'Free'
        },
        features: serviceTier.features,
        limits: serviceTier.limits
      }
    });

  } catch (error) {
    console.error('❌ Error getting user tier:', error);
    
    // Return default free tier on error
    const defaultTier = SubscriptionService.determineUserTier('Free');
    
    return NextResponse.json({
      success: true,
      data: {
        tier: defaultTier.tier,
        serviceTier: defaultTier,
        userProfile: {
          firstName: null,
          subscriptionStatus: 'Free'
        },
        features: defaultTier.features,
        limits: defaultTier.limits,
        error: 'Could not fetch user data, using default tier'
      }
    });
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 
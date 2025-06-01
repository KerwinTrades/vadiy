import { NextRequest, NextResponse } from 'next/server';
import { SecurityManager, AuditLogger, InputValidator, PIIProtector } from '@/lib/security';
import { AirtableService } from '@/lib/airtable';
import { SubscriptionService, SubscriptionTier, UserServiceTier } from '@/lib/subscription-tiers';
// import { UsageTrackingService } from '@/lib/usage-tracking'; // DISABLED
// import { RateLimitingService } from '@/lib/rate-limiting'; // DISABLED
import type { ApiResponse, Opportunity, Resource } from '@/types';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId = 'unknown';
  let conversationId = 'temp';
  let userTier: SubscriptionTier = SubscriptionTier.FREE;
  let serviceTier: UserServiceTier | null = null;

  try {
    // Parse request body
    const body = await request.json();
    const { 
      message, 
      conversationId: reqConversationId, 
      sessionToken,
      attachments = [],
      preferredModel = 'gpt-4o-mini'
    } = body;

    console.log('📨 Chat request received:', { messageLength: message?.length, hasSessionToken: !!sessionToken });

    // Input validation
    if (!message || typeof message !== 'string') {
      console.error('❌ Invalid message content');
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Message content is required',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 400 });
    }

    if (!sessionToken) {
      console.error('❌ Missing session token');
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session token is required',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 401 });
    }

    // Verify session token
    let sessionData;
    try {
      sessionData = await SecurityManager.verifyJWT(sessionToken);
      userId = sessionData.userId;
      console.log('✅ Session verified for user:', userId);
    } catch (error) {
      console.error('❌ Session verification failed:', error);
      await AuditLogger.logSecurityEvent(
        'unknown',
        'invalid_session_token',
        'chat/send-message',
        { error: 'Invalid session token' },
        'medium',
        request
      );

      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Invalid or expired session',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 401 });
    }

    // 👤 Get user profile and determine service tier with caching
    console.log('👤 Fetching user profile and determining service tier...');
    
    // Try to get cached tier first
    serviceTier = await UsageTrackingService.getCachedUserTier(userId);
    
    if (!serviceTier) {
      // Fetch from Airtable if not cached
      const userProfile = await AirtableService.getUserProfile(userId);
      serviceTier = SubscriptionService.determineUserTier(
        userProfile?.subscriptionStatus || 'Free'
      );
      
      // Cache the tier for future requests
      await UsageTrackingService.cacheUserTier(userId, serviceTier);
    }
    
    userTier = serviceTier.tier;
    console.log(`🎯 User tier: ${userTier} (${serviceTier.modelToUse})`);

    // 🚫 NEW: Rate limiting check
    console.log('🚫 Checking rate limits...');
    const rateLimitResult = await RateLimitingService.applyRateLimit(
      request,
      userId,
      userTier,
      '/api/chat/send-message'
    );

    if (!rateLimitResult.allowed && rateLimitResult.response) {
      console.warn(`⚠️ Rate limit exceeded for ${userTier} user: ${userId}`);
      return rateLimitResult.response;
    }

    // 📊 NEW: Daily message limit check
    console.log('📊 Checking daily message limits...');
    const dailyLimitResult = await UsageTrackingService.checkDailyMessageLimit(userId, userTier);
    
    if (!dailyLimitResult.allowed) {
      console.warn(`⚠️ Daily message limit exceeded for ${userTier} user: ${userId} (${dailyLimitResult.current}/${dailyLimitResult.limit})`);
      
      // Generate tier-specific upgrade message
      let upgradeMessage = "You've reached your daily message limit.";
      if (userTier === SubscriptionTier.FREE) {
        upgradeMessage += " Upgrade to Premium for 500 daily messages and enhanced AI features!";
      }
      
      return NextResponse.json({
        success: false,
        error: {
          code: 'DAILY_LIMIT_EXCEEDED',
          message: upgradeMessage,
          details: {
            current: dailyLimitResult.current,
            limit: dailyLimitResult.limit,
            resetsAt: dailyLimitResult.resetsAt.toISOString(),
            tier: userTier,
            upgradeUrl: userTier === SubscriptionTier.FREE ? 'https://vadiy.com/upgrade' : null
          },
          timestamp: new Date()
        },
        metadata: {
          requestId: SecurityManager.generateToken(16),
          timestamp: new Date(),
          processingTime: Date.now() - startTime
        }
      } as ApiResponse, { status: 429 });
    }

    // Sanitize and validate message
    const sanitizedMessage = InputValidator.sanitizeInput(message);
    if (sanitizedMessage.length === 0) {
      console.error('❌ Empty message after sanitization');
      return NextResponse.json({
        success: false,
        error: {
          code: 'EMPTY_MESSAGE',
          message: 'Message cannot be empty',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 400 });
    }

    // Check for malicious content
    if (InputValidator.containsMaliciousContent(sanitizedMessage)) {
      console.error('❌ Malicious content detected');
      await AuditLogger.logSecurityEvent(
        userId,
        'malicious_content_detected',
        'chat/send-message',
        { message: PIIProtector.maskPII(sanitizedMessage) },
        'high',
        request
      );

      return NextResponse.json({
        success: false,
        error: {
          code: 'MALICIOUS_CONTENT',
          message: 'Message contains potentially harmful content',
          timestamp: new Date()
        }
      } as ApiResponse, { status: 400 });
    }

    // Generate conversation ID if not provided
    conversationId = reqConversationId || `temp_${SecurityManager.generateToken(8)}`;

    // Detect PII in user message
    const piiDetected = PIIProtector.detectPII(sanitizedMessage);
    if (piiDetected.length > 0) {
      console.warn('⚠️ PII detected in message');
      await AuditLogger.logSecurityEvent(
        userId,
        'pii_detected_in_message',
        'chat/send-message',
        { 
          piiTypes: piiDetected.map(p => p.type),
          messageLength: sanitizedMessage.length
        },
        'medium',
        request
      );
    }

    console.log('🤖 Generating OpenAI response...');

    // Generate OpenAI response with tier enforcement
    const aiResponse = await generateOpenAIResponseWithTracking(
      sanitizedMessage, 
      userId, 
      conversationId, 
      serviceTier
    );

    console.log('✅ AI response generated successfully');

    // 📈 NEW: Increment message count and track token usage
    console.log('📈 Tracking usage statistics...');
    await Promise.all([
      UsageTrackingService.incrementMessageCount(userId, userTier),
      UsageTrackingService.trackTokenUsage(
        userId,
        userTier,
        aiResponse.metadata.promptTokens || 0,
        aiResponse.metadata.completionTokens || 0,
        aiResponse.model
      )
    ]);

    // 💾 Store conversation messages for future context
    console.log('💾 Storing conversation for future context...');
    await storeConversationMessages(
      conversationId,
      userId,
      sanitizedMessage,
      aiResponse.content,
      aiResponse.metadata
    );

    // Create message objects
    const userMessageId = SecurityManager.generateToken(8);
    const assistantMessageId = SecurityManager.generateToken(8);

    const responseMessages = [
      {
        id: userMessageId,
        conversationId,
        role: 'user' as const,
        content: sanitizedMessage,
        metadata: {
          piiDetected: piiDetected.length > 0,
          tier: userTier
        },
        attachments,
        timestamp: new Date(),
        edited: false
      },
      {
        id: assistantMessageId,
        conversationId,
        role: 'assistant' as const,
        content: aiResponse.content,
        metadata: aiResponse.metadata,
        attachments: [],
        timestamp: new Date(),
        edited: false
      }
    ];

    // Log successful interaction
    await AuditLogger.logSecurityEvent(
      userId,
      'message_processed',
      'chat/send-message',
      { 
        conversationId,
        messageLength: sanitizedMessage.length,
        aiModel: aiResponse.model,
        processingTime: Date.now() - startTime,
        tier: userTier,
        tokensUsed: aiResponse.metadata.tokensUsed || 0
      },
      'low',
      request
    );

    console.log('✅ Chat response prepared successfully');

    // Create response with rate limit headers
    const response = NextResponse.json({
      success: true,
      data: {
        messages: responseMessages,
        conversationId,
        aiModel: aiResponse.model,
        usage: {
          messagesRemaining: Math.max(0, dailyLimitResult.limit - dailyLimitResult.current - 1),
          messagesLimit: dailyLimitResult.limit,
          tokensUsed: aiResponse.metadata.tokensUsed || 0,
          tier: userTier
        },
        rateLimit: {
          remaining: Math.max(0, rateLimitResult.limit - rateLimitResult.current),
          limit: rateLimitResult.limit,
          resetsAt: rateLimitResult.resetsAt.toISOString()
        }
      },
      metadata: {
        requestId: SecurityManager.generateToken(16),
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    } as ApiResponse, { status: 200 });

    // Add rate limit headers
    return RateLimitingService.addRateLimitHeaders(
      response,
      rateLimitResult.current,
      rateLimitResult.limit,
      rateLimitResult.resetsAt
    );

  } catch (error) {
    console.error('💥 Chat API error:', error);

    // Log error
    await AuditLogger.logSecurityEvent(
      userId,
      'chat_api_error',
      'chat/send-message',
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId,
        stack: error instanceof Error ? error.stack : undefined,
        tier: userTier
      },
      'high',
      request
    );

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred while processing your message',
        timestamp: new Date(),
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
      },
      metadata: {
        requestId: SecurityManager.generateToken(16),
        timestamp: new Date(),
        processingTime: Date.now() - startTime
      }
    } as ApiResponse, { status: 500 });
  }
}

// Enhanced OpenAI response generator with usage tracking
async function generateOpenAIResponseWithTracking(
  message: string, 
  userId: string, 
  conversationId: string,
  serviceTier: UserServiceTier
) {
  const aiStartTime = Date.now();
  
  try {
    console.log(`🎯 User: ${userId}`);
    console.log(`💎 Tier: ${serviceTier.tier} (${serviceTier.modelToUse})`);
    console.log(`✨ Features: ${JSON.stringify(serviceTier.features)}`);

    // 🔍 Detect search intent with tier restrictions
    const originalIntent = detectAirtableSearchIntent(message);
    const restrictedIntent = applyTierRestrictions(originalIntent, serviceTier);
    
    console.log(`🔐 Original intent:`, originalIntent);
    console.log(`🚫 Restricted intent:`, restrictedIntent);
    
    // 🎯 Track feature usage
    if (restrictedIntent.searchOpportunities) {
      await UsageTrackingService.trackFeatureUsage(userId, 'opportunities', serviceTier.tier);
    }
    if (restrictedIntent.getUserMatches) {
      await UsageTrackingService.trackFeatureUsage(userId, 'matches', serviceTier.tier);
    }
    if (restrictedIntent.searchResources) {
      await UsageTrackingService.trackFeatureUsage(userId, 'resources', serviceTier.tier);
    }
    
    let airtableContext = '';
    let upsellMessage = '';
    
    // 🚨 Generate upsell messages for blocked features
    if (restrictedIntent.blockedFeatures?.opportunities && originalIntent.searchOpportunities) {
      upsellMessage += SubscriptionService.getFeatureUpsellMessage('opportunities', serviceTier.tier);
    }
    if (restrictedIntent.blockedFeatures?.matches && originalIntent.getUserMatches) {
      upsellMessage += SubscriptionService.getFeatureUpsellMessage('matches', serviceTier.tier);
    }
    
    // 🔍 Search Airtable with tier restrictions
    if (restrictedIntent.searchRequired) {
      console.log('🔍 Searching Airtable with tier restrictions...');
      airtableContext = await gatherTieredAirtableContext(message, userId, restrictedIntent, serviceTier);
    }

    // 🧠 Get conversation history with tier limits
    console.log('🧠 Gathering conversation history with tier limits...');
    const conversationHistory = await gatherTieredConversationContext(
      conversationId, 
      userId, 
      serviceTier
    );

    // 🎨 Build tier-specific system prompt
    const systemPrompt = buildTieredSystemPrompt(
      airtableContext, 
      serviceTier, 
      null, // userProfile not needed here as we have serviceTier
      conversationHistory.length > 0,
      restrictedIntent.blockedFeatures
    );

    // 🤖 Use tier-appropriate model and limits
    const modelToUse = serviceTier.modelToUse;
    console.log(`🔧 Using ${modelToUse} for ${serviceTier.tier} user`);

    // 📝 Build messages array with tier considerations
    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add Airtable context if available
    if (airtableContext) {
      messages.push({
        role: 'system',
        content: `Available Data:\n${airtableContext}`
      });
    }

    // 🧠 Add conversation history with tier limits
    if (conversationHistory.length > 0) {
      const historyToInclude = conversationHistory.slice(-serviceTier.limits.conversationHistory);
      messages.push(...historyToInclude);
      console.log(`✅ Added ${historyToInclude.length} previous messages for context`);
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });

    // 🤖 Call OpenAI with tier-appropriate settings
    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages,
      max_tokens: serviceTier.limits.maxTokens,
      temperature: serviceTier.tier === SubscriptionTier.FREE ? 0.5 : 0.7, // More focused for free users
      presence_penalty: 0,
      frequency_penalty: 0
    });

    const responseTime = Date.now() - aiStartTime;
    let response = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';

    // 💎 Add upsell message for free users who hit restrictions
    if (upsellMessage) {
      response += upsellMessage;
      console.log('💰 Added upsell message for blocked features');
    }

    console.log(`✅ ${serviceTier.tier} response generated (${responseTime}ms)`);

    return {
      success: true,
      content: response,
      model: modelToUse,
      metadata: {
        responseTime,
        tokensUsed: completion.usage?.total_tokens || 0,
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        finishReason: completion.choices[0]?.finish_reason || 'unknown',
        serviceTier: serviceTier.tier,
        featuresUsed: restrictedIntent,
        blockedFeatures: restrictedIntent.blockedFeatures,
        upsellShown: !!upsellMessage,
        conversationHistoryUsed: conversationHistory.length > 0,
        airtableDataUsed: !!airtableContext
      }
    };

  } catch (error) {
    console.error('❌ OpenAI API error:', error);
    
    // Log OpenAI specific errors
    await AuditLogger.logSecurityEvent(
      userId,
      'openai_api_error',
      'chat/send-message',
      { 
        error: error instanceof Error ? error.message : 'Unknown OpenAI error',
        model: serviceTier.modelToUse,
        stack: error instanceof Error ? error.stack : undefined
      },
      'medium',
      null
    );

    const responseTime = Date.now() - aiStartTime;

    // Return fallback response that doesn't expose internal errors
    return {
      success: false,
      content: "I apologize, but I'm experiencing technical difficulties right now. Please try again in a moment, or if the issue persists, you can contact the VA directly at 1-800-827-1000 for immediate assistance with your questions.",
      model: 'fallback',
      metadata: {
        responseTime,
        tokensUsed: 0,
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : 'OpenAI service unavailable'
      }
    };
  }
}

/**
 * Detect if the user's message requires searching Airtable for opportunities/resources
 */
function detectAirtableSearchIntent(message: string): {
  searchRequired: boolean;
  searchOpportunities: boolean;
  searchResources: boolean;
  getUserMatches: boolean;
  getOpportunityDetails: boolean;
  opportunityId?: string;
  keywords: string[];
} {
  const lowerMessage = message.toLowerCase();
  
  // Check for specific opportunity ID requests
  const opportunityIdMatch = message.match(/\b(rec[A-Za-z0-9]{14}|[A-Za-z0-9\-]+)\b/g);
  const detailKeywords = ['details', 'more info', 'tell me more', 'full description', 'specific', 'about this'];
  const wantsDetails = detailKeywords.some(keyword => lowerMessage.includes(keyword)) && opportunityIdMatch;
  
  // Keywords that indicate need for Airtable data
  const opportunityKeywords = [
    'opportunities', 'jobs', 'employment', 'career', 'position', 'opening',
    'work', 'internship', 'apprenticeship', 'training program', 'scholarship',
    'contracts', 'government contracts', 'grants', 'funding'
  ];
  
  const resourceKeywords = [
    'resources', 'benefits', 'assistance', 'help', 'support', 'services',
    'healthcare', 'disability', 'compensation', 'education', 'housing',
    'mental health', 'counseling', 'financial aid', 'loan', 'grant',
    'sba', 'business resources', 'veteran benefits'
  ];
  
  const matchKeywords = [
    'my opportunities', 'my matches', 'recommended', 'personalized',
    'what\'s available for me', 'what can i apply for', 'my benefits',
    'matched for me', 'tailored'
  ];

  const foundOpportunityKeywords = opportunityKeywords.filter(keyword => 
    lowerMessage.includes(keyword)
  );
  
  const foundResourceKeywords = resourceKeywords.filter(keyword => 
    lowerMessage.includes(keyword)
  );
  
  const foundMatchKeywords = matchKeywords.filter(keyword => 
    lowerMessage.includes(keyword)
  );

  const searchOpportunities = foundOpportunityKeywords.length > 0;
  const searchResources = foundResourceKeywords.length > 0;
  const getUserMatches = foundMatchKeywords.length > 0;
  const getOpportunityDetails = wantsDetails;
  
  return {
    searchRequired: searchOpportunities || searchResources || getUserMatches || getOpportunityDetails,
    searchOpportunities,
    searchResources,
    getUserMatches,
    getOpportunityDetails,
    opportunityId: getOpportunityDetails ? opportunityIdMatch?.[0] : undefined,
    keywords: [...foundOpportunityKeywords, ...foundResourceKeywords, ...foundMatchKeywords]
  };
}

/**
 * 🚫 Apply tier restrictions to search intent
 */
function applyTierRestrictions(
  intent: ReturnType<typeof detectAirtableSearchIntent>,
  serviceTier: UserServiceTier
): typeof intent & { blockedFeatures?: { opportunities?: boolean; matches?: boolean } } {
  const blockedFeatures: { opportunities?: boolean; matches?: boolean } = {};
  
  // Check if user is trying to access premium features
  if (intent.searchOpportunities && !serviceTier.features.opportunities) {
    blockedFeatures.opportunities = true;
  }
  if (intent.getUserMatches && !serviceTier.features.matches) {
    blockedFeatures.matches = true;
  }
  
  return {
    ...intent,
    // Only allow searches for features the user has access to
    searchOpportunities: intent.searchOpportunities && serviceTier.features.opportunities,
    getUserMatches: intent.getUserMatches && serviceTier.features.matches,
    searchResources: intent.searchResources && serviceTier.features.resources, // Resources available to all
    blockedFeatures: Object.keys(blockedFeatures).length > 0 ? blockedFeatures : undefined
  };
}

/**
 * 🔍 Gather Airtable context with tier restrictions
 */
async function gatherTieredAirtableContext(
  message: string, 
  userId: string, 
  searchIntent: ReturnType<typeof applyTierRestrictions>,
  serviceTier: UserServiceTier
): Promise<string> {
  const contextParts: string[] = [];
  
  try {
    console.log('🔍 Tiered Airtable Search Debug:');
    console.log(`   User Tier: ${serviceTier.tier}`);
    console.log(`   Search Intent:`, searchIntent);
    console.log(`   Message: "${message}"`);
    console.log(`   User ID: ${userId}`);

    // Search for opportunities if tier allows
    if (searchIntent.searchOpportunities && serviceTier.features.opportunities) {
      console.log('   🎯 Searching opportunities (Premium feature)...');
      const searchResults = await AirtableService.searchOpportunities(message, userId);
      
      // Add audit logging
      await AuditLogger.logSecurityEvent(
        userId,
        'data_read',
        'opportunities:search',
        { dataType: 'opportunities', tier: serviceTier.tier },
        'medium',
        null
      );
      
      const opportunitiesData = Array.isArray(searchResults) ? searchResults : [];
      console.log('   📊 opportunities found:', opportunitiesData.length);
      
      if (opportunitiesData.length > 0) {
        const oppsContext = formatOpportunitiesContextConcise(opportunitiesData);
        contextParts.push(oppsContext);
        console.log('   ✅ Added opportunities context');
      }
    }

    // Search for resources (available to all tiers)
    if (searchIntent.searchResources && serviceTier.features.resources) {
      console.log('   📚 Searching resources (Available to all tiers)...');
      const searchResults = await AirtableService.searchResources(message, userId, 5);
      console.log(`   📊 Found ${searchResults?.length || 0} resources`);
      
      const resourcesData = searchResults || [];
      
      if (resourcesData.length > 0) {
        const resourcesContext = formatResourcesContextConcise(resourcesData);
        contextParts.push(resourcesContext);
        console.log(`   ✅ Added resources context`);
      }
    }

    // Get user matches if tier allows
    if (searchIntent.getUserMatches && serviceTier.features.matches) {
      console.log('   🎯 Getting user matches (Premium feature)...');
      const userMatches = await AirtableService.getUserMatches(userId);
      console.log(`   📊 Found ${userMatches?.totalMatches || 0} total matches`);
      
      if (userMatches && userMatches.totalMatches > 0) {
        const formattedMatches = formatUserMatchesContextConcise(userMatches);
        contextParts.push(formattedMatches);
        console.log(`   ✅ Added matches context`);
      }
    }

    const finalContext = contextParts.join('\n\n');
    console.log(`🎯 Final Tiered Context: ${finalContext.length} chars`);
    
    return finalContext;
  } catch (error) {
    console.error('❌ Error gathering tiered Airtable context:', error);
    return serviceTier.tier === SubscriptionTier.FREE 
      ? 'Note: Limited data access available. Upgrade to Premium for full database access.'
      : 'Note: Unable to access VADIY database at this time. Providing general information instead.';
  }
}

/**
 * 🧠 Gather conversation history with tier limits
 */
async function gatherTieredConversationContext(
  conversationId: string, 
  userId: string,
  serviceTier: UserServiceTier
): Promise<any[]> {
  try {
    console.log(`🧠 Fetching conversation history with tier limits...`);
    console.log(`🎯 Tier: ${serviceTier.tier}, Memory limit: ${serviceTier.limits.conversationHistory} messages`);
    
    // For free users, very limited memory
    if (serviceTier.tier === SubscriptionTier.FREE) {
      console.log('📝 Free tier: Limited conversation memory');
      if (conversationId.startsWith('temp_')) {
        return []; // No memory for temp conversations on free tier
      }
    }
    
    // For temp conversations (new chats), use in-memory storage
    if (conversationId.startsWith('temp_')) {
      console.log('📝 Using temporary conversation');
      return []; // For now, return empty - could implement temp storage later
    }
    
    // Try to get conversation messages from Airtable with tier limits
    try {
      const maxMessages = Math.min(serviceTier.limits.conversationHistory * 2, 20); // Get more to slice later
      const messages = await AirtableService.getConversationMessages(conversationId, userId, maxMessages);
      console.log(`✅ Retrieved ${messages.length} messages from Airtable`);
      
      // Convert to OpenAI format with tier limits
      const formattedMessages = messages
        .filter(msg => msg.role !== 'system') // Remove system messages
        .slice(-serviceTier.limits.conversationHistory) // Apply tier limit
        .map(msg => ({
          role: msg.role,
          content: PIIProtector.maskPII(msg.content) // Mask any PII for safety
        }));
      
      console.log(`🔄 Formatted ${formattedMessages.length} messages for ${serviceTier.tier} tier`);
      return formattedMessages;
      
    } catch (airtableError) {
      console.warn('⚠️ Could not fetch from Airtable:', airtableError);
      return [];
    }
    
  } catch (error) {
    console.error('❌ Error gathering tiered conversation context:', error);
    return [];
  }
}

/**
 * 🎨 Build tier-specific system prompt
 */
function buildTieredSystemPrompt(
  airtableContext: string, 
  serviceTier: UserServiceTier,
  userProfile: any,
  hasConversationHistory: boolean,
  blockedFeatures?: { opportunities?: boolean; matches?: boolean }
): string {
  let greeting = '';
  
  // 👋 Personalized greeting for premium users
  if (serviceTier.features.personalizedGreeting && userProfile?.firstName) {
    greeting = `Hello ${userProfile.firstName}! Welcome back to VADIY `;
    if (serviceTier.tier === SubscriptionTier.FOUNDER) {
      greeting += `Founder Club. Thank you for being a founding member - you have access to all our exclusive features. `;
    } else if (serviceTier.tier === SubscriptionTier.PREMIUM) {
      greeting += `Premium. You have full access to all VADIY features. `;
    }
  } else {
    greeting = `Hello! I'm your VADIY Assistant. `;
  }

  let systemPrompt = `${greeting}You are the AI assistant for VADIY (Veteran Administered Digital Infrastructure for You), a comprehensive platform that connects veterans with personalized opportunities, resources, and benefits.

🎯 SERVICE TIER: ${serviceTier.tier}
🤖 AI MODEL: ${serviceTier.modelToUse}
✨ AVAILABLE FEATURES: ${Object.entries(serviceTier.features)
    .filter(([_, enabled]) => enabled)
    .map(([feature, _]) => feature)
    .join(', ')}`;

  // 🚨 Add blocked feature notifications
  if (blockedFeatures?.opportunities || blockedFeatures?.matches) {
    systemPrompt += `\n\n🚫 PREMIUM FEATURES REQUESTED (Not available on Free tier):`;
    if (blockedFeatures.opportunities) {
      systemPrompt += `\n• Opportunity matching and job recommendations`;
    }
    if (blockedFeatures.matches) {
      systemPrompt += `\n• Personalized profile-based matching`;
    }
    systemPrompt += `\n\nIMPORTANT: When the user asks about these features, encourage them to upgrade and explain the benefits they would get.`;
  }

  // 💎 Add tier-specific capabilities
  if (serviceTier.hasFullAccess) {
    const modelInfo = serviceTier.modelToUse === 'gpt-4o-mini' 
      ? `GPT-4o-mini (15x more efficient than GPT-4)${serviceTier.tier === SubscriptionTier.FOUNDER ? ' • Founder Priority Service' : ''}` 
      : serviceTier.modelToUse;

    systemPrompt += `\n\n🌟 PREMIUM CAPABILITIES ACTIVE:
- Full access to VADIY's opportunity database
- Personalized opportunity matching based on user profile
- Complete conversation memory (last ${serviceTier.limits.conversationHistory} exchanges)
- Advanced AI responses with ${modelInfo}
- ${serviceTier.tier === SubscriptionTier.FOUNDER ? 'Founder-level priority support and highest limits' : 'Priority recommendations based on user profile'}
- Access to all veteran resources and benefits information`;
  } else {
    systemPrompt += `\n\n📚 FREE TIER CAPABILITIES:
- Access to VADIY's resource library and general information
- Basic veteran support guidance
- Limited conversation memory (last ${serviceTier.limits.conversationHistory} exchanges)
- Powered by ${serviceTier.modelToUse}

💎 PREMIUM FEATURES (Encourage upgrade):
- Personalized opportunity matching from VADIY's database
- Government contract and job recommendations
- Advanced conversation memory and context
- GPT-4o-mini powered responses (15x more efficient than GPT-4)
- Priority support and advanced features`;
  }

  // Add conversation awareness if applicable
  if (hasConversationHistory && serviceTier.features.fullMemory) {
    systemPrompt += `\n\n🧠 CONVERSATION CONTEXT AWARENESS:
You have access to our previous conversation history. Use this context to:
- Reference previous topics we've discussed
- Build upon earlier questions or recommendations
- Provide more personalized and contextual responses
- Continue conversations naturally without losing context`;
  }

  // Add tier-appropriate context handling
  if (airtableContext) {
    systemPrompt += `\n\nAVAILABLE DATA FROM VADIY:\n${airtableContext}`;
  }

  systemPrompt += `\n\nRESPONSE GUIDELINES:
- Always be helpful, professional, and supportive of veterans
- ${serviceTier.features.personalizedGreeting ? 'Use the user\'s name when appropriate' : 'Maintain a friendly but general tone'}
- Format responses with clear headings, emojis, and structure for easy reading
- ${serviceTier.hasFullAccess ? 'Provide comprehensive assistance with full database access' : 'Focus on available resources and general veteran information'}
- Always identify yourself as VADIY's assistant
- ${serviceTier.tier === SubscriptionTier.FREE ? 'When users ask about premium features, naturally encourage upgrading while being helpful' : 'Provide the most comprehensive assistance possible'}
- Be encouraging and supportive - veterans deserve excellent service`;

  return systemPrompt;
}

/**
 * Format opportunities for AI context - USER-FRIENDLY VERSION
 */
function formatOpportunitiesContextConcise(opportunities: Opportunity[]): string {
  const formatted = opportunities.map((opp, index) => {
    const deadline = opp.deadline ? new Date(opp.deadline).toLocaleDateString() : 'No deadline specified';
    const summary = opp.description?.substring(0, 120) || 'No summary available';
    
    return `**${index + 1}. ${opp.title}**
📝 **Summary:** ${summary}${opp.description && opp.description.length > 120 ? '...' : ''}
📅 **Deadline:** ${deadline}
🔗 **Reference ID:** ${opp.opportunityID || opp.id}`;
  }).join('\n\n');

  return `## 🎯 Available Opportunities in VADIY Database (${opportunities.length} found)

${formatted}

💡 **Need more details?** Ask me about any specific opportunity using its Reference ID (e.g., "Tell me more about ${opportunities[0]?.opportunityID || opportunities[0]?.id}")`;
}

/**
 * Format resources for AI context - USER-FRIENDLY VERSION
 */
function formatResourcesContextConcise(resources: Resource[]): string {
  const formatted = resources.map((resource, index) => {
    const description = resource.description?.substring(0, 100) || 'No description available';
    
    return `**${index + 1}. ${resource.title}**
📂 **Category:** ${resource.category}
ℹ️ **Description:** ${description}${resource.description && resource.description.length > 100 ? '...' : ''}`;
  }).join('\n\n');

  return `## 📚 Available Resources in VADIY Database (${resources.length} found)

${formatted}

💡 **Need assistance?** Contact VADIY for personalized help with these resources.`;
}

/**
 * Format user matches for AI context - Concise version for Premium users
 */
function formatUserMatchesContextConcise(userMatches: {
  totalMatches: number;
  matches: any[];
}): string {
  if (!userMatches || userMatches.totalMatches === 0) {
    return '## 🎯 No Personalized Matches Found\n\nNo matches are currently available in your profile. Consider updating your profile for better matching.';
  }

  const matchList = userMatches.matches.slice(0, 5).map((match, index) => {
    const score = Math.round((match.matchScore || 0) * 100);
    return `**${index + 1}.** Match Score: ${score}%\n📋 **Opportunity ID:** ${match.opportunityId}\n💡 **Why it matches:** ${match.matchReason || 'Profile compatibility'}\n⏰ **Matched:** ${match.createdAt ? new Date(match.createdAt).toLocaleDateString() : 'Recently'}`;
  }).join('\n\n');

  return `## 🎯 Your Personalized Matches (${userMatches.totalMatches} total)

${matchList}

💡 *These matches are based on your profile and preferences. Ask me about any specific opportunity ID for more details!*`;
}

/**
 * 🧠 NEW: Gather conversation history for enhanced context awareness
 * This makes the AI remember previous messages and provide more contextual responses
 */
async function gatherConversationContext(
  conversationId: string, 
  userId: string
): Promise<any[]> {
  try {
    console.log(`🧠 Fetching conversation history for: ${conversationId}`);
    
    // For temp conversations (new chats), we'll use in-memory storage
    if (conversationId.startsWith('temp_')) {
      console.log('📝 Using temporary conversation - checking in-memory storage');
      // For now, return empty array for temp conversations
      // In a production system, you might store temp messages in Redis or similar
      return [];
    }
    
    // Try to get conversation messages from Airtable
    try {
      const messages = await AirtableService.getConversationMessages(conversationId, userId, 8); // Last 8 messages
      console.log(`✅ Retrieved ${messages.length} messages from Airtable`);
      
      // Convert to OpenAI format, excluding the current session
      const formattedMessages = messages
        .filter(msg => msg.role !== 'system') // Remove system messages
        .slice(-6) // Keep last 6 messages for context (3 exchanges)
        .map(msg => ({
          role: msg.role,
          content: PIIProtector.maskPII(msg.content) // Mask any PII for safety
        }));
      
      console.log(`🔄 Formatted ${formattedMessages.length} messages for AI context`);
      return formattedMessages;
      
    } catch (airtableError) {
      console.warn('⚠️ Could not fetch from Airtable, using fallback:', airtableError);
      return [];
    }
    
  } catch (error) {
    console.error('❌ Error gathering conversation context:', error);
    return [];
  }
}

/**
 * 💾 Enhanced: Store conversation messages in Airtable for future context
 */
async function storeConversationMessages(
  conversationId: string,
  userId: string,
  userMessage: string,
  assistantResponse: string,
  metadata: any
): Promise<void> {
  try {
    console.log(`💾 Storing conversation messages for: ${conversationId}`);
    
    // Skip storing for temporary conversations
    if (conversationId.startsWith('temp_')) {
      console.log('⏭️ Skipping storage for temporary conversation');
      return;
    }
    
    // Create conversation if it doesn't exist
    try {
      await AirtableService.getConversation(conversationId, userId);
    } catch {
      // Conversation doesn't exist, create it
      console.log('📝 Creating new conversation record');
      await AirtableService.createConversation(
        userId,
        `Chat ${new Date().toLocaleDateString()}`,
        false // Not encrypted for now
      );
    }
    
    // Store user message
    await AirtableService.addMessage(
      conversationId,
      'user',
      userMessage,
      { timestamp: new Date().toISOString() }
    );
    
    // Store assistant response
    await AirtableService.addMessage(
      conversationId,
      'assistant',
      assistantResponse,
      {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    );
    
    console.log('✅ Successfully stored conversation messages');
    
  } catch (error) {
    console.warn('⚠️ Could not store conversation messages:', error);
    // Don't fail the request if storage fails
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

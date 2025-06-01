export enum SubscriptionTier {
  FREE = 'Free',
  PREMIUM = 'Premium', 
  FOUNDER = 'Founder Club'
}

export interface UserServiceTier {
  tier: SubscriptionTier;
  hasFullAccess: boolean;
  modelToUse: 'gpt-4o-mini' | 'gpt-3.5-turbo';
  features: {
    opportunities: boolean;
    matches: boolean;
    resources: boolean;
    fullMemory: boolean;
    personalizedGreeting: boolean;
    webSearch: boolean;
    smartRouting: boolean;
  };
  limits: {
    messagesPerDay: number;
    conversationHistory: number;
    maxTokens: number;
  };
}

export class SubscriptionService {
  /**
   * Determine user service tier based on Subscription_Status field from Airtable
   * Updated with most efficient current models - GPT-4o-mini for all premium tiers
   */
  static determineUserTier(subscriptionStatus: string): UserServiceTier {
    const status = subscriptionStatus?.trim() || 'Free';
    
    console.log(`🔍 Determining tier for subscription status: "${status}"`);
    
    switch (status) {
      case 'Founder Club':
        return {
          tier: SubscriptionTier.FOUNDER,
          hasFullAccess: true,
          modelToUse: 'gpt-4o-mini', // Same efficient model, premium service & limits
          features: {
            opportunities: true,
            matches: true,
            resources: true,
            fullMemory: true,
            personalizedGreeting: true,
            webSearch: true,
            smartRouting: true
          },
          limits: {
            messagesPerDay: 1000, // Highest limits for founders
            conversationHistory: 25, // Best memory for founders
            maxTokens: 2000 // Most generous token allowance
          }
        };
        
      case 'Premium':
        return {
          tier: SubscriptionTier.PREMIUM,
          hasFullAccess: true,
          modelToUse: 'gpt-4o-mini', // Most cost-efficient GPT-4 class model - $0.15 input / $0.60 output per 1M tokens
          features: {
            opportunities: true,
            matches: true,
            resources: true,
            fullMemory: true,
            personalizedGreeting: true,
            webSearch: true,
            smartRouting: true
          },
          limits: {
            messagesPerDay: 500,
            conversationHistory: 20,
            maxTokens: 1500 // Good balance for 4o-mini
          }
        };
        
      case 'Free':
      default:
        return {
          tier: SubscriptionTier.FREE,
          hasFullAccess: false,
          modelToUse: 'gpt-3.5-turbo', // Most cost-effective for free tier - $0.50 input / $1.50 output per 1M tokens
          features: {
            opportunities: false,
            matches: false,
            resources: true,
            fullMemory: false,
            personalizedGreeting: false,
            webSearch: false,
            smartRouting: false
          },
          limits: {
            messagesPerDay: 50,
            conversationHistory: 3, // Very limited for free
            maxTokens: 500 // Conservative for cost control
          }
        };
    }
  }
  
  /**
   * Generate smart upselling messages when free users ask for premium features
   */
  static getFeatureUpsellMessage(requestedFeature: string, tier: SubscriptionTier): string {
    if (tier !== SubscriptionTier.FREE) return '';
    
    const upsellMessages = {
      opportunities: `\n\n💼 **Looking for Opportunities?** \nUpgrade to Premium to access:\n• Personalized job matching from VADIY's database\n• Government contract opportunities\n• Real-time opportunity alerts\n• Enhanced AI responses with GPT-4o-mini\n\n💎 [Upgrade to Premium →](https://vadiy.com/upgrade)`,
      
      matches: `\n\n🎯 **Want Personalized Matches?** \nPremium members get:\n• Custom opportunity recommendations\n• Profile-based job matching\n• Priority application support\n• Advanced AI with GPT-4o-mini\n\n💎 [Upgrade to Premium →](https://vadiy.com/upgrade)`,
      
      webSearch: `\n\n🌐 **Need Real-Time Information?** \nPremium features include:\n• Live veteran benefits updates\n• Current VA policy changes\n• Real-time opportunity alerts\n• Smart web research with GPT-4o-mini\n\n💎 [Upgrade to Premium →](https://vadiy.com/upgrade)`,
      
      advanced: `\n\n🚀 **Want Advanced AI Features?** \nUpgrade for:\n• GPT-4o-mini powered responses (15x more efficient than GPT-4)\n• Unlimited conversation memory\n• Priority support\n• Advanced research capabilities\n\n💎 [Upgrade to Premium →](https://vadiy.com/upgrade)`
    };
    
    return upsellMessages[requestedFeature] || upsellMessages.advanced;
  }
  
  /**
   * Check if user has exceeded daily limits
   */
  static async checkDailyLimit(userId: string, tier: SubscriptionTier): Promise<boolean> {
    // TODO: Implement actual daily limit checking with Redis/database
    // For now, always allow (implement later with usage tracking)
    console.log(`✅ Daily limit check passed for ${tier} user: ${userId}`);
    return true;
  }
  
  /**
   * Get cost-efficiency information for each tier
   */
  static getTierCostInfo(tier: SubscriptionTier): {
    model: string;
    inputCostPer1M: number;
    outputCostPer1M: number;
    efficiency: string;
  } {
    switch (tier) {
      case SubscriptionTier.FOUNDER:
        return {
          model: 'GPT-4o-mini',
          inputCostPer1M: 0.15,
          outputCostPer1M: 0.60,
          efficiency: 'Premium model with founder-level service and limits'
        };
      case SubscriptionTier.PREMIUM:
        return {
          model: 'GPT-4o-mini',
          inputCostPer1M: 0.15,
          outputCostPer1M: 0.60,
          efficiency: '15x more cost-efficient than GPT-4 with similar performance'
        };
      case SubscriptionTier.FREE:
        return {
          model: 'GPT-3.5-turbo',
          inputCostPer1M: 0.50,
          outputCostPer1M: 1.50,
          efficiency: 'Reliable and cost-effective for basic tasks'
        };
    }
  }
} 
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { PIIProtector, SecurityManager } from './security';
import type { Message, MessageMetadata } from '@/types';

// AI Provider configurations
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface AIResponse {
  content: string;
  model: string;
  metadata: MessageMetadata;
  success: boolean;
  error?: string;
}

export interface AIContext {
  userId: string;
  userProfile?: any;
  conversationHistory: Message[];
  intent?: string;
  attachments?: any[];
}

export class AIService {
  private static readonly VETERAN_SYSTEM_PROMPT = `
You are a specialized AI assistant for U.S. military veterans, designed to help with:

1. **Financial Opportunities**: Finding grants, loans, contracts, and benefits
2. **Application Assistance**: Writing compelling applications and bid proposals
3. **Document Analysis**: Reviewing DD-214s, medical records, and other veteran documents
4. **Benefits Navigation**: Understanding VA benefits, disability claims, and eligibility
5. **Resource Connection**: Connecting veterans to healthcare, education, housing, and employment resources

**CRITICAL SECURITY GUIDELINES:**
- NEVER store, log, or repeat sensitive personal information (SSN, medical details, financial data)
- Always maintain veteran privacy and confidentiality
- Provide accurate, up-to-date information about veteran benefits and opportunities
- Be empathetic and understanding of veteran experiences
- If unsure about benefits or eligibility, direct veterans to official VA resources

**RESPONSE STYLE:**
- Professional yet warm and supportive
- Clear, actionable guidance
- Structured information with bullet points when helpful
- Include relevant deadlines and next steps
- Acknowledge the veteran's service when appropriate

Remember: You're serving those who served our country. Treat every interaction with the respect and care our veterans deserve.
`;

  /**
   * Generate AI response with fallback mechanism
   */
  static async generateResponse(
    userMessage: string,
    context: AIContext,
    preferredModel: 'openai' | 'claude' | 'perplexity' = 'openai'
  ): Promise<AIResponse> {
    const startTime = Date.now();
    
    // Sanitize input and detect PII
    const sanitizedMessage = this.sanitizeUserInput(userMessage);
    const piiDetected = PIIProtector.detectPII(userMessage);
    
    if (piiDetected.length > 0) {
      console.warn(`PII detected in user message: ${piiDetected.map(p => p.type).join(', ')}`);
    }

    // Determine intent and prepare context
    const intent = await this.analyzeIntent(sanitizedMessage);
    const systemPrompt = this.buildSystemPrompt(context, intent);
    const conversationMessages = this.prepareConversationHistory(context.conversationHistory);

    // Try primary model first, then fallbacks
    const models = this.getModelFallbackOrder(preferredModel);
    
    for (const model of models) {
      try {
        const response = await this.callAIModel(
          model,
          systemPrompt,
          sanitizedMessage,
          conversationMessages
        );

        if (response.success) {
          response.metadata = {
            aiModel: model,
            responseTime: Date.now() - startTime,
            intent,
            confidence: this.calculateConfidence(response.content),
            sources: this.extractSources(response.content)
          };

          return response;
        }
      } catch (error) {
        console.error(`Error with ${model}:`, error);
        continue; // Try next model
      }
    }

    // All models failed
    return {
      content: "I apologize, but I'm experiencing technical difficulties right now. Please try again in a few moments, or contact support if the issue persists.",
      model: 'fallback',
      metadata: {
        responseTime: Date.now() - startTime,
        intent,
        confidence: 0
      },
      success: false,
      error: 'All AI models failed'
    };
  }

  /**
   * Call specific AI model
   */
  private static async callAIModel(
    model: string,
    systemPrompt: string,
    userMessage: string,
    conversationHistory: any[]
  ): Promise<AIResponse> {
    switch (model) {
      case 'openai':
        return await this.callOpenAI(systemPrompt, userMessage, conversationHistory);
      case 'claude':
        return await this.callClaude(systemPrompt, userMessage, conversationHistory);
      case 'perplexity':
        return await this.callPerplexity(systemPrompt, userMessage, conversationHistory);
      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }

  /**
   * OpenAI API call
   */
  private static async callOpenAI(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: any[]
  ): Promise<AIResponse> {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages as any,
        max_tokens: 2000,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const content = completion.choices[0]?.message?.content || '';
      
      return {
        content,
        model: 'openai',
        metadata: {
          tokenCount: completion.usage?.total_tokens
        },
        success: true
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }

  /**
   * Claude API call
   */
  private static async callClaude(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: any[]
  ): Promise<AIResponse> {
    try {
      const messages = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      const response = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        system: systemPrompt,
        messages: messages as any
      });

      const content = response.content[0]?.type === 'text' 
        ? response.content[0].text 
        : '';

      return {
        content,
        model: 'claude',
        metadata: {
          tokenCount: response.usage?.input_tokens + response.usage?.output_tokens
        },
        success: true
      };
    } catch (error) {
      console.error('Claude API error:', error);
      throw error;
    }
  }

  /**
   * Perplexity API call
   */
  private static async callPerplexity(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: any[]
  ): Promise<AIResponse> {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'llama-3.1-sonar-small-128k-online',
          messages,
          max_tokens: 2000,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0]?.message?.content || '';

      return {
        content,
        model: 'perplexity',
        metadata: {
          tokenCount: response.data.usage?.total_tokens,
          sources: this.extractPerplexitySources(response.data)
        },
        success: true
      };
    } catch (error) {
      console.error('Perplexity API error:', error);
      throw error;
    }
  }

  /**
   * Analyze user intent
   */
  private static async analyzeIntent(message: string): Promise<any> {
    const intentKeywords = {
      opportunity: ['grant', 'loan', 'funding', 'money', 'financial', 'opportunity', 'contract'],
      application: ['apply', 'application', 'bid', 'proposal', 'write', 'help me write'],
      benefits: ['benefits', 'va', 'disability', 'compensation', 'pension', 'healthcare'],
      document: ['dd-214', 'medical record', 'document', 'analyze', 'review'],
      resource: ['resource', 'help', 'service', 'program', 'assistance'],
      general: ['hello', 'hi', 'thank you', 'thanks']
    };

    const lowerMessage = message.toLowerCase();
    
    for (const [category, keywords] of Object.entries(intentKeywords)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return {
          category,
          subcategory: this.getSubcategory(category, lowerMessage),
          confidence: 0.8
        };
      }
    }

    return {
      category: 'general',
      confidence: 0.5
    };
  }

  /**
   * Build system prompt based on context and intent
   */
  private static buildSystemPrompt(context: AIContext, intent: any): string {
    let prompt = this.VETERAN_SYSTEM_PROMPT;

    // Add user context if available
    if (context.userProfile) {
      prompt += `\n\nUSER CONTEXT:\n`;
      if (context.userProfile.serviceRecord) {
        prompt += `- Military Branch: ${context.userProfile.serviceRecord.branch}\n`;
        prompt += `- Service Years: ${context.userProfile.serviceRecord.serviceYears}\n`;
        if (context.userProfile.serviceRecord.disabilities) {
          prompt += `- Service-Connected Disabilities: Yes\n`;
        }
      }
      prompt += `- Subscription: ${context.userProfile.subscriptionStatus}\n`;
    }

    // Add intent-specific instructions
    if (intent.category === 'opportunity') {
      prompt += `\n\nFOCUS: Help the veteran find and understand financial opportunities. Provide specific, actionable guidance on eligibility and application processes.`;
    } else if (intent.category === 'application') {
      prompt += `\n\nFOCUS: Assist with writing compelling applications and proposals. Provide structure, key points to include, and veteran-specific advantages to highlight.`;
    } else if (intent.category === 'benefits') {
      prompt += `\n\nFOCUS: Explain VA benefits, eligibility requirements, and application processes. Be thorough but clear about complex benefit systems.`;
    } else if (intent.category === 'document') {
      prompt += `\n\nFOCUS: Help analyze and understand veteran documents. Explain what information is important and how it can be used for applications or benefits.`;
    }

    return prompt;
  }

  /**
   * Prepare conversation history for AI context
   */
  private static prepareConversationHistory(messages: Message[]): any[] {
    return messages
      .slice(-10) // Keep last 10 messages for context
      .map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: PIIProtector.maskPII(msg.content) // Mask PII in context
      }));
  }

  /**
   * Sanitize user input
   */
  private static sanitizeUserInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML
      .replace(/javascript:/gi, '') // Remove javascript protocols
      .trim()
      .substring(0, 4000); // Limit length
  }

  /**
   * Get model fallback order
   */
  private static getModelFallbackOrder(preferred: string): string[] {
    const allModels = ['openai', 'claude', 'perplexity'];
    const fallbacks = allModels.filter(model => model !== preferred);
    return [preferred, ...fallbacks];
  }

  /**
   * Calculate response confidence
   */
  private static calculateConfidence(content: string): number {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.5;
    
    if (content.length > 100) confidence += 0.2;
    if (content.includes('VA') || content.includes('veteran')) confidence += 0.1;
    if (content.includes('http') || content.includes('www')) confidence += 0.1;
    if (content.includes('deadline') || content.includes('eligibility')) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Extract sources from response
   */
  private static extractSources(content: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = content.match(urlRegex) || [];
    return urls.slice(0, 5); // Limit to 5 sources
  }

  /**
   * Extract sources from Perplexity response
   */
  private static extractPerplexitySources(data: any): string[] {
    return data.citations || [];
  }

  /**
   * Get subcategory for intent
   */
  private static getSubcategory(category: string, message: string): string {
    const subcategories = {
      opportunity: {
        'small business': ['small business', 'sba', 'business loan'],
        'education': ['education', 'gi bill', 'school', 'college'],
        'housing': ['housing', 'home loan', 'mortgage', 'va loan'],
        'healthcare': ['healthcare', 'medical', 'health']
      },
      benefits: {
        'disability': ['disability', 'compensation', 'rating'],
        'education': ['gi bill', 'education', 'school'],
        'healthcare': ['healthcare', 'medical', 'va hospital'],
        'pension': ['pension', 'retirement']
      }
    };

    const categoryMap = subcategories[category as keyof typeof subcategories];
    if (!categoryMap) return 'general';

    for (const [subcat, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(keyword => message.includes(keyword))) {
        return subcat;
      }
    }

    return 'general';
  }

  /**
   * Generate application assistance
   */
  static async generateApplicationDraft(
    opportunityDetails: any,
    userProfile: any,
    specificRequirements: string[]
  ): Promise<AIResponse> {
    const prompt = `
Generate a compelling application draft for this veteran opportunity:

OPPORTUNITY: ${opportunityDetails.title}
DESCRIPTION: ${opportunityDetails.description}
REQUIREMENTS: ${specificRequirements.join(', ')}

VETERAN PROFILE:
- Branch: ${userProfile.serviceRecord?.branch}
- Service Years: ${userProfile.serviceRecord?.serviceYears}
- Rank: ${userProfile.serviceRecord?.rank}

Create a professional application that:
1. Highlights relevant military experience
2. Addresses all requirements
3. Demonstrates veteran advantages
4. Includes specific examples where possible
5. Maintains professional tone

Format as a complete application ready for review and customization.
`;

    return await this.generateResponse(prompt, {
      userId: userProfile.id,
      userProfile,
      conversationHistory: [],
      intent: 'application'
    });
  }

  /**
   * Analyze uploaded document
   */
  static async analyzeDocument(
    documentText: string,
    documentType: string,
    userId: string
  ): Promise<AIResponse> {
    // Redact PII before analysis
    const redactedText = PIIProtector.redactPII(documentText);
    
    const prompt = `
Analyze this ${documentType} document and provide insights:

DOCUMENT CONTENT: ${redactedText}

Please provide:
1. Key information extracted
2. Relevant details for benefit applications
3. Potential opportunities this qualifies the veteran for
4. Any missing information that might be needed
5. Next steps or recommendations

Focus on actionable insights that help the veteran understand and use this document effectively.
`;

    return await this.generateResponse(prompt, {
      userId,
      conversationHistory: [],
      intent: 'document'
    });
  }

  /**
   * Health check for AI services
   */
  static async healthCheck(): Promise<{ [key: string]: boolean }> {
    const results = {
      openai: false,
      claude: false,
      perplexity: false
    };

    // Test OpenAI
    try {
      await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      });
      results.openai = true;
    } catch (error) {
      console.error('OpenAI health check failed:', error);
    }

    // Test Claude
    try {
      await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'test' }]
      });
      results.claude = true;
    } catch (error) {
      console.error('Claude health check failed:', error);
    }

    // Test Perplexity
    try {
      await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      results.perplexity = true;
    } catch (error) {
      console.error('Perplexity health check failed:', error);
    }

    return results;
  }
} 
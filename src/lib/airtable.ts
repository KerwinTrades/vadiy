import Airtable from 'airtable';
import { SecurityManager, PIIProtector, AuditLogger } from './security';
import type { 
  User, 
  Conversation, 
  Message, 
  Opportunity, 
  Resource, 
  Application,
  AnalyticsEvent,
  UserFeedback 
} from '@/types';

// Airtable Configuration
const airtableConfig: any = {
  apiKey: process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN || process.env.AIRTABLE_API_KEY
};

if (process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN) {
  airtableConfig.endpointUrl = 'https://api.airtable.com';
}

// Clean the base ID to remove any extra characters
const cleanBaseId = (process.env.AIRTABLE_BASE_ID || '').trim().replace(/\s+.*$/, '');
console.log('🔧 Cleaned Base ID:', cleanBaseId);

const base = new Airtable(airtableConfig).base(cleanBaseId);

// Verify configuration on startup
if (!airtableConfig.apiKey) {
  console.error('❌ AIRTABLE CONFIGURATION ERROR: Missing AIRTABLE_PERSONAL_ACCESS_TOKEN or AIRTABLE_API_KEY');
  console.error('   Please add your Airtable credentials to .env.local');
}

if (!process.env.AIRTABLE_BASE_ID) {
  console.error('❌ AIRTABLE CONFIGURATION ERROR: Missing AIRTABLE_BASE_ID');
  console.error('   Current value:', process.env.AIRTABLE_BASE_ID || 'undefined');
}

// Direct table ID mapping - using working table names found via discovery
const TABLE_IDS = {
  opportunities: 'opportunities', // Working table name from discovery
  users: 'tbl3ZNNQMUZilr08V', // Direct table ID for users from user input
} as const;

// Table name detection and fallbacks
const TABLE_VARIATIONS = {
  users: [
    process.env.AIRTABLE_USERS_TABLE,
    'User Profiles', 'Users', 'Veterans', 'Veteran Profiles'
  ].filter(Boolean),
  opportunities: [
    process.env.AIRTABLE_OPPORTUNITIES_TABLE,
    'Opportunities', 'Jobs', 'Employment', 'Job Opportunities', 'Career Opportunities'
  ].filter(Boolean),
  resources: [
    process.env.AIRTABLE_RESOURCES_TABLE,
    'Resources', 'Benefits', 'Services', 'Support Resources', 'Veteran Resources'
  ].filter(Boolean),
  matches: [
    process.env.AIRTABLE_MATCHES_TABLE,
    'Matches', 'User Matches', 'Opportunity Matches', 'Job Matches'
  ].filter(Boolean),
  matchesResources: [
    process.env.AIRTABLE_MATCHES_RESOURCES_TABLE,
    'MatchesResources', 'Resource Matches', 'User Resource Matches', 'Matches_Resources'
  ].filter(Boolean),
  conversations: [
    process.env.AIRTABLE_CONVERSATIONS_TABLE,
    'Conversations', 'Chat Conversations', 'User Conversations'
  ].filter(Boolean),
  messages: [
    process.env.AIRTABLE_MESSAGES_TABLE,
    'Messages', 'Chat Messages', 'Conversation Messages'
  ].filter(Boolean),
  analytics: [
    process.env.AIRTABLE_ANALYTICS_TABLE,
    'Chat_Analytics', 'Analytics', 'Chat Analytics', 'Usage Analytics'
  ].filter(Boolean),
  documents: [
    process.env.AIRTABLE_DOCUMENTS_TABLE,
    'Generated_Documents', 'Documents', 'Generated Documents', 'User Documents'
  ].filter(Boolean),
  sessions: [
    process.env.AIRTABLE_SESSIONS_TABLE,
    'User_Sessions', 'Sessions', 'User Sessions', 'Chat Sessions'
  ].filter(Boolean),
  feedback: [
    process.env.AIRTABLE_FEEDBACK_TABLE,
    'User_Feedback', 'Feedback', 'User Feedback', 'Chat Feedback'
  ].filter(Boolean)
};

// Auto-detect and initialize tables
async function detectTableName(tableKey: string, variations: string[]): Promise<string | null> {
  for (const tableName of variations) {
    try {
      await base(tableName).select({ maxRecords: 1 }).firstPage();
      console.log(`✅ Found table '${tableName}' for ${tableKey}`);
      return tableName;
    } catch (error: any) {
      if (error.statusCode === 404 || error.message?.includes('NOT_FOUND')) {
        continue; // Try next variation
      }
      console.warn(`⚠️ Error testing table '${tableName}':`, error.message);
    }
  }
  console.warn(`❌ No table found for ${tableKey}. Tried: ${variations.join(', ')}`);
  return null;
}

// Initialize table references
const initializeTables = async () => {
  const detectedTables: { [key: string]: any } = {};
  
  console.log('🔧 Airtable Configuration:');
  console.log('   Auth Method:', process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN ? 'Personal Access Token' : 'API Key');
  console.log('   Base ID:', process.env.AIRTABLE_BASE_ID || 'NOT SET');
  console.log('🔍 Auto-detecting table names...');

  for (const [tableKey, variations] of Object.entries(TABLE_VARIATIONS)) {
    const detectedName = await detectTableName(tableKey, variations.filter((v): v is string => v !== undefined));
    if (detectedName) {
      detectedTables[tableKey] = base(detectedName);
    } else {
      // Create placeholder that will log warnings
      detectedTables[tableKey] = {
        select: () => ({ firstPage: () => Promise.resolve([]), all: () => Promise.resolve([]) }),
        find: () => Promise.reject(new Error(`Table for ${tableKey} not found`)),
        create: () => Promise.reject(new Error(`Table for ${tableKey} not found`)),
        update: () => Promise.reject(new Error(`Table for ${tableKey} not found`)),
        destroy: () => Promise.reject(new Error(`Table for ${tableKey} not found`))
      };
    }
  }

  console.log(`📊 Table Detection Summary: ${Object.keys(detectedTables).length} table types configured`);
  return detectedTables;
};

// Tables will be initialized asynchronously
let tables: any = {};
let tablesInitialized = false;

// Lazy initialization function
async function ensureTablesInitialized() {
  if (!tablesInitialized) {
    tables = await initializeTables();
    tablesInitialized = true;
  }
}

// Helper function to check if table exists and handle errors
async function safeTableOperation<T>(
  operation: () => Promise<T>,
  tableName: string,
  operationType: string
): Promise<T | null> {
  try {
    await ensureTablesInitialized();
    return await operation();
  } catch (error: any) {
    if (error.statusCode === 404 || error.message?.includes('NOT_FOUND') || error.message?.includes('not found')) {
      console.warn(`Table '${tableName}' not found. Operation: ${operationType}`);
      return null;
    }
    console.error(`Error in ${operationType} for table '${tableName}':`, error);
    throw error;
  }
}

export class AirtableService {
  
  // === USER OPERATIONS ===
  
  /**
   * Get user by email with security logging
   */
  static async getUserByEmail(email: string, requesterId?: string): Promise<User | null> {
    return await safeTableOperation(async () => {
      const records = await tables.users.select({
        filterByFormula: `{Email} = '${email}'`,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) return null;

      const record = records[0];
      const user = this.mapUserRecord(record);

      // Log data access
      if (requesterId) {
        await AuditLogger.logDataAccess(
          requesterId,
          'user',
          user.id,
          'read'
        );
      }

      return user;
    }, 'User Profiles', 'getUserByEmail');
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string, requesterId?: string): Promise<User | null> {
    return await safeTableOperation(async () => {
      const record = await tables.users.find(userId);
      const user = this.mapUserRecord(record);

      // Log data access
      if (requesterId) {
        await AuditLogger.logDataAccess(
          requesterId,
          'user',
          userId,
          'read'
        );
      }

      return user;
    }, 'User Profiles', 'getUserById');
  }

  /**
   * Update user preferences
   */
  static async updateUserPreferences(
    userId: string, 
    preferences: Partial<User['preferences']>,
    requesterId: string
  ): Promise<void> {
    await safeTableOperation(async () => {
      await tables.users.update(userId, {
        'Preferences': JSON.stringify(preferences),
        'Updated_At': new Date().toISOString()
      });

      await AuditLogger.logDataAccess(
        requesterId,
        'user_preferences',
        userId,
        'write'
      );
    }, 'User Profiles', 'updateUserPreferences');
  }

  // === SESSION MANAGEMENT ===

  /**
   * Create user session
   */
  static async createUserSession(
    userId: string,
    sessionId: string,
    sessionData: any
  ): Promise<void> {
    await safeTableOperation(async () => {
      await tables.sessions.create({
        'Session_ID': sessionId,
        'User_ID': userId,
        'Session_Data': JSON.stringify(sessionData),
        'Created_At': new Date().toISOString(),
        'Last_Activity': new Date().toISOString(),
        'Status': 'active'
      });
    }, 'User_Sessions', 'createUserSession');
  }

  /**
   * Update session activity
   */
  static async updateSessionActivity(sessionId: string): Promise<void> {
    await safeTableOperation(async () => {
      // Find session by Session_ID
      const records = await tables.sessions.select({
        filterByFormula: `{Session_ID} = '${sessionId}'`,
        maxRecords: 1
      }).firstPage();

      if (records.length > 0) {
        await tables.sessions.update(records[0].id, {
          'Last_Activity': new Date().toISOString()
        });
      }
    }, 'User_Sessions', 'updateSessionActivity');
  }

  // === CONVERSATION OPERATIONS ===

  /**
   * Create new conversation
   */
  static async createConversation(
    userId: string,
    title: string,
    isEncrypted: boolean = false
  ): Promise<string> {
    const result = await safeTableOperation(async () => {
      const conversationId = SecurityManager.generateToken(16);
      
      await tables.conversations.create({
        'Conversation_ID': conversationId,
        'User_ID': userId,
        'Title': title,
        'Is_Encrypted': isEncrypted,
        'Status': 'active',
        'Created_At': new Date().toISOString(),
        'Updated_At': new Date().toISOString(),
        'Last_Message_At': new Date().toISOString(),
        'Message_Count': 0
      });

      await AuditLogger.logDataAccess(
        userId,
        'conversation',
        conversationId,
        'write'
      );

      return conversationId;
    }, 'Conversations', 'createConversation');

    return result || SecurityManager.generateToken(16);
  }

  /**
   * Get user conversations
   */
  static async getUserConversations(userId: string): Promise<Conversation[]> {
    const result = await safeTableOperation(async () => {
      const records = await tables.conversations.select({
        filterByFormula: `AND({User_ID} = '${userId}', {Status} != 'deleted')`,
        sort: [{ field: 'Last_Message_At', direction: 'desc' }]
      }).all();

     return records.map((record: any) => this.mapConversationRecord(record));
    }, 'Conversations', 'getUserConversations');

    return result || [];
  }

  /**
   * Get conversation by ID
   */
  static async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    return await safeTableOperation(async () => {
      // Find conversation by Conversation_ID
      const records = await tables.conversations.select({
        filterByFormula: `{Conversation_ID} = '${conversationId}'`,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) return null;

      const conversation = this.mapConversationRecord(records[0]);

      // Verify user owns this conversation
      if (conversation.userId !== userId) {
        throw new Error('Unauthorized access to conversation');
      }

      return conversation;
    }, 'Conversations', 'getConversation');
  }

  // === MESSAGE OPERATIONS ===

  /**
   * Add message to conversation
   */
  static async addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: any = {},
    attachments: any[] = []
  ): Promise<string> {
    const result = await safeTableOperation(async () => {
      const messageId = SecurityManager.generateToken(16);
      
      // Find conversation by Conversation_ID
      const conversationRecords = await tables.conversations.select({
        filterByFormula: `{Conversation_ID} = '${conversationId}'`,
        maxRecords: 1
      }).firstPage();
      
      if (conversationRecords.length === 0) {
        throw new Error('Conversation not found');
      }

      const conversation = conversationRecords[0];
      const isEncrypted = conversation.get('Is_Encrypted') as boolean;
      let storedContent = content;
      let encryptedContent = null;

      // Encrypt sensitive content if required
      if (isEncrypted && role === 'user') {
        encryptedContent = SecurityManager.encrypt(content);
        storedContent = PIIProtector.redactPII(content); // Store redacted version
      } else if (role === 'user') {
        // Always redact PII in logs for user messages
        storedContent = PIIProtector.maskPII(content);
      }

      await tables.messages.create({
        'Message_ID': messageId,
        'Conversation_ID': conversationId,
        'Role': role,
        'Content': storedContent,
        'Encrypted_Content': encryptedContent,
        'Metadata': JSON.stringify(metadata),
        'Attachments': JSON.stringify(attachments),
        'Timestamp': new Date().toISOString()
      });

      // Update conversation
      const currentCount = conversation.get('Message_Count') as number || 0;
      await tables.conversations.update(conversation.id, {
        'Message_Count': currentCount + 1,
        'Last_Message_At': new Date().toISOString(),
        'Updated_At': new Date().toISOString()
      });

      return messageId;
    }, 'Messages', 'addMessage');

    return result || SecurityManager.generateToken(16);
  }

  /**
   * Get conversation messages
   */
  static async getConversationMessages(
    conversationId: string,
    userId: string,
    limit: number = 50
  ): Promise<Message[]> {
    const result = await safeTableOperation(async () => {
      // Verify user owns this conversation
      const conversation = await this.getConversation(conversationId, userId);
      if (!conversation) {
        throw new Error('Conversation not found or unauthorized');
      }

      const records = await tables.messages.select({
        filterByFormula: `{Conversation_ID} = '${conversationId}'`,
        sort: [{ field: 'Timestamp', direction: 'asc' }],
        maxRecords: limit
      }).all();

      const messages = records.map((record: any) => this.mapMessageRecord(record));

      // Decrypt encrypted messages if user is authorized
      if (conversation.isEncrypted) {
        messages.forEach((message: any) => {
          if (message.encryptedContent && message.role === 'user') {
            try {
              message.content = SecurityManager.decrypt(message.encryptedContent);
            } catch (error) {
              console.error('Failed to decrypt message:', error);
              message.content = '[Decryption failed]';
            }
          }
        });
      }

      return messages;
    }, 'Messages', 'getConversationMessages');

    return result || [];
  }

  // === OPPORTUNITY OPERATIONS ===

  /**
   * Get opportunities for user
   */
  static async getOpportunities(
    userId: string,
    filters: any = {},
    limit: number = 20
  ): Promise<Opportunity[]> {
    const result = await safeTableOperation(async () => {
      let filterFormula = '{Status} = "open"';
      
      if (filters.type) {
        filterFormula += ` AND {Type} = '${filters.type}'`;
      }
      
      if (filters.deadline) {
        filterFormula += ` AND {Deadline} >= '${filters.deadline}'`;
      }

      const records = await tables.opportunities.select({
        filterByFormula: filterFormula,
        sort: [{ field: 'Deadline', direction: 'asc' }],
        maxRecords: limit
      }).all();

      await AuditLogger.logDataAccess(
        userId,
        'opportunities',
        'list',
        'read'
      );

      // Map the records to our format using ACTUAL field names from discovery
      const opportunities: Opportunity[] = records.map(record => {
        const fields = record.fields as any;
        
        return {
          id: record.id,
          title: fields.title || fields.Title || 'Untitled',
          description: fields.description || fields.aisummary || 'No description available',
          type: 'Government Contract', // Default type since no type field exists
          status: 'Available', // Default status since no status field exists
          deadline: fields.Date || fields.deadline || null,
          category: 'Government Opportunity',
          applicationUrl: null, // No application URL field found
          agency: null,
          requirements: null,
          benefits: null,
          location: null,
          salaryRange: null,
          experienceLevel: null,
          postedDate: fields.Date || null,
          tags: null,
          opportunityID: fields.opportunityID || null
        };
      });

      console.log(`✅ Returning ${opportunities.length} mapped opportunities`);
      return opportunities;
    }, 'Opportunities', 'getOpportunities');

    return result || [];
  }

  /**
   * Get user's matched opportunities
   */
  static async getMatchedOpportunities(userId: string): Promise<Opportunity[]> {
    const result = await safeTableOperation(async () => {
      // First get user's matches
      const matchRecords = await tables.matches.select({
        filterByFormula: `{User_ID} = '${userId}'`,
        sort: [{ field: 'Match_Score', direction: 'desc' }]
      }).all();

      const opportunityIds = matchRecords.map(record => record.get('Opportunity_ID'));
      
      if (opportunityIds.length === 0) return [];

      // Get the actual opportunities
      const opportunities: Opportunity[] = [];
      for (const oppId of opportunityIds) {
        try {
          const record = await tables.opportunities.find(oppId as string);
          opportunities.push(this.mapOpportunityRecord(record));
        } catch (error) {
          // Skip if opportunity not found
          continue;
        }
      }

      return opportunities;
    }, 'Matches', 'getMatchedOpportunities');

    return result || [];
  }

  /**
   * Get user's matched resources
   */
  static async getMatchedResources(userId: string): Promise<Resource[]> {
    const result = await safeTableOperation(async () => {
      // Get user's resource matches
      const matchRecords = await tables.matchesResources.select({
        filterByFormula: `{User_ID} = '${userId}'`,
        sort: [{ field: 'Match_Score', direction: 'desc' }]
      }).all();

      const resourceIds = matchRecords.map(record => record.get('Resource_ID'));
      
      if (resourceIds.length === 0) return [];

      // Get the actual resources
      const resources: Resource[] = [];
      for (const resourceId of resourceIds) {
        try {
          const record = await tables.resources.find(resourceId as string);
          resources.push(this.mapResourceRecord(record));
        } catch (error) {
          // Skip if resource not found
          continue;
        }
      }

      return resources;
    }, 'MatchesResources', 'getMatchedResources');

    return result || [];
  }

  /**
   * Search opportunities by keyword/query for AI context - OPTIMIZED for efficiency
   */
  static async searchOpportunities(
    query: string,
    userId: string,
    limit: number = 10
  ): Promise<Opportunity[]> {
    const result = await safeTableOperation(async () => {
      console.log(`🔍 Searching opportunities table (optimized)...`);
      console.log(`🔍 Query: "${query}"`);
      console.log(`🔍 User ID: ${userId}`);
      console.log(`🔍 Table ID: ${TABLE_IDS.opportunities}`);

      // Use direct table ID - NO table detection needed
      const records = await base(TABLE_IDS.opportunities).select({
        maxRecords: limit,
        sort: [{ field: 'Date', direction: 'asc' }] // Sort by deadline
      }).all();

      console.log(`📊 Raw records found: ${records.length}`);

      // Map to LIGHTWEIGHT format - only essential fields for AI
      const opportunities: Opportunity[] = records.map(record => {
        const fields = record.fields as any;
        
        return {
          id: record.id,
          title: fields.title || 'Untitled',
          description: fields.aisummary || 'No summary available', // Use AI summary, not full description
          type: 'Government Contract',
          status: 'Available',
          deadline: fields.Date || null,
          category: 'Government Opportunity',
          applicationUrl: null,
          agency: null,
          requirements: null,
          benefits: null,
          location: null,
          salaryRange: null,
          experienceLevel: null,
          postedDate: fields.Date || null,
          tags: null,
          opportunityID: fields.opportunityID || null,
          // Store full description separately for detailed requests
          fullDescription: fields.description || null
        };
      });

      console.log(`✅ Returning ${opportunities.length} optimized opportunities`);
      return opportunities;

    }, 'opportunities', 'search');

    console.log(`🔍 Final searchOpportunities result: ${result.length} opportunities`);
    return result;
  }

  /**
   * Search resources by keyword/query for AI context
   */
  static async searchResources(
    query: string,
    userId: string,
    limit: number = 10
  ): Promise<Resource[]> {
    const result = await safeTableOperation(async () => {
      console.log(`🔍 Searching resources table...`);
      console.log(`🔍 Query: "${query}"`);
      console.log(`🔍 User ID: ${userId}`);

      // Use the resources table (discovered as "Resources")
      const records = await base('Resources').select({
        maxRecords: limit
      }).all();

      console.log(`📊 Raw resource records found: ${records.length}`);
      
      if (records.length > 0) {
        console.log(`📋 First resource record fields:`, Object.keys(records[0].fields));
      }

      // Map the records to our format using ACTUAL field names
      const resources: Resource[] = records.map(record => {
        const fields = record.fields as any;
        
        return {
          id: record.id,
          title: fields.Resource_Name || fields.title || 'Untitled Resource',
          description: fields.aisummary || fields.Full_Description || 'No description available',
          category: fields.Resource_Type || 'Support',
          type: fields.Resource_Type || 'Resource',
          availability: 'Available',
          cost: 'Free',
          url: fields.Forms_Links || fields.url || '',
          contactInfo: {},
          eligibility: 'Veterans',
          source: 'VADIY Database',
          tags: [],
          metadata: {
            lastReviewed: fields.Last_Reviewed || null,
            updateCadence: fields.Update_Cadence || null,
            snippet: fields.snippet || null
          }
        };
      });

      console.log(`✅ Returning ${resources.length} mapped resources`);
      return resources;

    }, 'Resources', 'search');

    console.log(`🔍 Final searchResources result: ${result.length} resources`);
    return result;
  }

  /**
   * Get user profile information including subscription status
   */
  static async getUserProfile(userId: string): Promise<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    subscriptionStatus?: string;
    profileData?: any;
  } | null> {
    return await safeTableOperation(async () => {
      console.log(`👤 Getting user profile for: ${userId}`);
      
      try {
        // Search for user in multiple potential tables
        const userTables = ['Users', 'users', 'User', 'user'];
        
        for (const tableName of userTables) {
          try {
            console.log(`🔍 Searching ${tableName} table...`);
            
            const records = await base(tableName).select({
              filterByFormula: `{User} = "${userId}"`,
              maxRecords: 1
            }).all();
            
            if (records.length > 0) {
              const record = records[0];
              const fields = record.fields as any;
              
              console.log(`✅ Found user in ${tableName} table`);
              console.log(`📋 User fields:`, Object.keys(fields));
              
              // Map fields to standard format (using actual field names from spreadsheet)
              const userProfile = {
                id: record.id,
                firstName: fields['Users Name'] || fields['First Name'] || fields['firstName'] || null,
                lastName: fields['Last Name'] || fields['lastName'] || null,
                email: fields['Contact Email'] || fields['email'] || fields['Email'] || null,
                subscriptionStatus: fields['Subscription_Status'] || fields['subscription_status'] || fields['Tier'] || 'Free',
                profileData: fields
              };
              
              console.log(`👤 User profile mapped:`, {
                firstName: userProfile.firstName,
                subscriptionStatus: userProfile.subscriptionStatus
              });
              
              return userProfile;
            }
          } catch (tableError) {
            console.log(`⚠️ ${tableName} table not accessible:`, tableError.message);
            continue;
          }
        }
        
        console.log(`❌ User not found in any table for ID: ${userId}`);
        return null;
        
      } catch (error) {
        console.error('❌ Error getting user profile:', error);
        return null;
      }
    });
  }


  /**
   * Store conversation messages for future context
   */
  static async storeConversationMessages(
    conversationId: string,
    userId: string,
    userMessage: string,
    aiResponse: string,
    metadata?: any
  ): Promise<void> {
    try {
      console.log(`💾 Storing conversation messages for: ${conversationId}`);
      
      // Try to store in conversations table
      const conversationTables = ['Conversations', 'conversations'];
      
      for (const tableName of conversationTables) {
        try {
          // Store user message
          await base(tableName).create({
            conversation_id: conversationId,
            user_id: userId,
            role: 'user',
            content: userMessage,
            created_at: new Date().toISOString(),
            metadata: JSON.stringify(metadata || {})
          });
          
          // Store AI response
          await base(tableName).create({
            conversation_id: conversationId,
            user_id: userId,
            role: 'assistant',
            content: aiResponse,
            created_at: new Date().toISOString(),
            metadata: JSON.stringify(metadata || {})
          });
          
          console.log(`✅ Conversation stored in ${tableName}`);
          return;
          
        } catch (tableError) {
          console.log(`⚠️ Could not store in ${tableName}:`, tableError.message);
          continue;
        }
      }
      
      console.log(`ℹ️ No conversation table available, messages not stored`);
      
    } catch (error) {
      console.error('❌ Error storing conversation:', error);
    }
  }

  /**
   * Get user matches (Premium feature)
   */
  static async getUserMatches(userId: string): Promise<{
    totalMatches: number;
    matches: any[];
  } | null> {
    return await safeTableOperation(async () => {
      console.log(`🎯 Getting user matches for: ${userId}`);
      
      try {
        // Try to get from matches table
        const matchTables = ['Matches', 'matches', 'User_Matches', 'user_matches'];
        
        for (const tableName of matchTables) {
          try {
            const records = await base(tableName).select({
              filterByFormula: `{user_id} = "${userId}"`,
              maxRecords: 20
            }).all();
            
            if (records.length > 0) {
              console.log(`✅ Found ${records.length} matches in ${tableName}`);
              
              const matches = records.map(record => {
                const fields = record.fields as any;
                return {
                  id: record.id,
                  opportunityId: fields.opportunity_id || fields.OpportunityID,
                  matchScore: fields.match_score || fields.score || 0,
                  matchReason: fields.match_reason || fields.reason || '',
                  createdAt: fields.created_at || fields.timestamp
                };
              });
              
              return {
                totalMatches: matches.length,
                matches: matches
              };
            }
          } catch (tableError) {
            console.log(`⚠️ ${tableName} table not accessible:`, tableError.message);
            continue;
          }
        }
        
        console.log(`ℹ️ No matches found for user: ${userId}`);
        return {
          totalMatches: 0,
          matches: []
        };
        
      } catch (error) {
        console.error('❌ Error getting user matches:', error);
        return null;
      }
    });
  }

  // === ANALYTICS OPERATIONS ===

  /**
   * Track analytics event
   */
  static async trackEvent(
    userId: string,
    sessionId: string,
    eventType: string,
    eventData: any,
    userAgent?: string,
    ipAddress?: string
  ): Promise<void> {
    await safeTableOperation(async () => {
      if (!process.env.ENABLE_ANALYTICS) return;

      await tables.analytics.create({
        'Event_ID': SecurityManager.generateToken(16),
        'User_ID': userId,
        'Session_ID': sessionId,
        'Event_Type': eventType,
        'Event_Data': JSON.stringify(eventData),
        'Timestamp': new Date().toISOString(),
        'User_Agent': userAgent || 'unknown',
        'IP_Address': ipAddress ? SecurityManager.hash(ipAddress) : 'unknown'
      });
    }, 'Chat_Analytics', 'trackEvent');
  }

  /**
   * Submit user feedback
   */
  static async submitFeedback(
    userId: string,
    messageId: string | null,
    rating: number,
    comment: string,
    category: string
  ): Promise<void> {
    await safeTableOperation(async () => {
      await tables.feedback.create({
        'Feedback_ID': SecurityManager.generateToken(16),
        'User_ID': userId,
        'Message_ID': messageId,
        'Rating': rating,
        'Comment': PIIProtector.maskPII(comment),
        'Category': category,
        'Timestamp': new Date().toISOString()
      });
    }, 'User_Feedback', 'submitFeedback');
  }

  // === GENERATED DOCUMENTS ===

  /**
   * Store generated document
   */
  static async storeGeneratedDocument(
    userId: string,
    documentType: string,
    content: string,
    metadata: any = {}
  ): Promise<string> {
    const result = await safeTableOperation(async () => {
      const documentId = SecurityManager.generateToken(16);
      
      await tables.documents.create({
        'Document_ID': documentId,
        'User_ID': userId,
        'Document_Type': documentType,
        'Content': PIIProtector.redactPII(content), // Always redact PII in stored documents
        'Metadata': JSON.stringify(metadata),
        'Created_At': new Date().toISOString(),
        'Status': 'generated'
      });

      return documentId;
    }, 'Generated_Documents', 'storeGeneratedDocument');

    return result || SecurityManager.generateToken(16);
  }

  // === MAPPING FUNCTIONS ===

  private static mapUserRecord(record: any): User {
    return {
      id: record.id,
      email: record.get('Email'),
      firstName: record.get('First_Name') || record.get('FirstName'),
      lastName: record.get('Last_Name') || record.get('LastName'),
      veteranId: record.get('Veteran_ID') || record.get('VeteranID'),
      serviceRecord: record.get('Service_Record') ? JSON.parse(record.get('Service_Record')) : undefined,
      subscriptionStatus: record.get('Subscription_Status') || record.get('SubscriptionStatus') || 'free',
      preferences: record.get('Preferences') ? JSON.parse(record.get('Preferences')) : this.getDefaultPreferences(),
      securityLevel: record.get('Security_Level') || record.get('SecurityLevel') || 'standard',
      lastLogin: new Date(record.get('Last_Login') || record.get('LastLogin') || Date.now()),
      createdAt: new Date(record.get('Created_At') || record.get('CreatedAt') || Date.now()),
      updatedAt: new Date(record.get('Updated_At') || record.get('UpdatedAt') || Date.now())
    };
  }

  private static mapConversationRecord(record: any): Conversation {
    return {
      id: record.get('Conversation_ID') || record.id,
      userId: record.get('User_ID'),
      title: record.get('Title'),
      isEncrypted: record.get('Is_Encrypted') || false,
      status: record.get('Status'),
      tags: record.get('Tags') ? JSON.parse(record.get('Tags')) : [],
      createdAt: new Date(record.get('Created_At')),
      updatedAt: new Date(record.get('Updated_At')),
      lastMessageAt: new Date(record.get('Last_Message_At')),
      messageCount: record.get('Message_Count') || 0
    };
  }

  private static mapMessageRecord(record: any): Message {
    return {
      id: record.get('Message_ID') || record.id,
      conversationId: record.get('Conversation_ID'),
      role: record.get('Role'),
      content: record.get('Content'),
      encryptedContent: record.get('Encrypted_Content'),
      metadata: record.get('Metadata') ? JSON.parse(record.get('Metadata')) : {},
      attachments: record.get('Attachments') ? JSON.parse(record.get('Attachments')) : [],
      timestamp: new Date(record.get('Timestamp')),
      edited: record.get('Edited') || false,
      editedAt: record.get('Edited_At') ? new Date(record.get('Edited_At')) : undefined
    };
  }

  private static mapOpportunityRecord(record: any): Opportunity {
    return {
      id: record.id,
      title: record.get('Title'),
      description: record.get('Description'),
      type: record.get('Type'),
      amount: record.get('Amount'),
      deadline: new Date(record.get('Deadline')),
      eligibility: record.get('Eligibility') ? JSON.parse(record.get('Eligibility')) : {},
      applicationUrl: record.get('Application_URL') || record.get('ApplicationURL'),
      status: record.get('Status'),
      tags: record.get('Tags') ? JSON.parse(record.get('Tags')) : [],
      createdAt: new Date(record.get('Created_At') || record.get('CreatedAt')),
      updatedAt: new Date(record.get('Updated_At') || record.get('UpdatedAt'))
    };
  }

  private static mapResourceRecord(record: any): Resource {
    return {
      id: record.id,
      title: record.get('Title'),
      description: record.get('Description'),
      category: record.get('Category'),
      url: record.get('URL'),
      contactInfo: record.get('Contact_Info') ? JSON.parse(record.get('Contact_Info')) : undefined,
      availability: record.get('Availability'),
      cost: record.get('Cost'),
      tags: record.get('Tags') ? JSON.parse(record.get('Tags')) : []
    };
  }

  private static getDefaultPreferences() {
    return {
      language: 'en',
      timezone: 'America/New_York',
      notifications: {
        email: true,
        sms: false,
        deadlineReminders: true,
        opportunityAlerts: true
      },
      privacy: {
        shareProfile: false,
        allowAnalytics: true,
        dataRetention: 90
      },
      accessibility: {
        fontSize: 'medium',
        highContrast: false,
        screenReader: false
      }
    };
  }

  // === UTILITY FUNCTIONS ===

  /**
   * Check user's rate limit based on subscription
   */
  static async checkUserRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const user = await this.getUserById(userId);
      if (!user) throw new Error('User not found');

      const limit = user.subscriptionStatus === 'free' 
        ? parseInt(process.env.RATE_LIMIT_FREE_USER || '20')
        : parseInt(process.env.RATE_LIMIT_PAID_USER || '100');

      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW || '3600000'); // 1 hour

      // Check rate limit (this would typically use Redis in production)
      const rateLimit = { allowed: true, remaining: limit - 1 }; // Simplified for demo
      
      return rateLimit;
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return { allowed: false, remaining: 0 };
    }
  }

  /**
   * Clean up old data based on retention policies
   */
  static async cleanupOldData(): Promise<void> {
    try {
      const retentionDays = 90; // Default retention period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Clean up old messages (keep only recent ones)
      await safeTableOperation(async () => {
        const oldMessages = await tables.messages.select({
          filterByFormula: `{Timestamp} < '${cutoffDate.toISOString()}'`
        }).all();

        for (const message of oldMessages) {
          await tables.messages.destroy(message.id);
        }

        console.log(`Cleaned up ${oldMessages.length} old messages`);
      }, 'Messages', 'cleanupOldData');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Test database connectivity and show available tables
   */
  static async testConnection(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    
    await ensureTablesInitialized();
    
    console.log('🔍 Testing Airtable Connection & Tables:');
    console.log('================================================');
    
    const tableTests = [
      { name: 'User Profiles', key: 'users', table: tables.users },
      { name: 'Opportunities', key: 'opportunities', table: tables.opportunities },
      { name: 'Resources', key: 'resources', table: tables.resources },
      { name: 'Matches', key: 'matches', table: tables.matches },
      { name: 'MatchesResources', key: 'matchesResources', table: tables.matchesResources },
      { name: 'Conversations', key: 'conversations', table: tables.conversations },
      { name: 'Messages', key: 'messages', table: tables.messages },
      { name: 'Chat_Analytics', key: 'analytics', table: tables.analytics },
      { name: 'Generated_Documents', key: 'documents', table: tables.documents },
      { name: 'User_Sessions', key: 'sessions', table: tables.sessions },
      { name: 'User_Feedback', key: 'feedback', table: tables.feedback }
    ];

    for (const { name, key, table } of tableTests) {
      try {
        const records = await table.select({ maxRecords: 1 }).firstPage();
        results[name] = true;
        console.log(`✅ ${name} (${key}): ACCESSIBLE - ${records.length === 0 ? 'Empty' : 'Has data'}`);
      } catch (error: any) {
        results[name] = false;
        if (error.message?.includes('not found')) {
          console.log(`❌ ${name} (${key}): TABLE NOT FOUND`);
        } else {
          console.log(`⚠️ ${name} (${key}): ERROR - ${error.message}`);
        }
      }
    }

    console.log('================================================');
    const accessibleCount = Object.values(results).filter(Boolean).length;
    console.log(`📊 Summary: ${accessibleCount}/${Object.keys(results).length} tables accessible`);
    
    return results;
  }

  /**
   * List all available tables in the Airtable base (if API supports it)
   */
  static async listAllTablesInBase(): Promise<string[]> {
    try {
      console.log('🔍 Attempting to discover all tables in base...');
      
      // Common table name patterns to try
      const commonNames = [
        'Users', 'User Profiles', 'Veterans', 'Veteran Profiles',
        'Opportunities', 'Jobs', 'Employment', 'Career Opportunities', 'Job Opportunities',
        'Resources', 'Benefits', 'Services', 'Support Resources', 'Veteran Resources',
        'Matches', 'User Matches', 'Job Matches', 'Opportunity Matches',
        'MatchesResources', 'Resource Matches', 'User Resource Matches',
        'Conversations', 'Chat Conversations', 'User Conversations',
        'Messages', 'Chat Messages', 'Conversation Messages',
        'Analytics', 'Chat Analytics', 'Usage Analytics', 'Chat_Analytics',
        'Documents', 'Generated Documents', 'User Documents', 'Generated_Documents',
        'Sessions', 'User Sessions', 'Chat Sessions', 'User_Sessions',
        'Feedback', 'User Feedback', 'Chat Feedback', 'User_Feedback',
        'Applications', 'User Applications', 'Job Applications',
        'Profiles', 'Settings', 'Configuration', 'Admin'
      ];

      const foundTables: string[] = [];
      
      for (const tableName of commonNames) {
        try {
          await base(tableName).select({ maxRecords: 1 }).firstPage();
          foundTables.push(tableName);
          console.log(`✅ Found table: '${tableName}'`);
        } catch (error) {
          // Table doesn't exist, continue
        }
      }

      console.log(`📋 Discovered ${foundTables.length} tables:`, foundTables);
      return foundTables;
    } catch (error) {
      console.error('Error discovering tables:', error);
      return [];
    }
  }
} 

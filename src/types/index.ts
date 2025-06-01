// === USER & AUTHENTICATION TYPES ===
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  veteranId?: string;
  serviceRecord?: ServiceRecord;
  subscriptionStatus: 'free' | 'paid' | 'premium';
  preferences: UserPreferences;
  securityLevel: 'standard' | 'enhanced';
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceRecord {
  branch: 'army' | 'navy' | 'air-force' | 'marines' | 'coast-guard' | 'space-force';
  rank: string;
  serviceYears: number;
  dischargeType: string;
  disabilities?: string[];
  securityClearance?: string;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  accessibility: AccessibilitySettings;
}

export interface NotificationSettings {
  email: boolean;
  sms: boolean;
  deadlineReminders: boolean;
  opportunityAlerts: boolean;
}

export interface PrivacySettings {
  shareProfile: boolean;
  allowAnalytics: boolean;
  dataRetention: number; // days
}

export interface AccessibilitySettings {
  fontSize: 'small' | 'medium' | 'large';
  highContrast: boolean;
  screenReader: boolean;
}

// === CONVERSATION & MESSAGING TYPES ===
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  isEncrypted: boolean;
  status: 'active' | 'archived' | 'deleted';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  encryptedContent?: string;
  metadata: MessageMetadata;
  attachments?: FileAttachment[];
  timestamp: Date;
  edited?: boolean;
  editedAt?: Date;
}

export interface MessageMetadata {
  aiModel?: 'openai' | 'claude' | 'perplexity';
  responseTime?: number;
  tokenCount?: number;
  confidence?: number;
  sources?: string[];
  intent?: MessageIntent;
}

export interface MessageIntent {
  category: 'opportunity' | 'resource' | 'application' | 'general' | 'document';
  subcategory?: string;
  entities?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// === FILE & DOCUMENT TYPES ===
export interface FileAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  isSecure: boolean;
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  uploadedAt: Date;
  expiresAt?: Date;
}

export interface DocumentAnalysis {
  id: string;
  fileId: string;
  extractedText: string;
  documentType: 'dd214' | 'medical' | 'financial' | 'application' | 'other';
  entities: ExtractedEntity[];
  redactedText: string;
  confidence: number;
  processedAt: Date;
}

export interface ExtractedEntity {
  type: 'ssn' | 'date' | 'name' | 'address' | 'phone' | 'email' | 'military_id';
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  redacted: boolean;
}

// === OPPORTUNITY & RESOURCE TYPES ===
export interface Opportunity {
  id: string;
  title: string;
  description: string;
  type: 'grant' | 'loan' | 'contract' | 'benefit' | 'program';
  amount?: number;
  deadline: Date;
  eligibility: EligibilityRequirements;
  applicationUrl: string;
  status: 'open' | 'closed' | 'upcoming';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EligibilityRequirements {
  veteranStatus: boolean;
  serviceConnected?: boolean;
  disabilityRating?: number;
  incomeLimit?: number;
  location?: string[];
  businessType?: string[];
  other?: string[];
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: 'healthcare' | 'education' | 'housing' | 'employment' | 'benefits' | 'legal';
  url: string;
  contactInfo?: ContactInfo;
  availability: string;
  cost: 'free' | 'paid' | 'sliding-scale';
  tags: string[];
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
}

// === APPLICATION & TRACKING TYPES ===
export interface Application {
  id: string;
  userId: string;
  opportunityId: string;
  status: 'draft' | 'submitted' | 'under-review' | 'approved' | 'rejected';
  submittedAt?: Date;
  documents: string[]; // file IDs
  notes: string;
  aiAssistance: AIAssistanceRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AIAssistanceRecord {
  type: 'draft' | 'review' | 'improvement';
  content: string;
  model: string;
  timestamp: Date;
  feedback?: UserFeedback;
}

// === ANALYTICS & FEEDBACK TYPES ===
export interface AnalyticsEvent {
  id: string;
  userId: string;
  sessionId: string;
  eventType: string;
  eventData: Record<string, any>;
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string; // hashed for privacy
}

export interface UserFeedback {
  id: string;
  userId: string;
  messageId?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  category: 'accuracy' | 'helpfulness' | 'speed' | 'other';
  timestamp: Date;
}

// === API RESPONSE TYPES ===
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: Date;
  processingTime: number;
  rateLimit?: RateLimitInfo;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
}

// === SECURITY TYPES ===
export interface SecurityContext {
  userId: string;
  sessionId: string;
  permissions: string[];
  securityLevel: 'standard' | 'enhanced';
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// === CONFIGURATION TYPES ===
export interface AppConfig {
  security: SecurityConfig;
  ai: AIConfig;
  storage: StorageConfig;
  analytics: AnalyticsConfig;
}

export interface SecurityConfig {
  encryptionEnabled: boolean;
  sessionTimeout: number;
  maxLoginAttempts: number;
  passwordPolicy: PasswordPolicy;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
}

export interface AIConfig {
  primaryModel: 'openai' | 'claude' | 'perplexity';
  fallbackModels: string[];
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export interface StorageConfig {
  maxFileSize: number;
  allowedTypes: string[];
  retentionDays: number;
  encryptFiles: boolean;
}

export interface AnalyticsConfig {
  enabled: boolean;
  retentionDays: number;
  anonymizeData: boolean;
} 
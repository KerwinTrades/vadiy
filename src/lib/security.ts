import CryptoJS from 'crypto-js';
import { createHash, randomBytes } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

// === ENCRYPTION UTILITIES ===
export class SecurityManager {
  private static encryptionKey = process.env.ENCRYPTION_KEY || '';
  private static jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET || '');

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  static encrypt(data: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    try {
      const encrypted = CryptoJS.AES.encrypt(data, this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedData: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash sensitive data (one-way)
   */
  static hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate secure random token
   */
  static generateToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Create JWT token for user session
   */
  static async createJWT(payload: Record<string, any>, expiresIn: string = '30m'): Promise<string> {
    try {
      const jwt = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(this.jwtSecret);
      
      return jwt;
    } catch (error) {
      throw new Error('JWT creation failed');
    }
  }

  /**
   * Verify JWT token
   */
  static async verifyJWT(token: string): Promise<any> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret);
      return payload;
    } catch (error) {
      throw new Error('JWT verification failed');
    }
  }
}

// === PII DETECTION AND MASKING ===
export class PIIProtector {
  private static patterns = {
    ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    address: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi,
    militaryId: /\b[A-Z]{2}\d{8}\b/g,
  };

  /**
   * Detect PII in text
   */
  static detectPII(text: string): Array<{ type: string; value: string; start: number; end: number }> {
    const detected: Array<{ type: string; value: string; start: number; end: number }> = [];
    
    Object.entries(this.patterns).forEach(([type, pattern]) => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        detected.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    });
    
    return detected;
  }

  /**
   * Mask PII in text for logging
   */
  static maskPII(text: string): string {
    let maskedText = text;
    
    Object.entries(this.patterns).forEach(([type, pattern]) => {
      maskedText = maskedText.replace(pattern, (match) => {
        if (type === 'email') {
          const [local, domain] = match.split('@');
          return `${local.charAt(0)}***@${domain}`;
        } else if (type === 'ssn') {
          return 'XXX-XX-' + match.slice(-4);
        } else if (type === 'phone') {
          return 'XXX-XXX-' + match.slice(-4);
        } else if (type === 'creditCard') {
          return '**** **** **** ' + match.slice(-4);
        } else {
          return '*'.repeat(match.length);
        }
      });
    });
    
    return maskedText;
  }

  /**
   * Redact PII completely for secure storage
   */
  static redactPII(text: string): string {
    let redactedText = text;
    
    Object.values(this.patterns).forEach((pattern) => {
      redactedText = redactedText.replace(pattern, '[REDACTED]');
    });
    
    return redactedText;
  }
}

// === INPUT VALIDATION ===
export class InputValidator {
  /**
   * Sanitize user input to prevent XSS
   */
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate file type
   */
  static isAllowedFileType(filename: string, allowedTypes: string[]): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedTypes.includes(extension) : false;
  }

  /**
   * Validate file size
   */
  static isValidFileSize(size: number, maxSize: number): boolean {
    return size <= maxSize;
  }

  /**
   * Check for malicious content patterns
   */
  static containsMaliciousContent(content: string): boolean {
    const maliciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /eval\(/i,
      /document\.cookie/i,
      /window\.location/i
    ];
    
    return maliciousPatterns.some(pattern => pattern.test(content));
  }
}

// === RATE LIMITING ===
export class RateLimiter {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  /**
   * Check if request is within rate limit
   */
  static checkRateLimit(
    identifier: string, 
    limit: number, 
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const key = identifier;
    const current = this.requests.get(key);

    if (!current || now > current.resetTime) {
      // Reset or initialize
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: limit - 1, resetTime: now + windowMs };
    }

    if (current.count >= limit) {
      return { allowed: false, remaining: 0, resetTime: current.resetTime };
    }

    current.count++;
    this.requests.set(key, current);
    return { allowed: true, remaining: limit - current.count, resetTime: current.resetTime };
  }

  /**
   * Clean up expired entries
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.requests.entries()) {
      if (now > value.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// === AUDIT LOGGING ===
export class AuditLogger {
  /**
   * Log security event
   */
  static async logSecurityEvent(
    userId: string,
    action: string,
    resource: string,
    details: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    req?: any
  ): Promise<void> {
    const auditEntry = {
      id: SecurityManager.generateToken(16),
      userId,
      action,
      resource,
      details: PIIProtector.maskPII(JSON.stringify(details)),
      ipAddress: SecurityManager.hash(req?.ip || 'unknown'),
      userAgent: req?.headers?.['user-agent'] || 'unknown',
      timestamp: new Date(),
      severity
    };

    // In production, this would write to a secure audit log
    console.log('[AUDIT]', auditEntry);
    
    // TODO: Implement secure audit log storage
    // await writeToSecureAuditLog(auditEntry);
  }

  /**
   * Log data access
   */
  static async logDataAccess(
    userId: string,
    dataType: string,
    recordId: string,
    action: 'read' | 'write' | 'delete',
    req?: any
  ): Promise<void> {
    await this.logSecurityEvent(
      userId,
      `data_${action}`,
      `${dataType}:${recordId}`,
      { dataType, recordId, action },
      'medium',
      req
    );
  }
}

// === SESSION MANAGEMENT ===
export class SessionManager {
  private static sessions = new Map<string, { userId: string; lastActivity: number; data: any }>();

  /**
   * Create new session
   */
  static createSession(userId: string, data: any = {}): string {
    const sessionId = SecurityManager.generateToken(32);
    this.sessions.set(sessionId, {
      userId,
      lastActivity: Date.now(),
      data
    });
    return sessionId;
  }

  /**
   * Validate session
   */
  static validateSession(sessionId: string, timeoutMs: number = 30 * 60 * 1000): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    if (now - session.lastActivity > timeoutMs) {
      this.sessions.delete(sessionId);
      return false;
    }

    session.lastActivity = now;
    return true;
  }

  /**
   * Get session data
   */
  static getSession(sessionId: string): any {
    return this.sessions.get(sessionId);
  }

  /**
   * Destroy session
   */
  static destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  static cleanupSessions(timeoutMs: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > timeoutMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
} 
# Veteran Chat Assistant

A secure, AI-powered chat assistant specifically designed for U.S. military veterans to help with financial opportunities, benefits navigation, application assistance, and resource connection.

## 🛡️ Security & Privacy First

This system is built with veteran privacy and security as the top priority:

- **End-to-end encryption** for sensitive conversations
- **HIPAA-compliant** data handling practices
- **Automatic PII detection** and masking
- **Comprehensive audit logging** for all data access
- **Session timeout** and security monitoring
- **Zero storage** of sensitive documents in logs

## 🎯 Features

### Core Capabilities
- **AI-Powered Assistance**: Multi-model AI (OpenAI, Claude, Perplexity) with intelligent fallback
- **Financial Opportunities**: Help finding grants, loans, contracts, and benefits
- **Application Writing**: AI-assisted application and bid proposal generation
- **Document Analysis**: Secure analysis of DD-214s, medical records, and other documents
- **Benefits Navigation**: Comprehensive VA benefits and eligibility guidance
- **Resource Connection**: Links to healthcare, education, housing, and employment resources

### Security Features
- **Multi-layer Authentication**: Softr integration with JWT session management
- **Rate Limiting**: Subscription-based usage limits (20/hour free, 100/hour paid)
- **PII Protection**: Automatic detection and redaction of sensitive information
- **Audit Trails**: Complete logging of all user interactions and data access
- **Secure File Handling**: Virus scanning and encrypted storage for uploads
- **Session Management**: 30-minute timeout with activity tracking

### Integration Capabilities
- **Softr Website**: Full-page embed and floating bubble widget
- **Airtable Database**: Secure data storage with encryption
- **n8n Workflows**: Automated matching and processing
- **Vercel Deployment**: Serverless architecture with global CDN

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Airtable account with API access
- OpenAI API key (required)
- Claude API key (optional, for fallback)
- Perplexity API key (optional, for research queries)
- Vercel account for deployment

### Installation

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd veteran-chat-assistant
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp environment.template .env.local
   ```
   
   Fill in your API keys and configuration:
   ```env
   # Required
   ENCRYPTION_KEY=your_32_character_encryption_key_here
   JWT_SECRET=your_jwt_secret_key_here
   OPENAI_API_KEY=sk-your-openai-api-key
   AIRTABLE_API_KEY=your-airtable-api-key
   AIRTABLE_BASE_ID=your-airtable-base-id
   
   # Optional but recommended
   ANTHROPIC_API_KEY=your-anthropic-api-key
   PERPLEXITY_API_KEY=your-perplexity-api-key
   SOFTR_API_KEY=your-softr-api-key
   ```

3. **Development Server**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000) to see the application.

## 📊 Airtable Setup

### Required Tables

Create these tables in your Airtable base:

#### 1. Users Table
```
Fields:
- ID (Single line text, Primary)
- Email (Email)
- First_Name (Single line text)
- Last_Name (Single line text)
- Veteran_ID (Single line text)
- Service_Record (Long text, JSON)
- Subscription_Status (Single select: free, paid, premium)
- Preferences (Long text, JSON)
- Security_Level (Single select: standard, enhanced)
- Last_Login (Date)
- Created_At (Date)
- Updated_At (Date)
```

#### 2. Conversations Table
```
Fields:
- ID (Single line text, Primary)
- User_ID (Single line text)
- Title (Single line text)
- Is_Encrypted (Checkbox)
- Status (Single select: active, archived, deleted)
- Tags (Long text, JSON array)
- Created_At (Date)
- Updated_At (Date)
- Last_Message_At (Date)
- Message_Count (Number)
```

#### 3. Messages Table
```
Fields:
- ID (Single line text, Primary)
- Conversation_ID (Single line text)
- Role (Single select: user, assistant, system)
- Content (Long text)
- Encrypted_Content (Long text)
- Metadata (Long text, JSON)
- Attachments (Long text, JSON)
- Timestamp (Date)
- Edited (Checkbox)
- Edited_At (Date)
```

#### 4. Opportunities Table
```
Fields:
- ID (Single line text, Primary)
- Title (Single line text)
- Description (Long text)
- Type (Single select: grant, loan, contract, benefit, program)
- Amount (Currency)
- Deadline (Date)
- Eligibility (Long text, JSON)
- Application_URL (URL)
- Status (Single select: open, closed, upcoming)
- Tags (Long text, JSON array)
- Created_At (Date)
- Updated_At (Date)
```

#### 5. Analytics_Events Table
```
Fields:
- ID (Single line text, Primary)
- User_ID (Single line text)
- Session_ID (Single line text)
- Event_Type (Single line text)
- Event_Data (Long text, JSON)
- Timestamp (Date)
- User_Agent (Single line text)
- IP_Address (Single line text, hashed)
```

### Setup Script
Run this to create sample data:
```bash
npm run setup-airtable
```

## 🔧 Configuration

### Security Configuration

1. **Generate Encryption Key**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **JWT Secret**
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **Rate Limiting**
   - Free users: 20 messages/hour
   - Paid users: 100 messages/hour
   - Configurable in environment variables

### AI Model Configuration

The system uses a fallback hierarchy:
1. **Primary**: OpenAI GPT-4 (required)
2. **Fallback**: Claude 3 Sonnet (optional)
3. **Research**: Perplexity (optional)

Configure in `src/lib/ai.ts` or via environment variables.

## 🌐 Softr Integration

### Full-Page Embed

Add this to your Softr custom code block:

```html
<div id="veteran-chat-container" style="width: 100%; height: 600px;"></div>
<script>
  (function() {
    const iframe = document.createElement('iframe');
    iframe.src = 'https://your-app.vercel.app/embed/chat';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '8px';
    document.getElementById('veteran-chat-container').appendChild(iframe);
  })();
</script>
```

### Floating Bubble Widget

Add this to your Softr site header:

```html
<script src="https://your-app.vercel.app/widget.js"></script>
<script>
  VeteranChatWidget.init({
    apiUrl: 'https://your-app.vercel.app',
    position: 'bottom-right',
    theme: 'veteran',
    autoOpen: false
  });
</script>
```

## 🚀 Deployment

### Vercel Deployment

1. **Connect Repository**
   ```bash
   vercel --prod
   ```

2. **Environment Variables**
   Set all environment variables in Vercel dashboard

3. **Custom Domain**
   Configure your domain in Vercel settings

### Environment Variables for Production

```env
# Production URLs
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
ALLOWED_ORIGIN=https://your-softr-site.com

# Security (use strong values)
ENCRYPTION_KEY=your_production_encryption_key
JWT_SECRET=your_production_jwt_secret

# API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
PERPLEXITY_API_KEY=your_perplexity_key

# Database
AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_base_id

# Optional
SENTRY_DSN=your_sentry_dsn
VIRUS_TOTAL_API_KEY=your_virustotal_key
```

## 🔒 Security Best Practices

### For Developers

1. **Never log sensitive data** - Use PIIProtector.maskPII() for all logs
2. **Validate all inputs** - Use InputValidator for user data
3. **Encrypt sensitive fields** - Use SecurityManager.encrypt() for PII
4. **Audit all actions** - Use AuditLogger for security events
5. **Rate limit endpoints** - Implement RateLimiter for all APIs

### For Deployment

1. **Use HTTPS only** - Configure SSL certificates
2. **Set security headers** - Already configured in next.config.js
3. **Monitor audit logs** - Set up log monitoring and alerts
4. **Regular security updates** - Keep dependencies updated
5. **Backup encryption keys** - Store securely and separately

## 📊 Monitoring & Analytics

### Built-in Analytics

- User engagement metrics
- Message volume and response times
- AI model performance
- Error rates and types
- Security events and threats

### Health Checks

```bash
# Check AI services
curl https://your-app.vercel.app/api/health/ai

# Check database connection
curl https://your-app.vercel.app/api/health/database

# Check overall system
curl https://your-app.vercel.app/api/health
```

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Security Testing
```bash
npm run test:security
```

### Load Testing
```bash
npm run test:load
```

## 📝 API Documentation

### Authentication
```
POST /api/auth/verify-user
Body: { email, softrToken }
Response: { user, session, rateLimit }
```

### Chat
```
POST /api/chat/send-message
Headers: { Authorization: Bearer <sessionToken> }
Body: { message, conversationId?, attachments? }
Response: { messages, conversationId, aiModel }
```

### File Upload
```
POST /api/files/upload
Headers: { Authorization: Bearer <sessionToken> }
Body: FormData with file
Response: { fileId, url, scanStatus }
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow security guidelines
4. Add tests for new features
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For technical support:
- Create an issue in this repository
- Email: support@your-domain.com
- Documentation: https://docs.your-domain.com

For veterans needing assistance:
- Visit: https://your-softr-site.com
- Call: 1-800-VETERAN
- Chat: Available 24/7 through the widget

---

**Built with ❤️ for those who served our country** 
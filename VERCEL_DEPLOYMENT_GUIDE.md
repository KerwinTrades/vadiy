# Vercel Deployment Guide for VADIY

This guide covers the steps needed to deploy your veteran-focused platform to Vercel. Follow these instructions to ensure a successful deployment.

## Prerequisites

1. A Vercel account (create one at [vercel.com](https://vercel.com) if you don't have one)
2. Your GitHub repository connected to Vercel
3. Your Airtable credentials (Personal Access Token or API Key, and Base ID)

## Deployment Steps

### 1. Set Up Environment Variables in Vercel

In your Vercel project settings, add the following environment variables:

#### Required Environment Variables

| Variable Name | Description | Example |
|---------------|-------------|---------|
| `AIRTABLE_PERSONAL_ACCESS_TOKEN` | Your Airtable Personal Access Token | `pat123xyz456...` |
| `AIRTABLE_BASE_ID` | Your Airtable Base ID | `app123xyz456...` |
| `JWT_SECRET` | Secret for JWT token encryption (generate a random string) | `your-secure-random-string` |
| `ENCRYPTION_KEY` | Key for encrypting sensitive data (generate a random string) | `another-secure-random-string` |
| `OPENAI_API_KEY` | Your OpenAI API key for AI features | `sk-...` |

> **Note**: You can use either `AIRTABLE_PERSONAL_ACCESS_TOKEN` or `AIRTABLE_API_KEY`. Personal Access Token is recommended.

#### Optional Table Name Override Variables

Only set these if your Airtable table names differ from the defaults used in the code:

| Variable Name | Default Value | Your Value |
|---------------|---------------|-----------|
| `AIRTABLE_USERS_TABLE` | "User Profiles" | Your custom name if different |
| `AIRTABLE_OPPORTUNITIES_TABLE` | "Opportunities" | Your custom name if different |
| `AIRTABLE_RESOURCES_TABLE` | "Resources" | Your custom name if different |
| `AIRTABLE_MATCHES_TABLE` | "Matches" | Your custom name if different |
| `AIRTABLE_MATCHES_RESOURCES_TABLE` | "Matches Resources" | Your custom name if different |
| `AIRTABLE_CONVERSATIONS_TABLE` | "Conversations" | Your custom name if different |
| `AIRTABLE_MESSAGES_TABLE` | "Messages" | Your custom name if different |
| `AIRTABLE_CHAT_ANALYTICS_TABLE` | "Chat Analytics" | Your custom name if different |
| `AIRTABLE_DOCUMENTS_TABLE` | "Documents" | Your custom name if different |
| `AIRTABLE_VETERAN_NEWS_TABLE` | "Veteran News" | Your custom name if different |
| `AIRTABLE_CHAT_TRANSCRIPTS_TABLE` | "ChatTranscripts" | Your custom name if different |
| `AIRTABLE_VETERAN_CHAT_TABLE` | "VeteranChat" | Your custom name if different |

### 2. Deploy to Vercel

1. Log in to your Vercel account
2. Import your GitHub repository
3. Configure the build settings:
   - Framework Preset: Next.js
   - Build Command: `next build`
   - Output Directory: `.next`
4. Add all the environment variables from the section above
5. Deploy your project

### 3. Verify Deployment

After deployment:

1. Check the Vercel deployment logs for any errors
2. Pay special attention to Airtable connection logs
3. Verify that the application can successfully:
   - Connect to Airtable
   - Load data from all tables
   - Display content correctly

### 4. Troubleshooting

If you encounter issues:

1. **Airtable Connection Problems**:
   - Verify your Airtable Personal Access Token or API Key
   - Confirm Base ID is correct
   - Check that table names match exactly what's in your Airtable base
   - Ensure the token has access to the base

2. **Build Errors**:
   - Check for TypeScript errors
   - Ensure all required environment variables are set
   - Review Vercel build logs for specific error messages

3. **Runtime Errors**:
   - Check browser console for JavaScript errors
   - Review server-side logs in Vercel dashboard
   - Verify API endpoints are working correctly

### 5. Recommended: Set Up Preview Deployments

Configure Vercel preview deployments to test changes before they go to production:

1. In your Vercel project settings, go to "Git" section
2. Enable "Preview Deployments"
3. Configure separate environment variables for preview environments if needed

## Notes About Airtable Schema

Your Airtable integration has been updated to match your actual schema with the following tables:

- User Profiles
- Opportunities
- Resources
- Veteran News
- ChatTranscripts
- VeteranChat
- Other tables (Matches, Messages, etc.)

The mapping functions have been updated to correctly map fields from your Airtable schema to the TypeScript types used in the application.

## Need Help?

If you need further assistance with your Vercel deployment, contact Vercel support or review their documentation at [vercel.com/docs](https://vercel.com/docs).

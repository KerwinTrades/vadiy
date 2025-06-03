import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// List of allowed domains for embedding
const ALLOWED_DOMAINS = [
  'vadiy.com',
  'vadiy.softr.app',
  'localhost',
  '127.0.0.1',
  'vercel.app'
];

/**
 * Special API route for embedding the chat widget in Softr and other external sites
 * This route bypasses all security restrictions for iframes
 */
export async function GET(request: NextRequest) {
  // Get the referrer and host information
  const referrer = request.headers.get('referer') || '';
  const referrerDomain = referrer ? new URL(referrer).hostname : '';
  const requestHost = request.headers.get('host') || '';
  
  // Determine if the request is coming from an allowed domain
  const isAllowedDomain = ALLOWED_DOMAINS.some(domain => 
    referrerDomain.includes(domain) || requestHost.includes(domain)
  );
  
  // Set up the chat URL with the full origin
  const origin = new URL(request.url).origin;
  const chatUrl = `${origin}/embed/chat`;
  
  // Determine if we should use secure embedding or fully permissive mode
  const secureMode = process.env.NODE_ENV === 'production' && !isAllowedDomain;
  
  // Prepare headers based on security mode
  const headers: Record<string, string> = {
    'Content-Type': 'text/html',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  // Add permissive headers only for allowed domains or in development
  if (!secureMode) {
    headers['X-Frame-Options'] = 'ALLOWALL';
    headers['Content-Security-Policy'] = "frame-ancestors *;";
  }
  
  // Create the response with appropriate security settings
  const response = new NextResponse(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Veteran Chat</title>
      <style>
        /* Reset styles */
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        
        /* Container for the iframe */
        .chat-container {
          width: 100%;
          height: 100%;
          min-height: 500px;
          border: none;
          display: block;
        }
        
        /* Ensure the iframe fits correctly */
        iframe {
          width: 100%;
          height: 100%;
          border: none;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
      </style>
    </head>
    <body>
      <div class="chat-container">
        <iframe src="${chatUrl}" allow="clipboard-write" title="Veteran Chat Assistant"></iframe>
      </div>
      
      <script>
        // Messaging system for iframe communication
        window.addEventListener('message', function(event) {
          // Validate the message source
          if (!event.data || typeof event.data !== 'object' || event.data.source !== 'veteran-chat') {
            return;
          }
          
          const iframe = document.querySelector('iframe');
          if (!iframe) return;
          
          // Handle different message types
          switch (event.data.type) {
            case 'resize':
              // Adjust iframe height based on content
              if (event.data.data && event.data.data.height) {
                iframe.style.height = event.data.data.height + 'px';
              }
              break;
              
            case 'ready':
              // Send configuration to the iframe when it's ready
              iframe.contentWindow.postMessage({
                type: 'config',
                data: { embedded: true, parentDomain: window.location.hostname },
                source: 'veteran-embed'
              }, '*');
              break;
              
            case 'status':
              // Handle chat status updates (minimized/maximized)
              if (event.data.data && typeof event.data.data.isMinimized !== 'undefined') {
                // Could update parent page UI based on chat state
              }
              break;
          }
        });
        
        // Notify parent page that the embed container is ready
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'embed_ready', source: 'veteran-embed' }, '*');
        }
      </script>
    </body>
    </html>
  `, {
    status: 200,
    headers
  });
  
  return response;
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
  // Get the origin from the request
  const origin = request.headers.get('origin') || '*';
  const requestHost = request.headers.get('host') || '';
  
  // Check if the origin is in our allowed domains list
  const isAllowedOrigin = ALLOWED_DOMAINS.some(domain => 
    origin.includes(domain) || requestHost.includes(domain)
  );
  
  // Set the appropriate CORS headers
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': isAllowedOrigin || process.env.NODE_ENV !== 'production' ? origin : '*', 
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * Veteran Chat Embed Script for Softr
 * Special version optimized for vadiy.com and Softr platforms
 * This script bypasses iframe restrictions and allows embedding the chat widget
 * v1.0.2 - Enhanced with cross-frame communication and Softr-specific optimizations
 */

(function() {
  'use strict';

  // Default configuration
  const defaultConfig = {
    apiBaseUrl: 'https://vadiy-msb11488t-kerwins-projects-846f2cf3.vercel.app', // Production Vercel deployment URL
    containerSelector: '#veteran-chat-container', // Where to render the widget
    height: '600px',
    width: '100%',
    floatingButton: false, // Whether to show a floating button on other pages
    autoOpen: true, // Open chat automatically when on veteran-chat page
    buttonText: '💬 Chat with VA Assistant',
    allowFullscreen: true, // Allow the chat to go fullscreen on mobile
    chatRoute: '/veteran-chat', // The route where the full chat is located
    position: 'bottom-right', // Position of the floating button
    softrSpecific: true, // Enable Softr-specific optimizations
    debug: false // Enable debug logging
  };

  // Global widget object
  window.VeteranEmbedWidget = {
    config: defaultConfig,
    initialized: false,
    iframe: null,
    container: null,
    log: function(message, ...args) {
      if (this.config.debug) {
        console.log(`[VeteranChat] ${message}`, ...args);
      }
    },
    error: function(message, ...args) {
      console.error(`[VeteranChat] ${message}`, ...args);
    },

    init: function(userConfig) {
      // Merge user config with defaults
      this.config = { ...defaultConfig, ...userConfig };

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    },

    setup: function() {
      // Check if we're on the veteran-chat page - check both URL and path parts
      const isVeteranChatPage = window.location.href.includes('veteran-chat') || 
                               window.location.pathname.includes('veteran-chat');
      
      // Add handler for messages from the iframe
      this.setupMessageListeners();
      
      // Different behavior based on the page
      if (isVeteranChatPage) {
        this.log('On veteran chat page, rendering embedded chat');
        this.renderChatEmbed();
      } else if (this.config.floatingButton) {
        this.log('Not on chat page, rendering floating button');
        this.createFloatingButton();
      }

      // Support Softr-specific behaviors
      if (this.config.softrSpecific) {
        this.applySoftrOptimizations();
      }

      this.initialized = true;
    },
    
    applySoftrOptimizations: function() {
      // Fix Softr-specific styling issues
      const styles = document.createElement('style');
      styles.textContent = `
        /* Fix for Softr default padding */
        .chat-embed-container iframe {
          display: block !important;
        }
        
        /* Fix Softr section padding if present */
        .veteran-chat-section {
          padding: 0 !important;
          margin: 0 !important;
          max-width: 100% !important;
        }
      `;
      document.head.appendChild(styles);
      
      // Add class to container if found
      const container = document.querySelector(this.config.containerSelector);
      if (container) {
        // Find closest Softr section and remove padding
        const parentSection = container.closest('.section');
        if (parentSection) {
          parentSection.classList.add('veteran-chat-section');
        }
      }
    },
    
    setupMessageListeners: function() {
      // Listen for messages from the chat iframe
      window.addEventListener('message', (event) => {
        // Validate message source
        if (!event.data || typeof event.data !== 'object' || event.data.source !== 'veteran-chat') {
          return;
        }
        
        this.log('Received message from chat iframe:', event.data);
        
        // Handle different message types
        switch (event.data.type) {
          case 'resize':
            this.handleResizeMessage(event.data);
            break;
          case 'ready':
            this.handleReadyMessage(event.data);
            break;
          case 'status':
            this.handleStatusMessage(event.data);
            break;
        }
      });
    },
    
    handleResizeMessage: function(message) {
      if (message.data && message.data.height && this.iframe) {
        this.iframe.style.height = `${message.data.height}px`;
        this.log('Resized iframe to height:', message.data.height);
      }
    },
    
    handleReadyMessage: function(message) {
      this.log('Chat iframe is ready');
      // Could send configuration or other data to the iframe
    },
    
    handleStatusMessage: function(message) {
      if (message.data && typeof message.data.isMinimized !== 'undefined') {
        this.log('Chat status changed:', message.data.isMinimized ? 'minimized' : 'maximized');
        // Could update UI based on chat state
      }
    },

    renderChatEmbed: function() {
      try {
        // Find container
        const container = document.querySelector(this.config.containerSelector);
        if (!container) {
          this.error('Veteran Chat container not found:', this.config.containerSelector);
          return;
        }
        
        this.container = container;
        
        // Add a class to the container for styling
        container.classList.add('chat-embed-container');
  
        // Set container styles
        container.style.width = this.config.width;
        container.style.height = this.config.height;
        container.style.overflow = 'hidden';
        container.style.borderRadius = '8px';
        container.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        
        // Create iframe using our special API route that bypasses iframe restrictions
        const iframe = document.createElement('iframe');
        
        // Add query parameters for configuration
        const embeddedParams = new URLSearchParams();
        embeddedParams.append('embedded', 'true');
        embeddedParams.append('source', 'softr');
        embeddedParams.append('domain', window.location.hostname);
        embeddedParams.append('path', window.location.pathname);
        
        // Set the iframe source with params
        iframe.src = `${this.config.apiBaseUrl}/api/embed?${embeddedParams.toString()}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.setAttribute('allow', 'clipboard-write');
        iframe.setAttribute('title', 'Veteran Chat Assistant');
        
        // Add fullscreen support if enabled
        if (this.config.allowFullscreen) {
          iframe.setAttribute('allowfullscreen', 'true');
        }
        
        // Store reference to iframe
        this.iframe = iframe;
        
        // Clear container and append iframe
        container.innerHTML = '';
        container.appendChild(iframe);
        
        // Add loading indicator
        this.addLoadingIndicator(container);
        
        // Handle iframe load events
        iframe.addEventListener('load', () => {
          this.log('Iframe loaded');
          this.removeLoadingIndicator();
        });
        
        // Handle errors
        iframe.addEventListener('error', (e) => {
          this.error('Error loading iframe:', e);
          this.showErrorMessage(container);
        });
      } catch (err) {
        this.error('Error rendering chat embed:', err);
        this.showErrorMessage(document.querySelector(this.config.containerSelector));
      }
    },
    
    addLoadingIndicator: function(container) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'veteran-chat-loading';
      loadingDiv.innerHTML = `
        <div class="loading-spinner">
          <div></div><div></div><div></div>
        </div>
        <p>Loading veteran chat...</p>
      `;
      
      // Add styles for loading indicator
      const style = document.createElement('style');
      style.textContent = `
        .veteran-chat-loading {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.9);
          z-index: 10;
          border-radius: 8px;
        }
        .loading-spinner {
          display: inline-block;
          position: relative;
          width: 80px;
          height: 80px;
        }
        .loading-spinner div {
          display: inline-block;
          position: absolute;
          left: 8px;
          width: 16px;
          background: #1E3A8A;
          animation: loading-spinner 1.2s cubic-bezier(0, 0.5, 0.5, 1) infinite;
        }
        .loading-spinner div:nth-child(1) {
          left: 8px;
          animation-delay: -0.24s;
        }
        .loading-spinner div:nth-child(2) {
          left: 32px;
          animation-delay: -0.12s;
        }
        .loading-spinner div:nth-child(3) {
          left: 56px;
          animation-delay: 0;
        }
        @keyframes loading-spinner {
          0% { top: 8px; height: 64px; }
          50%, 100% { top: 24px; height: 32px; }
        }
      `;
      
      document.head.appendChild(style);
      container.appendChild(loadingDiv);
    },
    
    removeLoadingIndicator: function() {
      const loadingDiv = document.querySelector('.veteran-chat-loading');
      if (loadingDiv) {
        loadingDiv.remove();
      }
    },
    
    showErrorMessage: function(container) {
      if (!container) return;
      
      // Remove loading indicator if present
      this.removeLoadingIndicator();
      
      // Show error message
      const errorDiv = document.createElement('div');
      errorDiv.className = 'veteran-chat-error';
      errorDiv.innerHTML = `
        <div class="error-icon">⚠️</div>
        <h3>Unable to load chat</h3>
        <p>There was a problem connecting to the veteran chat service.</p>
        <button class="retry-button">Try Again</button>
      `;
      
      // Add styles for error message
      const style = document.createElement('style');
      style.textContent = `
        .veteran-chat-error {
          text-align: center;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #333;
        }
        .error-icon {
          font-size: 32px;
          margin-bottom: 10px;
        }
        .retry-button {
          background: #1E3A8A;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 10px;
        }
        .retry-button:hover {
          background: #1e40af;
        }
      `;
      
      document.head.appendChild(style);
      container.innerHTML = '';
      container.appendChild(errorDiv);
      
      // Add retry button event listener
      const retryButton = errorDiv.querySelector('.retry-button');
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          container.innerHTML = '';
          this.renderChatEmbed();
        });
      }
    },
    
    createFloatingButton: function() {
      try {
        // Check if button already exists
        if (document.querySelector('.veteran-chat-floating-button')) {
          return;
        }
        
        // Create floating button that redirects to chat page
        const button = document.createElement('div');
        button.className = 'veteran-chat-floating-button';
        button.textContent = this.config.buttonText;
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Open Veteran Chat Assistant');
        
        // Add styles with positioning based on config
        const style = document.createElement('style');
        style.textContent = `
          .veteran-chat-floating-button {
            position: fixed;
            bottom: 20px;
            ${this.config.position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;'}
            background: #1E3A8A;
            color: white;
            border-radius: 28px;
            padding: 12px 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            cursor: pointer;
            z-index: 999999;
            transition: all 0.3s ease;
            user-select: none;
          }
          .veteran-chat-floating-button:hover {
            background: #1e40af;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
            transform: translateY(-2px);
          }
          
          /* Mobile responsiveness */
          @media (max-width: 768px) {
            .veteran-chat-floating-button {
              padding: 10px 16px;
              font-size: 13px;
              border-radius: 24px;
            }
          }
        `;
        
        // Add to page
        document.head.appendChild(style);
        document.body.appendChild(button);
        
        // Add click handler to redirect to chat page
        button.addEventListener('click', () => {
          window.location.href = this.config.chatRoute || '/veteran-chat';
        });
        
        // Track button creation
        this.log('Created floating chat button');
      } catch (err) {
        this.error('Error creating floating button:', err);
      }
    }
  };
})();

// Function to initialize the widget
function initVeteranChatWidget() {
  // Auto-initialize if the global config object exists
  if (window.VeteranEmbedConfig) {
    window.VeteranEmbedWidget.init(window.VeteranEmbedConfig);
  }
  
  // Also initialize with default config if we detect a container
  else if (document.querySelector('#veteran-chat-container') && !window.VeteranEmbedWidget.initialized) {
    window.VeteranEmbedWidget.init({});
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVeteranChatWidget);
} else {
  initVeteranChatWidget();
}

// Handle Softr dynamic page changes (Single Page App navigation)
window.addEventListener('softr-page-changed', function() {
  // Check if we should initialize on this new page
  if (!window.VeteranEmbedWidget.initialized) {
    initVeteranChatWidget();
  } else {
    // Re-setup the widget for the new page
    window.VeteranEmbedWidget.setup();
  }
});

// Export the API
window.VeteranChat = {
  openChat: function() {
    if (window.location.pathname.includes('veteran-chat')) {
      // Already on chat page, focus the iframe
      if (window.VeteranEmbedWidget.iframe) {
        window.VeteranEmbedWidget.iframe.focus();
      }
    } else {
      // Navigate to chat page
      window.location.href = window.VeteranEmbedWidget.config.chatRoute || '/veteran-chat';
    }
  },
  
  initChat: function(config) {
    window.VeteranEmbedConfig = config;
    window.VeteranEmbedWidget.init(config);
    return window.VeteranEmbedWidget;
  }
};

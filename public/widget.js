/**
 * Veteran Chat Widget
 * Embeddable chat widget for veteran services
 */

(function() {
  'use strict';

  // Widget configuration
  const defaultConfig = {
    apiUrl: 'http://localhost:3000',
    position: 'bottom-right',
    theme: 'veteran',
    autoOpen: false,
    showButton: true,
    buttonText: '💬',
    headerText: 'Veteran Assistant',
    placeholderText: 'Ask about veteran benefits...',
    height: '500px',
    width: '350px'
  };

  // Global widget object
  window.VeteranChatWidget = {
    config: defaultConfig,
    isOpen: false,
    widget: null,
    iframe: null,

    init: function(userConfig) {
      this.config = { ...defaultConfig, ...userConfig };
      this.createWidget();
      this.addStyles();
    },

    createWidget: function() {
      // Create widget container
      this.widget = document.createElement('div');
      this.widget.id = 'veteran-chat-widget';
      this.widget.className = `chat-widget ${this.config.position}`;
      
      // Create chat button
      if (this.config.showButton) {
        const button = document.createElement('div');
        button.className = 'chat-bubble-button';
        button.innerHTML = this.config.buttonText;
        button.onclick = () => this.toggle();
        this.widget.appendChild(button);
      }

      // Create iframe container
      const iframeContainer = document.createElement('div');
      iframeContainer.className = 'chat-widget-panel hidden';
      iframeContainer.style.width = this.config.width;
      iframeContainer.style.height = this.config.height;

      // Create iframe
      this.iframe = document.createElement('iframe');
      this.iframe.src = `${this.config.apiUrl}/embed/chat`;
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      this.iframe.style.border = 'none';
      this.iframe.style.borderRadius = '8px';
      this.iframe.setAttribute('allow', 'clipboard-write');
      
      iframeContainer.appendChild(this.iframe);
      this.widget.appendChild(iframeContainer);

      // Add to page
      document.body.appendChild(this.widget);

      // Auto open if configured
      if (this.config.autoOpen) {
        setTimeout(() => this.open(), 1000);
      }
    },

    addStyles: function() {
      if (document.getElementById('veteran-chat-widget-styles')) {
        return;
      }

      const styles = document.createElement('style');
      styles.id = 'veteran-chat-widget-styles';
      styles.textContent = `
        #veteran-chat-widget {
          position: fixed;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          transition: all 0.3s ease;
        }
        
        #veteran-chat-widget.bottom-right {
          bottom: 20px;
          right: 20px;
        }
        
        #veteran-chat-widget.bottom-left {
          bottom: 20px;
          left: 20px;
        }
        
        #veteran-chat-widget .chat-bubble-button {
          width: 60px;
          height: 60px;
          background: #1E3A8A;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: all 0.3s ease;
          font-size: 24px;
          user-select: none;
        }
        
        #veteran-chat-widget .chat-bubble-button:hover {
          background: #1E40AF;
          transform: scale(1.05);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }
        
        #veteran-chat-widget .chat-widget-panel {
          position: absolute;
          bottom: 75px;
          right: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
          border: 1px solid #e5e7eb;
          overflow: hidden;
          transition: all 0.3s ease;
          transform-origin: bottom right;
        }
        
        #veteran-chat-widget.bottom-left .chat-widget-panel {
          right: auto;
          left: 0;
          transform-origin: bottom left;
        }
        
        #veteran-chat-widget .chat-widget-panel.hidden {
          opacity: 0;
          transform: scale(0.8) translateY(20px);
          pointer-events: none;
        }
        
        #veteran-chat-widget .chat-widget-panel.visible {
          opacity: 1;
          transform: scale(1) translateY(0);
          pointer-events: all;
        }
        
        @media (max-width: 768px) {
          #veteran-chat-widget .chat-widget-panel {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            top: 50px;
            width: 100% !important;
            height: calc(100% - 50px) !important;
            border-radius: 12px 12px 0 0;
            transform-origin: bottom center;
          }
          
          #veteran-chat-widget.bottom-left .chat-widget-panel {
            left: 0;
          }
        }
      `;
      
      document.head.appendChild(styles);
    },

    open: function() {
      if (this.isOpen) return;
      
      const panel = this.widget.querySelector('.chat-widget-panel');
      panel.classList.remove('hidden');
      panel.classList.add('visible');
      this.isOpen = true;

      // Track event
      this.trackEvent('widget_opened');
    },

    close: function() {
      if (!this.isOpen) return;
      
      const panel = this.widget.querySelector('.chat-widget-panel');
      panel.classList.remove('visible');
      panel.classList.add('hidden');
      this.isOpen = false;

      // Track event
      this.trackEvent('widget_closed');
    },

    toggle: function() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    },

    trackEvent: function(eventType) {
      // Send analytics to your API
      if (this.config.trackEvents !== false) {
        fetch(`${this.config.apiUrl}/api/analytics/widget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: eventType,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            referrer: document.referrer
          })
        }).catch(console.error);
      }
    },

    destroy: function() {
      if (this.widget) {
        this.widget.remove();
      }
      
      const styles = document.getElementById('veteran-chat-widget-styles');
      if (styles) {
        styles.remove();
      }
      
      this.widget = null;
      this.iframe = null;
      this.isOpen = false;
    }
  };

  // Auto-initialize if config is available
  if (window.VeteranChatConfig) {
    window.VeteranChatWidget.init(window.VeteranChatConfig);
  }
})(); 
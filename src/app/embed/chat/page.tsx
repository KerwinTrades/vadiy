'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function EmbedChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m here to help with veteran benefits and services. What can I assist you with?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeSession();
    // Remove margins for embedded view
    document.body.style.margin = '0';
    document.body.style.padding = '0';
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeSession = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          embedded: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSessionToken(data.sessionToken);
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || !sessionToken) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          sessionToken,
          preferredModel: 'openai'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.messages.length > 1) {
          const assistantMessage = data.data.messages[1];
          setMessages(prev => [...prev, {
            id: assistantMessage.id,
            role: 'assistant',
            content: assistantMessage.content,
            timestamp: new Date(assistantMessage.timestamp)
          }]);
        }
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isMinimized) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-veteran-blue">
        <button
          onClick={() => setIsMinimized(false)}
          className="chat-bubble-button w-12 h-12"
        >
          💬
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col chat-container border-0">
      {/* Compact Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-veteran-blue text-white">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
            <span className="text-veteran-blue text-xs">🇺🇸</span>
          </div>
          <div>
            <h2 className="font-medium text-sm">Veteran Assistant</h2>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="security-indicator encrypted text-xs px-2 py-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1"></span>
            Secure
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-white hover:text-gray-200 w-6 h-6 flex items-center justify-center text-lg"
          >
            −
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm ${
              message.role === 'user'
                ? 'bg-veteran-blue text-white rounded-br-sm'
                : 'bg-white text-gray-900 rounded-bl-sm border border-gray-200'
            }`}>
              <div>{message.content}</div>
              <div className={`text-xs mt-1 ${
                message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
              }`}>
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-900 rounded-lg border border-gray-200 px-3 py-2 max-w-xs">
              <div className="flex items-center space-x-1">
                <span className="text-sm">Typing</span>
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse"></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Compact Input */}
      <div className="border-t border-gray-200 p-3 bg-white">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about veteran benefits..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-veteran-blue focus:border-transparent text-sm"
            disabled={isLoading || !sessionToken}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading || !sessionToken}
            className="bg-veteran-blue text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-800 focus:ring-2 focus:ring-veteran-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {isLoading ? '⋯' : 'Send'}
          </button>
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <div className="flex items-center space-x-2">
            {sessionToken && (
              <span className="flex items-center">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1"></span>
                Connected
              </span>
            )}
          </div>
          <div className="text-xs">
            Powered by AI
          </div>
        </div>
      </div>
    </div>
  );
} 
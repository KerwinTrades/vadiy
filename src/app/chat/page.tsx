'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Import subscription tier types
type SubscriptionTier = 'Free' | 'Premium' | 'Founder Club';

interface UserTierData {
  tier: SubscriptionTier;
  userProfile: {
    firstName: string | null;
    subscriptionStatus: string;
  };
  features: {
    opportunities: boolean;
    matches: boolean;
    resources: boolean;
    fullMemory: boolean;
    personalizedGreeting: boolean;
    webSearch: boolean;
    smartRouting: boolean;
  };
  limits: {
    messagesPerDay: number;
    conversationHistory: number;
    maxTokens: number;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your VADIY Assistant. I\'m here to help you with information about veteran benefits, services, and resources. How can I assist you today?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // 🎯 NEW: Tier management state
  const [userTierData, setUserTierData] = useState<UserTierData | null>(null);
  const [isLoadingTier, setIsLoadingTier] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize conversation, session, and tier
  useEffect(() => {
    initializeConversation();
    initializeSession();
  }, []);

  // Get user tier after session is established
  useEffect(() => {
    if (sessionToken) {
      getUserTier();
    }
  }, [sessionToken]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 🎯 NEW: Get user tier information
  const getUserTier = async () => {
    if (!sessionToken) return;
    
    setIsLoadingTier(true);
    try {
      console.log('🔍 Fetching user tier...');
      const response = await fetch('/api/user/tier', {
        headers: { 
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('🎯 User tier data:', data.data);
        setUserTierData(data.data);
        
        // Update initial greeting based on tier
        if (data.data.userProfile.firstName && data.data.features.personalizedGreeting) {
          const personalizedGreeting = {
            id: '1',
            role: 'assistant' as const,
            content: `Hello ${data.data.userProfile.firstName}! Welcome back to VADIY ${data.data.tier}. I'm here to help you with veteran benefits, services, and resources. How can I assist you today?`,
            timestamp: new Date()
          };
          setMessages([personalizedGreeting]);
        }
      } else {
        console.warn('Could not get user tier, defaulting to free');
        // Set default free tier
        setUserTierData({
          tier: 'Free',
          userProfile: { firstName: null, subscriptionStatus: 'Free' },
          features: {
            opportunities: false,
            matches: false,
            resources: true,
            fullMemory: false,
            personalizedGreeting: false,
            webSearch: false,
            smartRouting: false
          },
          limits: {
            messagesPerDay: 50,
            conversationHistory: 3,
            maxTokens: 400
          }
        });
      }
    } catch (error) {
      console.error('Failed to get user tier:', error);
    } finally {
      setIsLoadingTier(false);
    }
  };

  const initializeConversation = () => {
    // Try to restore existing conversation from localStorage
    const savedConversationId = localStorage.getItem('vadiy_conversation_id');
    const savedMessages = localStorage.getItem('vadiy_conversation_messages');
    
    if (savedConversationId && savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        console.log('🧠 Restoring conversation:', savedConversationId);
        setConversationId(savedConversationId);
        setMessages(parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
      } catch (error) {
        console.warn('Failed to restore conversation:', error);
        createNewConversation();
      }
    } else {
      createNewConversation();
    }
  };

  const createNewConversation = () => {
    const newConversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🧠 Creating new conversation:', newConversationId);
    setConversationId(newConversationId);
    localStorage.setItem('vadiy_conversation_id', newConversationId);
    
    // Save initial message
    const initialMessages = [{
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your VADIY Assistant. I\'m here to help you with information about veteran benefits, services, and resources. How can I assist you today?',
      timestamp: new Date()
    }];
    localStorage.setItem('vadiy_conversation_messages', JSON.stringify(initialMessages));
  };

  const saveConversation = (updatedMessages: ChatMessage[]) => {
    if (conversationId) {
      localStorage.setItem('vadiy_conversation_messages', JSON.stringify(updatedMessages));
      console.log('💾 Conversation saved to localStorage');
    }
  };

  const initializeSession = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
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
    if (!inputMessage.trim() || isLoading || !sessionToken || !conversationId) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    saveConversation(updatedMessages);
    
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log('🚀 Sending message with conversation context...');
      console.log('🧠 Conversation ID:', conversationId);
      
      const response = await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
          sessionToken,
          preferredModel: 'openai'
        })
      });

      console.log('📡 API Response status:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ API Response data:', data);
        console.log('🧠 Conversation memory used:', data.data?.aiModel ? 'Yes' : 'Unknown');
        
        if (data.success && data.data.messages.length > 1) {
          const assistantMessage = data.data.messages[1];
          const newAssistantMessage = {
            id: assistantMessage.id,
            role: 'assistant' as const,
            content: assistantMessage.content,
            timestamp: new Date(assistantMessage.timestamp)
          };
          
          const finalMessages = [...updatedMessages, newAssistantMessage];
          setMessages(finalMessages);
          saveConversation(finalMessages);
        } else {
          console.error('❌ Invalid response format:', data);
          throw new Error('Invalid response format from API');
        }
      } else {
        let errorMessage = 'Failed to send message';
        try {
          const errorData = await response.json();
          console.error('❌ API Error Response:', errorData);
          errorMessage = errorData.error?.message || errorMessage;
        } catch (parseError) {
          console.error('❌ Failed to parse error response:', parseError);
        }
        throw new Error(`API Error (${response.status}): ${errorMessage}`);
      }
    } catch (error) {
      console.error('💥 Error sending message:', error);
      
      let errorContent = 'I apologize, but I encountered an error processing your message. ';
      if (error instanceof Error) {
        if (error.message.includes('429')) {
          errorContent += 'You are sending messages too quickly. Please wait a moment and try again.';
        } else if (error.message.includes('401')) {
          errorContent += 'Your session has expired. Please refresh the page.';
        } else if (error.message.includes('500')) {
          errorContent += 'There is a server issue. Please try again in a moment.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorContent += 'Please check your internet connection and try again.';
        } else {
          errorContent += 'Please try again.';
        }
      } else {
        errorContent += 'Please try again.';
      }

      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant' as const,
        content: errorContent,
        timestamp: new Date()
      };
      
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      saveConversation(finalMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewConversation = () => {
    // Clear localStorage
    localStorage.removeItem('vadiy_conversation_id');
    localStorage.removeItem('vadiy_conversation_messages');
    
    // Reset state
    createNewConversation();
    
    // Set appropriate greeting based on tier
    const greetingContent = userTierData?.userProfile.firstName && userTierData?.features.personalizedGreeting
      ? `Hello ${userTierData.userProfile.firstName}! Welcome back to VADIY ${userTierData.tier}. I'm here to help you with veteran benefits, services, and resources. How can I assist you today?`
      : 'Hello! I\'m your VADIY Assistant. I\'m here to help you with information about veteran benefits, services, and resources. How can I assist you today?';
    
    setMessages([{
      id: '1',
      role: 'assistant',
      content: greetingContent,
      timestamp: new Date()
    }]);
    
    console.log('🧠 Started new conversation');
  };

  // 🎯 NEW: Get tier display information
  const getTierDisplayInfo = () => {
    if (!userTierData) return { icon: '⏳', title: 'Loading...', subtitle: 'Initializing...' };
    
    switch (userTierData.tier) {
      case 'Founder Club':
        return {
          icon: '👑',
          title: 'VADIY Assistant',
          subtitle: 'Founder Club • Priority Service • GPT-4o-mini'
        };
      case 'Premium':
        return {
          icon: '💎',
          title: 'VADIY Assistant',
          subtitle: 'Premium • Full Access • GPT-4o-mini'
        };
      case 'Free':
      default:
        return {
          icon: '🇺🇸',
          title: 'VADIY Assistant',
          subtitle: 'Free Tier • Upgrade for GPT-4o-mini • GPT-3.5'
        };
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

  const markdownComponents = {
    h1: ({ children }: any) => <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2 border-b border-gray-200 pb-1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-bold text-gray-800 mt-3 mb-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-base font-semibold text-gray-800 mt-2 mb-1">{children}</h3>,
    p: ({ children }: any) => <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>,
    ul: ({ children }: any) => <ul className="list-none space-y-1 mb-3">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1 mb-3 ml-2">{children}</ol>,
    li: ({ children }: any) => <li className="text-sm text-gray-700">{children}</li>,
    strong: ({ children }: any) => <strong className="font-semibold text-gray-900">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-gray-700">{children}</em>,
    code: ({ children }: any) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-blue-600">{children}</code>,
    pre: ({ children }: any) => <pre className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
    blockquote: ({ children }: any) => <blockquote className="border-l-4 border-blue-500 pl-3 italic text-gray-600 mb-2">{children}</blockquote>,
    a: ({ href, children }: any) => <a href={href} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  };

  const tierInfo = getTierDisplayInfo();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto h-screen flex flex-col">
        {/* Enhanced Header with Tier Status */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-bold text-sm">{tierInfo.icon}</span>
            </div>
            <div>
              <h1 className="font-semibold text-lg">{tierInfo.title}</h1>
              <p className="text-blue-100 text-sm">
                {isLoadingTier ? 'Loading tier information...' : tierInfo.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* New Conversation Button */}
            {messages.length > 1 && (
              <button
                onClick={startNewConversation}
                className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors flex items-center space-x-1"
                title="Start a new conversation"
              >
                <span>🔄</span>
                <span>New Chat</span>
              </button>
            )}
            
            {/* Upgrade Button for Free Users */}
            {userTierData?.tier === 'Free' && (
              <button 
                onClick={() => window.open('https://vadiy.com/upgrade', '_blank')}
                className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-yellow-900 rounded-lg text-sm font-medium flex items-center space-x-1"
                title="Upgrade to Premium for full access"
              >
                <span>💎</span>
                <span>Upgrade</span>
              </button>
            )}
            
            {/* Status Indicator */}
            <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></span>
              Encrypted
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>
          {messages.map((message) => (
            <div key={message.id} className={`flex items-start space-x-3 max-w-4xl ${message.role === 'user' ? 'flex-row-reverse space-x-reverse ml-auto' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0 ${message.role === 'user' ? 'bg-blue-600' : 'bg-green-600'}`}>
                {message.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`px-4 py-3 rounded-lg leading-relaxed ${
                  message.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-sm text-sm' 
                    : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'
                }`}>
                  {message.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        components={markdownComponents}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-sm">{message.content}</div>
                  )}
                </div>
                <div className={`text-xs text-gray-500 mt-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex items-start space-x-3 max-w-4xl">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0 bg-green-600">
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="px-4 py-3 rounded-lg bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                    <span className="text-sm text-gray-600">VADIY is searching the database and preparing your response...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about veteran benefits, services, or resources..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none text-sm"
                rows={1}
                disabled={isLoading || !sessionToken || !conversationId}
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading || !sessionToken || !conversationId}
              className="bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {isLoading ? '⋯' : 'Send'}
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-1"></span>
                Connected
              </span>
              {sessionToken && (
                <span>Session Active</span>
              )}
              {/* Enhanced tier-aware memory status */}
              {conversationId && messages.length > 1 && userTierData && (
                <span className="flex items-center text-blue-600">
                  <span className="mr-1">🧠</span>
                  {userTierData.features.fullMemory 
                    ? `Memory Active (${messages.length - 1}/${userTierData.limits.conversationHistory})`
                    : `Limited Memory (${Math.min(messages.length - 1, userTierData.limits.conversationHistory)}/${userTierData.limits.conversationHistory})`
                  }
                </span>
              )}
              {/* Tier Status */}
              {userTierData && (
                <span className={`flex items-center ${
                  userTierData.tier === 'Free' 
                    ? 'text-gray-600' 
                    : userTierData.tier === 'Premium' 
                      ? 'text-blue-600' 
                      : 'text-yellow-600'
                }`}>
                  <span className="mr-1">{tierInfo.icon}</span>
                  {userTierData.tier} Tier
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 text-gray-400">
              {userTierData && (
                <span className="text-xs">
                  {userTierData.limits.maxTokens} tokens • {userTierData.limits.messagesPerDay} msg/day
                </span>
              )}
              <span>VADIY 2025</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
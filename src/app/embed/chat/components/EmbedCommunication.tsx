/**
 * EmbedCommunication Component
 * Handles cross-frame communication for embedded chat
 */
'use client';

import { useEffect, useRef } from 'react';

interface EmbedCommunicationProps {
  isMinimized: boolean;
  containerHeight: number;
}

export default function EmbedCommunication({ isMinimized, containerHeight }: EmbedCommunicationProps) {
  const previousHeightRef = useRef<number>(containerHeight);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  // Send messages to parent frame
  const sendMessageToParent = (type: string, data: any) => {
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type, data, source: 'veteran-chat' }, '*');
      } catch (e) {
        console.error('Error sending message to parent:', e);
      }
    }
  };
  
  // Handle resize events
  useEffect(() => {
    const sendHeightUpdate = () => {
      const newHeight = document.body.scrollHeight;
      
      // Only send update if height changed significantly
      if (Math.abs(newHeight - previousHeightRef.current) > 5) {
        previousHeightRef.current = newHeight;
        sendMessageToParent('resize', { height: newHeight });
      }
    };
    
    // Initial height notification
    setTimeout(sendHeightUpdate, 300);
    
    // Set up resize observer
    if (typeof ResizeObserver !== 'undefined' && !resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(sendHeightUpdate);
      resizeObserverRef.current.observe(document.body);
    } else {
      // Fallback for browsers without ResizeObserver
      window.addEventListener('resize', sendHeightUpdate);
    }
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      window.removeEventListener('resize', sendHeightUpdate);
    };
  }, [containerHeight]);
  
  // Send status updates
  useEffect(() => {
    sendMessageToParent('status', { isMinimized });
  }, [isMinimized]);
  
  // Listen for messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate message
      if (!event.data || typeof event.data !== 'object' || event.data.source !== 'veteran-embed') {
        return;
      }
      
      // Handle specific message types
      switch (event.data.type) {
        case 'requestHeight':
          sendMessageToParent('resize', { height: document.body.scrollHeight });
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Notify parent that embed is ready
    sendMessageToParent('ready', { height: document.body.scrollHeight });
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
  
  // This component doesn't render anything
  return null;
}

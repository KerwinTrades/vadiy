'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="min-h-screen bg-blue-900">
      <div className="max-w-7xl mx-auto px-4 py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-6">
            🇺🇸 Veteran Chat Assistant
          </h1>
          
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Secure AI-powered assistance for U.S. military veterans. 
            Get help with benefits, opportunities, and resources.
          </p>

          <div className="space-y-4">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                🔧 Setup Status
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Environment:</span>
                  <span className="font-medium text-green-600">✅ Configured</span>
                </div>
                <div className="flex justify-between">
                  <span>Dependencies:</span>
                  <span className="font-medium text-green-600">✅ Installed</span>
                </div>
                <div className="flex justify-between">
                  <span>Database:</span>
                  <span className="font-medium text-yellow-600">⏳ Testing...</span>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Next Step:</strong> Test the database connection at{' '}
                  <a 
                    href="/api/health/database" 
                    className="underline hover:text-blue-600"
                    target="_blank"
                  >
                    /api/health/database
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
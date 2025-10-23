
import React, { useState, useRef, useEffect } from 'react';
import { FALLBACK_API_KEYS } from '../config';

interface ApiKeySetupProps {
  onApiKeySet: (apiKey: string) => void;
  error?: boolean;
  loading?: boolean;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onApiKeySet, error, loading }) => {
  const [key, setKey] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const timeoutRef = useRef<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim() && !loading) {
      onApiKeySet(key.trim());
    }
  };

  const handleUseFallbackKey = () => {
    const randomKey = FALLBACK_API_KEYS[Math.floor(Math.random() * FALLBACK_API_KEYS.length)];
    onApiKeySet(randomKey);
  };
  
  const handleTitleClick = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (newCount >= 5) {
      handleUseFallbackKey();
      setClickCount(0); // Reset after activation
    } else {
      // Reset the counter if the user doesn't click again within 1.5 seconds
      timeoutRef.current = window.setTimeout(() => {
        setClickCount(0);
      }, 1500);
    }
  };
  
  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);


  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 border border-[#FFA500]/30 rounded-lg shadow-lg shadow-[#FFA500]/10">
        <div className="text-center">
          <h1 
            onClick={handleTitleClick} 
            className="text-3xl font-bold text-[#FFA500] cursor-pointer"
            style={{ userSelect: 'none' }}
            title="Secret Entrance"
            >
              SHΞN™
          </h1>
          <p className="text-[#FF6600]">TroubleRooting Lab</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-[#FFA500]">
              Google Gemini API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your API key here"
              className="mt-1 block w-full px-3 py-2 bg-[#050505] border border-[#FFA500]/50 rounded-md text-[#FFA500] placeholder:text-[#FFA500]/40 focus:outline-none focus:ring-1 focus:ring-[#FF6600] focus:border-[#FF6600]"
              required
              disabled={loading}
            />
             {error && <p className="mt-2 text-xs text-red-400">کلید API ارائه شده نامعتبر به نظر می رسد. لطفا دوباره تلاش کنید.</p>}
            <p className="mt-2 text-xs text-gray-400">
              کلید شما فقط در حافظه محلی مرورگر شما ذخیره می شود.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-[#050505] bg-[#FFA500] hover:bg-[#FF6600] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050505] focus:ring-[#FF6600] transition-colors disabled:bg-[#FFA500]/50 disabled:cursor-not-allowed"
          >
            {loading ? 'در حال اعتبارسنجی...' : 'ورود به آزمایشگاه'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ApiKeySetup;

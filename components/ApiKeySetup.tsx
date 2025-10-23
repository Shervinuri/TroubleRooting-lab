
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
  const clickTimerRef = useRef<number | null>(null);

  const [isAutoTesting, setIsAutoTesting] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [allKeysFailed, setAllKeysFailed] = useState(false);

  // This effect handles the chain reaction of testing fallback keys
  useEffect(() => {
    // Trigger only if auto-testing, an error occurred, and we are not currently loading a new key
    if (isAutoTesting && error && !loading) {
      const nextIndex = currentTestIndex + 1;
      if (nextIndex < FALLBACK_API_KEYS.length) {
        // Move to the next key
        setCurrentTestIndex(nextIndex);
        onApiKeySet(FALLBACK_API_KEYS[nextIndex]);
      } else {
        // All keys have been tried and failed
        setIsAutoTesting(false);
        setAllKeysFailed(true);
      }
    }
  }, [error, loading, isAutoTesting, currentTestIndex, onApiKeySet]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim() && !loading && !isAutoTesting) {
      onApiKeySet(key.trim());
    }
  };

  const handleFallbackKeyClick = (fallbackKey: string) => {
    if (!loading && !isAutoTesting) {
      setKey(''); // Clear manual input
      onApiKeySet(fallbackKey);
    }
  };

  const handleTitleClick = () => {
    if (isAutoTesting) return; // Don't allow clicks during auto-test

    // Reset the click reset timer on each click
    if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
    }

    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);

    if (newClickCount >= 5) {
        setClickCount(0); // Reset for next time
        setKey(''); // Clear manual input
        setAllKeysFailed(false);
        setCurrentTestIndex(0);
        setIsAutoTesting(true);
        onApiKeySet(FALLBACK_API_KEYS[0]); // Start the process
    } else {
        // Reset count if clicks are too far apart (e.g., > 1 second)
        clickTimerRef.current = window.setTimeout(() => {
            setClickCount(0);
        }, 1000);
    }
  };


  const getButtonText = () => {
    if (isAutoTesting) {
        return `در حال تست کلید ${currentTestIndex + 1} از ${FALLBACK_API_KEYS.length}...`;
    }
    if (loading) {
        return 'در حال اعتبارسنجی...';
    }
    return 'ورود به آزمایشگاه';
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-[#0c0c0c]/80 backdrop-blur-sm border border-[#FFA500]/30 rounded-lg shadow-lg shadow-[#FFA500]/10">
        <div className="text-center">
          <h1 
            onClick={handleTitleClick}
            className="text-3xl font-bold text-[#FFA500] cursor-pointer select-none"
            title="برای تست خودکار کلیدها 5 بار کلیک کنید"
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
              disabled={loading || isAutoTesting}
            />
             {error && !isAutoTesting && <p className="mt-2 text-xs text-red-400">کلید API ارائه شده نامعتبر به نظر می رسد. لطفا دوباره تلاش کنید.</p>}
             {allKeysFailed && <p className="mt-2 text-xs text-red-400">متاسفانه هیچکدام از کلیدهای جایگزین کار نکرد. لطفا یک کلید معتبر وارد کنید.</p>}
            <p className="mt-2 text-xs text-gray-400">
              کلید شما فقط در حافظه محلی مرورگر شما ذخیره می شود.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading || isAutoTesting || !key.trim()}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-[#050505] bg-[#FFA500] hover:bg-[#FF6600] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050505] focus:ring-[#FF6600] transition-colors disabled:bg-[#FFA500]/50 disabled:cursor-not-allowed"
          >
            {getButtonText()}
          </button>
        </form>

        <div className="pt-4 border-t border-[#FFA500]/20">
            <p className="text-center text-sm text-gray-400 mb-3">
                یا یکی از کلیدهای جایگزین را امتحان کنید:
            </p>
            <div className="grid grid-cols-2 gap-2">
                {FALLBACK_API_KEYS.map((fallbackKey, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => handleFallbackKeyClick(fallbackKey)}
                        disabled={loading || isAutoTesting}
                        className="w-full text-center py-2 px-4 border border-[#FFA500]/50 rounded-md shadow-sm text-sm font-medium text-[#FFA500] bg-transparent hover:bg-[#FFA500]/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050505] focus:ring-[#FF6600] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        تست کلید {index + 1}
                    </button>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
};

export default ApiKeySetup;

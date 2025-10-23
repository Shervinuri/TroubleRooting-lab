
import React, { useState, useEffect } from 'react';
import TroubleRootingLab from './components/TroubleRootingLab';
import ApiKeySetup from './components/ApiKeySetup';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [keyError, setKeyError] = useState(false);

  useEffect(() => {
    try {
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        setApiKey(storedKey);
      }
    } catch (error) {
      console.error("Could not access local storage:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleApiKeySet = (key: string) => {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      setApiKey(key);
      setKeyError(false);
    } catch (error) {
      console.error("Could not set item in local storage:", error);
    }
  };

  const handleInvalidApiKey = () => {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKey(null);
      setKeyError(true);
    } catch (error) {
       console.error("Could not remove item from local storage:", error);
    }
  };
  
  if (isLoading) {
    return null; // Or a loading spinner
  }

  if (!apiKey) {
    return <ApiKeySetup onApiKeySet={handleApiKeySet} error={keyError} />;
  }

  return (
    <div className="bg-[#050505] text-[#FFA500] min-h-screen font-mono">
      <TroubleRootingLab apiKey={apiKey} onInvalidApiKey={handleInvalidApiKey} />
    </div>
  );
};

export default App;

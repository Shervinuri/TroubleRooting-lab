
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import TroubleRootingLab from './components/TroubleRootingLab';
import ApiKeySetup from './components/ApiKeySetup';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
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
      setIsLoaded(true);
    }
  }, []);

  const handleApiKeySet = async (key: string) => {
    setIsValidating(true);
    setKeyError(false);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'ping',
      });
      
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      setApiKey(key);
    } catch (error) {
      console.error("API Key validation failed:", error);
      setKeyError(true);
    } finally {
      setIsValidating(false);
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
  
  if (!isLoaded) {
    return null; // Or a loading spinner
  }

  if (!apiKey) {
    return <ApiKeySetup onApiKeySet={handleApiKeySet} error={keyError} loading={isValidating} />;
  }

  return (
    <div className="bg-[#050505] text-[#FFA500] min-h-screen font-mono">
      <TroubleRootingLab apiKey={apiKey} onInvalidApiKey={handleInvalidApiKey} />
    </div>
  );
};

export default App;

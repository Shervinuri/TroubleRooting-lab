
import React, { useState } from 'react';

interface ApiKeySetupProps {
  onApiKeySet: (apiKey: string) => void;
  error?: boolean;
}

const ApiKeySetup: React.FC<ApiKeySetupProps> = ({ onApiKeySet, error }) => {
  const [key, setKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onApiKeySet(key.trim());
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-full max-w-md p-8 space-y-6 border border-[#FFA500]/30 rounded-lg shadow-lg shadow-[#FFA500]/10">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#FFA500]">SHΞN™</h1>
          <p className="text-[#FF6600]">TroubleRooting Lab</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
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
            />
             {error && <p className="mt-2 text-xs text-red-400">The provided API key appears to be invalid. Please try again.</p>}
            <p className="mt-2 text-xs text-gray-400">
              Your key is stored only in your browser's local storage.
            </p>
          </div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-[#050505] bg-[#FFA500] hover:bg-[#FF6600] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050505] focus:ring-[#FF6600] transition-colors"
          >
            Enter Lab
          </button>
        </form>
      </div>
    </div>
  );
};

export default ApiKeySetup;

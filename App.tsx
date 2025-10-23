
import React from 'react';
// Fix: Removed component that is no longer used for API key setup.
// The app now relies on environment variables for the API key.
import TroubleRootingLab from './components/TroubleRootingLab';
import NetworkBackground from './components/NetworkBackground';

const App: React.FC = () => {
  // Fix: Removed all state and logic related to manual API key input,
  // validation, and storage to adhere to the project's guidelines.
  // The application now renders the main lab component directly.
  return (
    <div className="relative w-full h-screen overflow-hidden font-mono text-[#FFA500]">
      <NetworkBackground />
      <div className="relative z-10 w-full h-full">
          <TroubleRootingLab />
      </div>
    </div>
  );
};

export default App;

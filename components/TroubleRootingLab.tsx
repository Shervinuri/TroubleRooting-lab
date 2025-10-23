import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import type { ChatMessage, ContentPart } from '../types';
import { MessageSender } from '../types';
import ChatMessageComponent from './ChatMessage';
import { SYSTEM_PROMPT, availableTools } from '../constants';
import { createBlob, decode, decodeAudioData } from '../utils/audio';

type ConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type ActiveTool = 'UPLOAD' | 'DOWNLOAD' | null;

const parseTranscriptToParts = (text: string): ContentPart[] => {
    if (!text) return [];
    const parts: ContentPart[] = [];
    const regex = /(\[.*?\]\(.*?\))|(`.*?`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        }
        const fullMatch = match[0];
        if (fullMatch.startsWith('[')) {
            const urlMatch = fullMatch.match(/\((.*?)\)/);
            if(urlMatch) {
                const url = urlMatch[1];
                 if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    parts.push({ type: 'video', content: url });
                } else {
                    parts.push({ type: 'link', content: url });
                }
            }
        } else if (fullMatch.startsWith('`')) {
            parts.push({ type: 'code', content: fullMatch.slice(1, -1) });
        }
        lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};

const MicrophoneIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line>
    </svg>
);

const TroubleRootingLab: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentOutputTranscription, setCurrentOutputTranscription] = useState('');
  const [isTextInputVisible, setTextInputVisible] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [downloadInfo, setDownloadInfo] = useState<{url: string; filename: string} | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioResourcesRef = useRef<{ stream: MediaStream | null; audioContext: AudioContext | null; scriptProcessor: ScriptProcessorNode | null; source: MediaStreamAudioSourceNode | null; }>({ stream: null, audioContext: null, scriptProcessor: null, source: null });
  const outputAudioRef = useRef<{ audioContext: AudioContext | null; nextStartTime: number; sources: Set<AudioBufferSourceNode>; }>({ audioContext: null, nextStartTime: 0, sources: new Set() });

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, currentOutputTranscription]);
  
  const cleanupAudio = useCallback(() => {
      audioResourcesRef.current.stream?.getTracks().forEach(track => track.stop());
      audioResourcesRef.current.scriptProcessor?.disconnect();
      audioResourcesRef.current.source?.disconnect();
      if (audioResourcesRef.current.audioContext?.state !== 'closed') {
        audioResourcesRef.current.audioContext?.close().catch(console.error);
      }
      audioResourcesRef.current = { stream: null, audioContext: null, scriptProcessor: null, source: null };
      
      outputAudioRef.current.sources.forEach(source => source.stop());
      outputAudioRef.current.sources.clear();
      if (outputAudioRef.current.audioContext?.state !== 'closed') {
        outputAudioRef.current.audioContext?.close().catch(console.error);
      }
      outputAudioRef.current = { audioContext: null, nextStartTime: 0, sources: new Set() };
  }, []);
  
  const silentCleanup = useCallback(() => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close()).catch(console.error);
        sessionPromiseRef.current = null;
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const handleDisconnect = useCallback(() => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close()).catch(console.error);
        sessionPromiseRef.current = null;
    }
    cleanupAudio();
    setConnectionState('IDLE');
  }, [cleanupAudio]);

  const handleToolCall = (fc: any) => {
    sessionPromiseRef.current?.then(session => {
        let toolResponse = { result: "OK" };
        switch(fc.name) {
            case 'show_text_input':
                setTextInputVisible(true);
                toolResponse.result = "Text input is now visible.";
                break;
            case 'provide_upload_button':
                setActiveTool('UPLOAD');
                toolResponse.result = "Upload button is now visible.";
                break;
            case 'provide_download_link':
                setDownloadInfo({ url: fc.args.url, filename: fc.args.filename });
                setActiveTool('DOWNLOAD');
                toolResponse.result = "Download link is now visible.";
                break;
            case 'search_web':
                // Simulate a search delay
                setTimeout(() => {
                    const searchResult = { result: `Simulated search result for query: ${fc.args.query}` };
                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: searchResult } });
                }, 2000);
                return; // Don't send immediate response for async tool
        }
        session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: toolResponse } });
    });
  };

  const startSession = async () => {
    setConnectionState('CONNECTING');
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMessage('Audio recording is not supported by your browser.');
        setConnectionState('ERROR');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioResourcesRef.current.stream = stream;

        // Fix: Use process.env.API_KEY as per guidelines.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' }}},
                systemInstruction: SYSTEM_PROMPT,
                outputAudioTranscription: {},
                tools: [availableTools]
            },
            callbacks: {
                onopen: () => {
                    setConnectionState('CONNECTED');
                    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    const source = inputAudioContext.createMediaStreamSource(stream);

                    audioResourcesRef.current.audioContext = inputAudioContext;
                    audioResourcesRef.current.scriptProcessor = scriptProcessor;
                    audioResourcesRef.current.source = source;
                    outputAudioRef.current.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                          session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.toolCall) {
                        message.toolCall.functionCalls.forEach(handleToolCall);
                    }
                    if (message.serverContent?.outputTranscription) {
                        setCurrentOutputTranscription(prev => prev + message.serverContent.outputTranscription.text);
                    }
                    if (message.serverContent?.turnComplete) {
                        const finalOutput = currentOutputTranscription + (message.serverContent.outputTranscription?.text || '');
                        if (finalOutput.trim()) {
                            setChatHistory(prev => [
                                ...prev,
                                { id: `shen-${Date.now()}`, sender: MessageSender.Shen, parts: parseTranscriptToParts(finalOutput) }
                            ]);
                        }
                        setCurrentOutputTranscription('');
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    const outCtx = outputAudioRef.current.audioContext;
                    if (base64Audio && outCtx) {
                        outputAudioRef.current.nextStartTime = Math.max(outputAudioRef.current.nextStartTime, outCtx.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
                        const source = outCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outCtx.destination);
                        const currentSources = outputAudioRef.current.sources;
                        source.addEventListener('ended', () => { currentSources.delete(source); });
                        source.start(outputAudioRef.current.nextStartTime);
                        outputAudioRef.current.nextStartTime += audioBuffer.duration;
                        currentSources.add(source);
                    }
                    
                    if(message.serverContent?.interrupted) {
                        outputAudioRef.current.sources.forEach(s => s.stop());
                        outputAudioRef.current.sources.clear();
                        outputAudioRef.current.nextStartTime = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    // Fix: Removed key retry logic. Set error state directly.
                    console.error('API connection failed:', e);
                    silentCleanup();
                    setErrorMessage('Failed to connect. Please check your API key and network connection.');
                    setConnectionState('ERROR');
                },
                onclose: () => {
                    handleDisconnect();
                },
            },
        });

    } catch (error) {
        console.error('Failed to start session:', error);
        setErrorMessage(`Failed to start session. Please ensure your microphone is enabled. Error: ${error instanceof Error ? error.message : String(error)}`);
        setConnectionState('ERROR');
        cleanupAudio();
    }
  };

  const handleConnect = () => {
    // Fix: Removed key management logic.
    setErrorMessage(null);
    startSession();
  };
  
  const handleTextSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // This is a placeholder. In a real app, you would send this text
      // to the model, likely requiring a different API call or session type.
      alert("Text input is a placeholder in this demo.");
      setTextInputVisible(false);
  }

  useEffect(() => {
    return () => { handleDisconnect(); };
  }, [handleDisconnect]);

  const renderTool = () => {
    switch (activeTool) {
        case 'UPLOAD':
            return (
                <div className="flex justify-center p-4">
                    <input type="file" className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#FFA500]/10 file:text-[#FFA500] hover:file:bg-[#FFA500]/20"/>
                </div>
            )
        case 'DOWNLOAD':
            return (
                 <div className="flex justify-center p-4">
                    <a href={downloadInfo?.url} download={downloadInfo?.filename} className="px-6 py-2 bg-[#FFA500] text-[#050505] rounded-md hover:bg-[#FF6600] transition-colors font-bold">
                        Download {downloadInfo?.filename}
                    </a>
                </div>
            )
        default: return null;
    }
  }
  
  // Fix: Changed definition of isSessionActive to correctly handle the 'CONNECTING' state on the pre-connection UI.
  const isSessionActive = connectionState === 'CONNECTED';

  if (!isSessionActive) {
    return (
        <div className="flex flex-col h-screen max-w-3xl mx-auto p-4 text-center justify-between">
            <header className="p-4">
                <h1 className="text-2xl font-bold text-[#FFA500]">SHΞN™</h1>
                <p className="text-sm text-[#FF6600]">TroubleRooting Lab</p>
            </header>
            <main className="flex flex-col items-center justify-center flex-1">
                <button
                    onClick={handleConnect}
                    disabled={connectionState === 'CONNECTING'}
                    className="w-24 h-24 rounded-full bg-[#FFA500] text-[#050505] flex items-center justify-center transition-all duration-300 ease-in-out hover:scale-110 disabled:scale-100 disabled:bg-[#FFA500]/50 animate-pulse disabled:animate-none"
                >
                    <MicrophoneIcon />
                </button>
            </main>
            <footer className="h-12">
                <p className="text-sm text-[#FFA500]/70 mb-2">
                    {/* Fix: Added a message for the 'CONNECTING' state. */}
                    {connectionState === 'IDLE' && 'Tap the microphone to start'}
                    {connectionState === 'CONNECTING' && 'Connecting...'}
                    {connectionState === 'ERROR' && (errorMessage || 'Connection error')}
                    {connectionState === 'DISCONNECTED' && 'Session ended. Tap to restart'}
                </p>
            </footer>
        </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <header className="text-center p-4 border-b border-[#FFA500]/20 flex-shrink-0">
        <h1 className="text-2xl font-bold text-[#FFA500]">SHΞN™</h1>
        <p className="text-sm text-[#FF6600]">TroubleRooting Lab</p>
      </header>
      <main className="flex-1 overflow-y-auto py-4 pr-2">
        <div className="space-y-6">
          {chatHistory.filter(msg => msg.sender === MessageSender.Shen).map((msg) => (
            <ChatMessageComponent key={msg.id} message={msg} />
          ))}
          {currentOutputTranscription && (
               <ChatMessageComponent message={{id: 'transcription', sender: MessageSender.Shen, parts: [{type: 'text', content: currentOutputTranscription}]}} />
          )}
          {renderTool()}
          <div ref={chatEndRef} />
        </div>
      </main>
      <footer className="pt-4 border-t border-[#FFA500]/20 flex-shrink-0 flex flex-col items-center justify-center">
        {isTextInputVisible ? (
             <form onSubmit={handleTextSubmit} className="w-full flex items-center gap-2 p-2">
                <input type="text" placeholder="Type your message..." className="flex-1 bg-[#1A1A1A] border border-[#FFA500]/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-1 focus:ring-[#FF6600]"/>
                <button type="submit" className="px-4 py-2 bg-[#FFA500] text-[#050505] rounded-lg font-bold">Send</button>
             </form>
        ) : (
            <button
                onClick={handleDisconnect}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${connectionState === 'CONNECTED' ? 'bg-red-500/80 text-white' : 'bg-[#FFA500]/50 text-gray-300'}`}
              >
                <MicrophoneIcon />
            </button>
        )}
      </footer>
    </div>
  );
};

export default TroubleRootingLab;
import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: The 'LiveSession' type is not exported from the '@google/genai' package.
import { GoogleGenAI, Modality, Blob, LiveServerMessage } from '@google/genai';
import type { ChatMessage, ContentPart } from '../types';
import { MessageSender } from '../types';
import ChatMessageComponent from './ChatMessage';
import { SYSTEM_PROMPT } from '../constants';
import { encode, decode, decodeAudioData, createBlob } from '../utils/audio';

type ConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

// Regex to parse markdown-like formats from the model's text response
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
        if (fullMatch.startsWith('[')) { // Link or Video
            const linkTextMatch = fullMatch.match(/\[(.*?)\]/);
            const urlMatch = fullMatch.match(/\((.*?)\)/);
            if(linkTextMatch && urlMatch) {
                const url = urlMatch[1];
                 if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    parts.push({ type: 'video', content: url });
                } else {
                    parts.push({ type: 'link', content: url });
                }
            }
        } else if (fullMatch.startsWith('`')) { // Code
            parts.push({ type: 'code', content: fullMatch.slice(1, -1) });
        }
        lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};


// FIX: Removed apiKey prop to use environment variables directly as per guidelines.
const TroubleRootingLab: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [currentInputTranscription, setCurrentInputTranscription] = useState('');
  const [currentOutputTranscription, setCurrentOutputTranscription] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  // FIX: The 'LiveSession' type is not exported from the '@google/genai' package, using 'any' as a workaround.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioResourcesRef = useRef<{
    stream: MediaStream | null;
    audioContext: AudioContext | null;
    scriptProcessor: ScriptProcessorNode | null;
    source: MediaStreamAudioSourceNode | null;
  }>({ stream: null, audioContext: null, scriptProcessor: null, source: null });
  
  const outputAudioRef = useRef<{
    audioContext: AudioContext | null;
    nextStartTime: number;
    sources: Set<AudioBufferSourceNode>;
  }>({ audioContext: null, nextStartTime: 0, sources: new Set() });


  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, currentInputTranscription, currentOutputTranscription]);
  
  const cleanupAudio = useCallback(() => {
      // Input
      audioResourcesRef.current.stream?.getTracks().forEach(track => track.stop());
      audioResourcesRef.current.scriptProcessor?.disconnect();
      audioResourcesRef.current.source?.disconnect();
      // FIX: Check if audio context is already closed before attempting to close it.
      if (audioResourcesRef.current.audioContext?.state !== 'closed') {
        audioResourcesRef.current.audioContext?.close();
      }
      audioResourcesRef.current = { stream: null, audioContext: null, scriptProcessor: null, source: null };
      
      // Output
      outputAudioRef.current.sources.forEach(source => source.stop());
      outputAudioRef.current.sources.clear();
      // FIX: Check if audio context is already closed before attempting to close it.
      if (outputAudioRef.current.audioContext?.state !== 'closed') {
        outputAudioRef.current.audioContext?.close();
      }
      outputAudioRef.current = { audioContext: null, nextStartTime: 0, sources: new Set() };
  }, []);

  const handleDisconnect = useCallback(() => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
        sessionPromiseRef.current = null;
    }
    cleanupAudio();
    setConnectionState('IDLE');
  }, [cleanupAudio]);

  const handleConnect = async () => {
    setConnectionState('CONNECTING');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support audio recording.');
        setConnectionState('ERROR');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioResourcesRef.current.stream = stream;

        // FIX: API key is now sourced from environment variables as per guidelines.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' }}},
                systemInstruction: SYSTEM_PROMPT,
                inputAudioTranscription: {},
                outputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    setConnectionState('CONNECTED');
                    // FIX: Added type assertion for window.webkitAudioContext to handle vendor prefixes for older browsers.
                    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    const source = inputAudioContext.createMediaStreamSource(stream);

                    audioResourcesRef.current.audioContext = inputAudioContext;
                    audioResourcesRef.current.scriptProcessor = scriptProcessor;
                    audioResourcesRef.current.source = source;
                    
                    // FIX: Added type assertion for window.webkitAudioContext to handle vendor prefixes for older browsers.
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
                    // Handle transcription
                    if (message.serverContent?.inputTranscription) {
                        setCurrentInputTranscription(prev => prev + message.serverContent.inputTranscription.text);
                    }
                    if (message.serverContent?.outputTranscription) {
                        setCurrentOutputTranscription(prev => prev + message.serverContent.outputTranscription.text);
                    }
                    if (message.serverContent?.turnComplete) {
                        const finalInput = currentInputTranscription + (message.serverContent.inputTranscription?.text || '');
                        const finalOutput = currentOutputTranscription + (message.serverContent.outputTranscription?.text || '');
                        
                        setChatHistory(prev => [
                            ...prev,
                            { id: `user-${Date.now()}`, sender: MessageSender.User, parts: [{ type: 'text', content: finalInput }] },
                            { id: `shen-${Date.now()}`, sender: MessageSender.Shen, parts: parseTranscriptToParts(finalOutput) }
                        ]);
                        setCurrentInputTranscription('');
                        setCurrentOutputTranscription('');
                    }

                    // Handle audio output
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
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
                    console.error('Live session error:', e);
                    setConnectionState('ERROR');
                    handleDisconnect();
                },
                onclose: () => {
                    handleDisconnect();
                },
            },
        });

    } catch (error) {
        console.error('Failed to start session:', error);
        setConnectionState('ERROR');
        cleanupAudio();
    }
  };

  useEffect(() => {
    // Cleanup on component unmount
    return () => {
        handleDisconnect();
    };
  }, [handleDisconnect]);


  const renderStatus = () => {
    switch (connectionState) {
        case 'IDLE': return 'Press Start to connect...';
        case 'CONNECTING': return 'Connecting to SHΞN™...';
        case 'CONNECTED': return 'Connected. Start speaking.';
        case 'DISCONNECTED': return 'Disconnected. Press Start to reconnect.';
        case 'ERROR': return 'Connection error. Please refresh and try again.';
        default: return '';
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      <header className="text-center p-4 border-b border-[#FFA500]/20">
        <h1 className="text-2xl font-bold text-[#FFA500]">SHΞN™</h1>
        <p className="text-sm text-[#FF6600]">TroubleRooting Lab</p>
      </header>
      <main className="flex-1 overflow-y-auto py-4 pr-2">
        <div className="space-y-6">
          {chatHistory.map((msg) => (
            <ChatMessageComponent key={msg.id} message={msg} />
          ))}
          {currentOutputTranscription && (
              <div className="flex justify-start">
                <div className="max-w-full md:max-w-[85%] bg-[#FFA500]/5 p-4 rounded-lg rounded-bl-none text-[#FFA500]/60 italic">
                    {currentOutputTranscription}
                </div>
              </div>
          )}
          {currentInputTranscription && (
               <div className="flex justify-end">
                <div className="max-w-full md:max-w-[85%] bg-transparent border border-[#FFA500]/10 p-4 rounded-lg rounded-br-none text-[#FFA500]/40 italic">
                    {currentInputTranscription}
                </div>
              </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </main>
      <footer className="pt-4 border-t border-[#FFA500]/20 min-h-[100px] flex flex-col items-center justify-center">
        <div className="h-12 text-center">
            <p className="text-sm text-[#FFA500]/70 mb-2">{renderStatus()}</p>
        </div>
        {connectionState === 'IDLE' || connectionState === 'DISCONNECTED' || connectionState === 'ERROR' ? (
             <button
                onClick={handleConnect}
                className="px-6 py-2 bg-[#FFA500] text-[#050505] rounded-md hover:bg-[#FF6600] transition-colors font-bold"
              >
                Start Session
              </button>
        ) : (
            <button
                onClick={handleDisconnect}
                className="px-6 py-2 bg-transparent border border-[#FF6600] text-[#FF6600] rounded-md hover:bg-[#FF6600] hover:text-[#050505] transition-colors font-bold"
              >
                End Session
            </button>
        )}
      </footer>
    </div>
  );
};

export default TroubleRootingLab;
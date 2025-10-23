
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import type { ChatMessage, ContentPart } from '../types';
import { MessageSender } from '../types';
import ChatMessageComponent from './ChatMessage';
import { SYSTEM_PROMPT, availableTools } from '../constants';
import { createBlob, decode, decodeAudioData } from '../utils/audio';
import ThinkingIndicator from './ThinkingIndicator';

type ConnectionState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
type ActiveTool = 'UPLOAD' | 'DOWNLOAD' | null;

// Fix: Removed apiKey and onInvalidApiKey from props as they are no longer needed.
interface TroubleRootingLabProps {}

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

// Fix: Removed props from component signature as they are no longer needed.
const TroubleRootingLab: React.FC<TroubleRootingLabProps> = () => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentOutputTranscription, setCurrentOutputTranscription] = useState('');
  const [isTextInputVisible, setTextInputVisible] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [downloadInfo, setDownloadInfo] = useState<{url: string; filename: string} | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);


  const chatEndRef = useRef<HTMLDivElement>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioResourcesRef = useRef<{ stream: MediaStream | null; audioContext: AudioContext | null; scriptProcessor: ScriptProcessorNode | null; source: MediaStreamAudioSourceNode | null; }>({ stream: null, audioContext: null, scriptProcessor: null, source: null });
  const outputAudioRef = useRef<{ audioContext: AudioContext | null; nextStartTime: number; sources: Set<AudioBufferSourceNode>; }>({ audioContext: null, nextStartTime: 0, sources: new Set() });

  // Fix: Initialize GoogleGenAI with process.env.API_KEY as per coding guidelines.
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY! }), []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, currentOutputTranscription, activeTool]);
  
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
                setUploadedFileName(null);
                setActiveTool('UPLOAD');
                toolResponse.result = "Upload button is now visible.";
                break;
            case 'provide_download_link':
                setDownloadInfo({ url: fc.args.url, filename: fc.args.filename });
                setActiveTool('DOWNLOAD');
                toolResponse.result = "Download link is now visible.";
                break;
            case 'search_web':
                setTimeout(() => {
                    const searchResult = { result: `Simulated search result for query: ${fc.args.query}` };
                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: searchResult } });
                }, 2000);
                return; 
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

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
                tools: [availableTools],
                systemInstruction: SYSTEM_PROMPT,
            },
            callbacks: {
                onopen: () => {
                    setConnectionState('CONNECTED');

                    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    audioResourcesRef.current.audioContext = inputAudioContext;

                    outputAudioRef.current.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                    
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    audioResourcesRef.current.source = source;
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    audioResourcesRef.current.scriptProcessor = scriptProcessor;

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
                    if (message.serverContent?.outputTranscription?.text) {
                        setCurrentOutputTranscription(prev => prev + message.serverContent!.outputTranscription!.text);
                    }
                    
                    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (base64EncodedAudioString && outputAudioRef.current.audioContext) {
                        const ctx = outputAudioRef.current.audioContext;
                        let nextStartTime = Math.max(outputAudioRef.current.nextStartTime, ctx.currentTime);
                        
                        const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), ctx, 24000, 1);
                        const source = ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(ctx.destination);
                        
                        source.addEventListener('ended', () => {
                            outputAudioRef.current.sources.delete(source);
                        });
                        
                        source.start(nextStartTime);
                        outputAudioRef.current.nextStartTime = nextStartTime + audioBuffer.duration;
                        outputAudioRef.current.sources.add(source);
                    }

                    if (message.toolCall) {
                        message.toolCall.functionCalls.forEach(handleToolCall);
                    }

                    if (message.serverContent?.turnComplete) {
                        if (currentOutputTranscription) {
                            setChatHistory(prev => [...prev, {
                                sender: MessageSender.Shen,
                                parts: parseTranscriptToParts(currentOutputTranscription),
                                id: Date.now().toString(),
                            }]);
                            setCurrentOutputTranscription('');
                        }
                    }

                    const interrupted = message.serverContent?.interrupted;
                    if (interrupted) {
                        outputAudioRef.current.sources.forEach(source => source.stop());
                        outputAudioRef.current.sources.clear();
                        outputAudioRef.current.nextStartTime = 0;
                    }
                },
                onerror: (e: any) => {
                    console.error('Session error:', e);
                    setErrorMessage(`An error occurred: ${e.message}`);
                    setConnectionState('ERROR');
                    handleDisconnect();
                },
                onclose: () => {
                    console.log('Session closed.');
                    handleDisconnect();
                },
            },
        });
        await sessionPromiseRef.current;
    } catch (error: any) {
        // Fix: Removed onInvalidApiKey call as API key management UI is removed.
        console.error('Session setup failed:', error);
        setErrorMessage(`Connection failed: ${error.message}`);
        setConnectionState('ERROR');
    }
  };
  
  const handleTextSubmit = (text: string) => {
    if (text.trim() && sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        session.sendText(text.trim());
        setTextInputVisible(false);
      });
    }
  };
  
  const handleFileUpload = (file: File) => {
    if (file && sessionPromiseRef.current) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string).split(',')[1];
        sessionPromiseRef.current?.then(session => {
          session.sendRealtimeInput({ media: { data: base64Data, mimeType: file.type }});
          setUploadedFileName(file.name);
          setActiveTool(null);
        })
      };
      reader.readAsDataURL(file);
    }
  };


  useEffect(() => {
    return () => {
        handleDisconnect();
    };
  }, [handleDisconnect]);

  const renderConnectionButton = () => {
    switch (connectionState) {
        case 'IDLE':
        case 'DISCONNECTED':
        case 'ERROR':
            return (
                <button
                    onClick={startSession}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#FFA500] text-[#050505] font-bold text-lg shadow-lg shadow-[#FFA500]/30 hover:bg-[#FF6600] transition-all transform hover:scale-105"
                >
                    <MicrophoneIcon />
                    Start Session
                </button>
            );
        case 'CONNECTING':
            return (
                <div className="text-center">
                    <p className="text-lg animate-pulse">Connecting to SHΞN™...</p>
                    <p className="text-sm text-gray-400">Please allow microphone access</p>
                </div>
            );
        case 'CONNECTED':
            return (
                 <button
                    onClick={handleDisconnect}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-red-600 text-white font-bold text-lg shadow-lg shadow-red-500/30 hover:bg-red-700 transition-all transform hover:scale-105"
                >
                    <MicrophoneIcon />
                    End Session
                </button>
            );
    }
  };


  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-4">
        <header className="text-center py-4 border-b border-[#FFA500]/20">
            <h1 className="text-4xl font-bold text-[#FFA500]">SHΞN™</h1>
            <p className="text-[#FF6600]">TroubleRooting Lab</p>
        </header>
        
        <div className="flex-grow overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-[#FFA500]/50 scrollbar-track-transparent">
            {chatHistory.map((msg) => <ChatMessageComponent key={msg.id} message={msg} />)}
            {currentOutputTranscription && (
                <ChatMessageComponent message={{ sender: MessageSender.Shen, parts: [{ type: 'text', content: currentOutputTranscription }], id: 'transcription' }} />
            )}

            {activeTool === 'UPLOAD' && (
                <div className="flex justify-center">
                    <div className="bg-[#1A1A1A]/80 border border-[#FFA500]/30 p-4 rounded-lg text-center">
                        <p className="mb-2">Please upload your file:</p>
                        {uploadedFileName ? (
                            <p className="text-green-400">Uploaded: {uploadedFileName}</p>
                        ) : (
                            <input type="file" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                            className="text-sm text-slate-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-violet-50 file:text-[#FFA500]
                                hover:file:bg-violet-100" />
                        )}
                        <button onClick={() => setActiveTool(null)} className="mt-2 text-xs text-gray-400 hover:text-white">Cancel</button>
                    </div>
                </div>
            )}

            {activeTool === 'DOWNLOAD' && downloadInfo && (
                <div className="flex justify-center">
                    <div className="bg-[#1A1A1A]/80 border border-[#FFA500]/30 p-4 rounded-lg text-center">
                        <p className="mb-2">A file is ready for you:</p>
                        <a href={downloadInfo.url} download={downloadInfo.filename} className="inline-block bg-[#FFA500] text-[#050505] font-bold px-4 py-2 rounded-md hover:bg-[#FF6600] transition-colors">
                            Download {downloadInfo.filename}
                        </a>
                        <button onClick={() => setActiveTool(null)} className="mt-2 text-xs text-gray-400 hover:text-white">Dismiss</button>
                    </div>
                </div>
            )}

            {connectionState === 'CONNECTING' && <ThinkingIndicator />}
            <div ref={chatEndRef} />
        </div>
        
        <footer className="py-4 text-center">
             {errorMessage && <p className="text-red-400 mb-4">{errorMessage}</p>}

            {isTextInputVisible && (
                <form onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.target as HTMLFormElement).elements.namedItem('text-input') as HTMLInputElement;
                    handleTextSubmit(input.value);
                    input.value = '';
                }} className="flex gap-2 mb-4">
                    <input name="text-input" type="text" placeholder="Type your message..." className="flex-grow bg-[#050505] border border-[#FFA500]/50 rounded-lg px-4 py-2 text-[#FFA500] focus:outline-none focus:ring-1 focus:ring-[#FF6600]" />
                    <button type="submit" className="bg-[#FFA500] text-[#050505] px-4 py-2 rounded-lg font-bold hover:bg-[#FF6600]">Send</button>
                    <button type="button" onClick={() => setTextInputVisible(false)} className="text-gray-400 hover:text-white">Cancel</button>
                </form>
            )}

            <div className="flex justify-center">
                {renderConnectionButton()}
            </div>
        </footer>
    </div>
  );
};

// Fix: Add default export to resolve the import error in App.tsx
export default TroubleRootingLab;

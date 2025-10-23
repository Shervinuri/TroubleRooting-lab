import React, { useState } from 'react';
import type { ChatMessage, ContentPart } from '../types';
import { MessageSender } from '../types';

interface ChatMessageProps {
  message: ChatMessage;
}

const CodeBlock: React.FC<{ content: string }> = ({ content }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="bg-black/50 rounded-md my-2">
            <div className="flex justify-between items-center px-4 py-1 text-xs text-gray-400">
                <span>shell</span>
                <button onClick={handleCopy} className="flex items-center gap-1 hover:text-white">
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="p-4 text-sm whitespace-pre-wrap">
                <code>{content}</code>
            </pre>
        </div>
    );
};

const VideoBlock: React.FC<{ url: string }> = ({ url }) => {
    const getYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }
    const videoId = getYouTubeId(url);
    if (!videoId) {
        return <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#FF6600] hover:underline">Watch Video</a>;
    }
    return (
        <div className="aspect-video my-2">
            <iframe
                className="w-full h-full rounded-lg"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
            ></iframe>
        </div>
    );
};

export const ShenAvatar: React.FC = () => (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFA500]/20 to-[#FF6600]/20 border border-[#FFA500]/30 flex items-center justify-center text-[#ff8d00] font-bold text-lg flex-shrink-0 shadow-md shadow-[#FFA500]/10">
        <span>☬™</span>
    </div>
);

const ChatMessageComponent: React.FC<ChatMessageProps> = ({ message }) => {
  const isShen = message.sender === MessageSender.Shen;
  const isTranscription = message.id === 'transcription';

  const renderPart = (part: ContentPart, index: number) => {
    switch (part.type) {
      case 'text':
        return <p key={index}>{part.content}</p>;
      case 'link':
        return <a key={index} href={part.content} target="_blank" rel="noopener noreferrer" className="text-[#FF6600] hover:underline break-all">{part.content}</a>;
      case 'code':
        return <CodeBlock key={index} content={part.content} />;
      case 'video':
        return <VideoBlock key={index} url={part.content} />;
      default:
        return null;
    }
  };

  if (isShen) {
    return (
      <div className="flex items-end gap-3 justify-start animation-slide-up">
        <ShenAvatar />
        <div className="max-w-full md:max-w-[85%] bg-[#1A1A1A] border border-[#FFA500]/30 p-4 rounded-2xl rounded-bl-lg">
            <div className={`prose prose-invert prose-p:my-1 prose-a:text-[#FF6600] space-y-2 ${isTranscription ? 'text-gray-200/50' : 'text-gray-200'}`}>
              {message.parts.map(renderPart)}
            </div>
        </div>
      </div>
    );
  }

  // User messages are no longer rendered based on the new requirements
  return null;
};

export default ChatMessageComponent;
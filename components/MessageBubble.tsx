
import React from 'react';
import { Message } from '../types';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 shadow-sm ${
        isUser 
          ? 'bg-blue-600 text-white rounded-tr-none' 
          : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
      }`}>
        {message.audio && (
          <div className={`mb-3 p-3 rounded-lg flex items-center gap-3 ${
            isUser ? 'bg-blue-700' : 'bg-slate-50 border border-slate-200'
          }`}>
            <div className="bg-white/20 p-2 rounded-full">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-medium truncate">{message.audio.name}</p>
              <audio controls className="h-8 mt-1 w-full max-w-[200px]" src={message.audio.url} />
            </div>
          </div>
        )}
        
        <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words">
          {message.text}
        </div>
        
        <div className={`text-[10px] mt-2 opacity-60 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;

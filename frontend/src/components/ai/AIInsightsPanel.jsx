import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  ShieldAlert, 
  Zap, 
  Info,
  Terminal,
  MessageSquare,
  X
} from 'lucide-react';
// Neural Intelligence Link
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';
import { toast } from 'react-hot-toast';

const parseInline = (text) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-indigo-600 dark:text-indigo-400">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-rose-500 dark:text-rose-400 font-mono text-xs border border-slate-200 dark:border-slate-700">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const formatContent = (text) => {
  if (!text) return null;
  
  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      // Extract language and code
      const match = part.match(/```(\w*)\n([\s\S]*?)```/);
      const lang = match ? match[1] : '';
      const code = match ? match[2] : part.slice(3, -3).trim();
      
      return (
        <div key={index} className="relative my-3 group">
          {lang && (
            <div className="absolute right-3 top-3 text-[10px] font-black uppercase tracking-widest text-slate-500 opacity-50">
              {lang}
            </div>
          )}
          <pre className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-md leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      );
    }
    
    // Non-code block text
    const lines = part.split('\n');
    return lines.map((line, lineIndex) => {
      if (line.startsWith('### ')) {
        return <h3 key={`${index}-${lineIndex}`} className="text-base font-bold mt-4 mb-1 text-indigo-600 dark:text-indigo-400">{parseInline(line.replace('### ', ''))}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={`${index}-${lineIndex}`} className="text-lg font-bold mt-5 mb-2 text-indigo-600 dark:text-indigo-400">{parseInline(line.replace('## ', ''))}</h2>;
      }
      if (line.startsWith('# ')) {
        return <h1 key={`${index}-${lineIndex}`} className="text-xl font-black mt-6 mb-2 text-indigo-600 dark:text-indigo-400">{parseInline(line.replace('# ', ''))}</h1>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.substring(2);
        return <li key={`${index}-${lineIndex}`} className="ml-4 list-disc my-1 leading-relaxed">{parseInline(content)}</li>;
      }
      if (/^\d+\.\s/.test(line)) {
        const content = line.replace(/^\d+\.\s/, '');
        return <li key={`${index}-${lineIndex}`} className="ml-4 list-decimal my-1 leading-relaxed">{parseInline(content)}</li>;
      }
      if (line.trim() === '') return <div key={`${index}-${lineIndex}`} className="h-2" />;
      return <p key={`${index}-${lineIndex}`} className="my-1.5 leading-relaxed">{parseInline(line)}</p>;
    });
  });
};

const AIInsightsPanel = ({ contextData = null, onClose = null, initialPrompt = null }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { 
      role: 'bot', 
      content: "I am DRPE AI Assistant. I can help you analyze vulnerabilities, suggest remediation strategies, and summarize your infrastructure risks. What intelligence do you require?" 
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle Initial Prompt Auto-Trigger
  useEffect(() => {
    if (initialPrompt && messages.length === 1) {
      // Small delay to ensure the UI has settled
      const timer = setTimeout(() => {
        handleSend(null, initialPrompt);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialPrompt]);

  const handleSend = async (e, overrideInput = null) => {
    if (e) e.preventDefault();
    const messageToSend = overrideInput || input.trim();
    
    if (!messageToSend || isLoading) return;

    if (!overrideInput) setInput('');
    setMessages(prev => [...prev, { role: 'user', content: messageToSend }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('drpe_session_token') || import.meta.env.VITE_API_TOKEN || 'drpe-5af890944fd1e57cff37a67b8e946ee2'}`
        },
        body: JSON.stringify({
          message: messageToSend,
          history: messages.slice(1).map(m => ({ // Skip the intro
            role: m.role === 'bot' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          context: contextData
        })
      });

      if (!response.ok) {
        throw new Error('Intelligence Link Offline');
      }

      // ── New Streaming Logic ──
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedReply = '';

      // Initialize the bot message placeholder
      setMessages(prev => [...prev, { role: 'bot', content: '' }]);
      setIsLoading(false);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = decoder.decode(value, { stream: true });
        accumulatedReply += chunk;
        
        // Update the last message in place
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = accumulatedReply;
          return newMessages;
        });
      }
    } catch (error) {
      toast.error('AI Processing Failed: ' + error.message);
      setMessages(prev => [...prev, { role: 'bot', content: `Error: ${error.message}. Please verify your Intelligence connection.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const QuickActions = [
    { label: 'Summarize Risks', prompt: 'Provide a high-level executive summary of the current security posture. Focus on critical vulnerabilities and enterprise risk trends.' },
    { label: 'Analyze CVEs', prompt: 'Analyze the top 3 most critical CVEs found in my scan results. Explain why they are dangerous and which assets are most at risk.' },
    { label: 'Fix Strategy', prompt: 'Create a prioritized 5-step remediation roadmap for the identified vulnerabilities. Focus on high-impact patches first.' },
    { label: 'Threat Intel', prompt: 'Analyze the threat intelligence data. Are any of my active assets communicating with known malicious IPs or Tor nodes?' },
  ];

  return (
    <div className="flex flex-col h-full glass rounded-xl border border-indigo-brand-500/20 shadow-xl overflow-hidden relative">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
           <div className="p-1.5 bg-indigo-brand-500/10 rounded-lg">
             <Sparkles className="w-4 h-4 text-indigo-brand-500" />
           </div>
           <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">Tactical AI Copilot</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-medium" ref={scrollRef}>
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex gap-3 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                msg.role === 'bot' ? "bg-indigo-brand-500/10 border-indigo-brand-500/20 text-indigo-brand-500" : "bg-muted border-border text-muted-foreground"
              )}>
                {msg.role === 'bot' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>
              <div className={cn(
                "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.role === 'bot' 
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-tl-none" 
                  : "bg-indigo-brand-600 text-white rounded-tr-none shadow-indigo-brand-600/10"
              )}>
                {formatContent(msg.content)}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <div className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-indigo-brand-500/10 border border-indigo-brand-500/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-indigo-brand-500 animate-spin" />
            </div>
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-none text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest shadow-sm">
              Fetching response from AI service...
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-muted/10 space-y-3 z-10 transition-all">
        {messages.length < 3 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {QuickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => { setInput(action.prompt); }}
                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-indigo-brand-500 hover:text-indigo-brand-500 transition-all active:scale-95 shadow-sm"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Query tactical mission data..."
            className="w-full h-11 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-xl pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-brand-500/20 focus:border-indigo-brand-500 transition-all font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-indigo-brand-500 disabled:opacity-30 transition-all group-focus-within:text-indigo-brand-500"
          >
            <Send className="w-5 h-5 group-hover:rotate-12 duration-300" />
          </button>
        </form>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center font-black uppercase tracking-widest opacity-80">
          Powered by Tactical Neural Intelligence
        </p>
      </div>

      {/* Decorative background sparks */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none opacity-[0.03] z-0">
        <Zap className="w-full h-full text-indigo-brand-500 rotate-12" />
      </div>
    </div>
  );
};

export default AIInsightsPanel;

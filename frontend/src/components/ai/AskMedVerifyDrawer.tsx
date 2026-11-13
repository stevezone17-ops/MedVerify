import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  X,
  Send,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  HelpCircle,
  FileCheck,
  Bot,
  User as UserIcon,
  Clock,
  WifiOff,
  RotateCw,
} from 'lucide-react';
import { askMedVerify } from '../../api/client';
import type { AskMedVerifyResponse } from '../../types';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  groundedFacts?: string[];
  safetyNotice?: string;
  timestamp: Date;
}

interface FormattedError {
  category: 'timeout' | 'auth' | 'quota' | 'offline' | 'unavailable' | 'unknown';
  title: string;
  message: string;
}

function classifyAiError(err: any): FormattedError {
  const msg = (err?.message || '').toLowerCase();
  const status = err?.status;
  const code = err?.code;

  if (code === 'TIMEOUT' || msg.includes('timed out') || msg.includes('timeout') || status === 504) {
    return {
      category: 'timeout',
      title: 'Gemini Assistant Timeout',
      message: 'The AI assistant took too long to respond. Your message is preserved. You can retry.',
    };
  }
  if (code === 'NETWORK_ERROR' || msg.includes('failed to fetch') || msg.includes('connection refused') || msg.includes('unreachable')) {
    return {
      category: 'offline',
      title: 'Backend Unreachable',
      message: "MedVerify's backend is currently unavailable. Please try again shortly.",
    };
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('resource_exhausted')) {
    return {
      category: 'quota',
      title: 'Usage Limit Reached',
      message: 'The AI service has temporarily reached its usage limit. Please try again later.',
    };
  }
  if (status === 401 || status === 403 || msg.includes('invalid api key') || msg.includes('authentication') || msg.includes('unauthorized')) {
    return {
      category: 'auth',
      title: 'Configuration Notice',
      message: 'The AI assistant is not configured correctly. Please contact the administrator.',
    };
  }
  if (status === 503 || msg.includes('503') || msg.includes('high demand') || msg.includes('unavailable')) {
    return {
      category: 'unavailable',
      title: 'Service Temporarily Unavailable',
      message: 'The AI provider is temporarily unavailable.',
    };
  }
  return {
    category: 'unknown',
    title: 'Assistant Notice',
    message: err?.message || 'The AI assistant encountered an unexpected issue. Please try again.',
  };
}

interface AskMedVerifyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId?: string;
  initialQuestion?: string;
}

const QUICK_PROMPTS = [
  'How do I verify a medicine using its QR code, GTIN, and batch?',
  'What are the valid GTIN formats and GS1 Application Identifiers?',
  'What should I do if a batch number or serial code does not match?',
  'What are physical packaging indicators of counterfeit drugs?',
  'Why does MedVerify check for duplicate serial number reuse?',
];

/**
 * Format markdown headings, bullet points, numbered lists, bold text, and inline code
 * into accessible, clean React elements without external parser dependencies.
 */
const renderFormattedMessage = (content: string, isUser: boolean): React.ReactNode => {
  if (isUser) {
    return <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{content}</p>;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`ul_${elements.length}`}>
            {currentList.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol_${elements.length}`}>
            {currentList.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  const formatInline = (str: string): React.ReactNode => {
    const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushList();
      continue;
    }

    // Markdown Headings: ##, ###, ####
    if (/^#{2,4}\s+/.test(line)) {
      flushList();
      const headingText = line.replace(/^#{2,4}\s+/, '');
      elements.push(<h4 key={`h_${i}`}>{formatInline(headingText)}</h4>);
      continue;
    }

    // Bullet List Items: - or *
    if (/^[-*]\s+/.test(line)) {
      const itemText = line.replace(/^[-*]\s+/, '');
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(formatInline(itemText));
      continue;
    }

    // Numbered List Items: 1. or 2.
    if (/^\d+\.\s+/.test(line)) {
      const itemText = line.replace(/^\d+\.\s+/, '');
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(formatInline(itemText));
      continue;
    }

    // Standard paragraph
    flushList();
    elements.push(<p key={`p_${i}`}>{formatInline(line)}</p>);
  }

  flushList();
  return <div className="ask-ai-formatted-body">{elements}</div>;
};

export const AskMedVerifyDrawer: React.FC<AskMedVerifyDrawerProps> = ({
  isOpen,
  onClose,
  verificationId,
  initialQuestion,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am MedVerify AI assistant powered by Google Gemini. I can explain medicine verification results, GS1 barcode standards, and packaging safety rules. How can I help you today?',
      groundedFacts: [
        'MedVerify verifies authentic medicine using 6-factor forensic cryptographic evaluation.',
      ],
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<FormattedError | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialQuestion && !messages.some((m) => m.text === initialQuestion)) {
        handleSendMessage(initialQuestion);
      }
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen, initialQuestion]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || loading) return;

    setInputText('');
    setErrorDetails(null);
    setLastFailedQuery(null);

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res: AskMedVerifyResponse = await askMedVerify({
        question: query,
        verification_id: verificationId,
        conversation_id: conversationId || undefined,
      });

      if (res.conversation_id && !conversationId) {
        setConversationId(res.conversation_id);
      }

      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        groundedFacts: res.grounded_facts,
        safetyNotice: res.safety_notice,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('Ask MedVerify error:', err);
      const classified = classifyAiError(err);
      setErrorDetails(classified);
      setLastFailedQuery(query);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (!lastFailedQuery || loading) return;
    // Remove the failed user message before resubmitting to prevent duplicate messages
    setMessages((prev) => {
      const lastIndex = prev.map((m) => m.sender).lastIndexOf('user');
      if (lastIndex !== -1 && prev[lastIndex].text === lastFailedQuery) {
        return prev.filter((_, idx) => idx !== lastIndex);
      }
      return prev;
    });
    const queryToRetry = lastFailedQuery;
    setErrorDetails(null);
    setLastFailedQuery(null);
    handleSendMessage(queryToRetry);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="ask-ai-backdrop" onClick={onClose}>
        <motion.div
          className="ask-ai-drawer"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="ask-ai-drawer__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="explain-ai-icon-bubble">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="ask-ai-drawer__title">Ask MedVerify</h3>
                <span className="ask-ai-drawer__subtitle">
                  {verificationId ? `Referencing Token ${verificationId.slice(0, 12)}...` : 'Powered by Google Gemini'}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </div>

          {/* Medical Safety Notice Banner */}
          <div className="ask-ai-safety-banner">
            <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
            <span>
              <strong>Medical Safety Rule:</strong> MedVerify explains verification and packaging parameters.
              We do not provide personalized clinical advice, dosage, or treatment. Consult a licensed physician or pharmacist.
            </span>
          </div>

          {/* Messages Scroll Area */}
          <div className="ask-ai-drawer__body" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`ask-ai-bubble-row ${m.sender}`}>
                <div className={`ask-ai-avatar ${m.sender}`}>
                  {m.sender === 'assistant' ? <Bot size={14} /> : <UserIcon size={14} />}
                </div>

                <div className="ask-ai-bubble-content">
                  <div className={`ask-ai-bubble ${m.sender}`}>
                    {renderFormattedMessage(m.text, m.sender === 'user')}
                  </div>

                  {/* Grounded facts badge */}
                  {m.groundedFacts && m.groundedFacts.length > 0 && (
                    <div className="ask-ai-grounded-facts">
                      <div className="ask-ai-grounded-title">
                        <ShieldCheck size={11} style={{ color: '#0f766e' }} />
                        <span>Grounded Evidence Referenced:</span>
                      </div>
                      <ul className="ask-ai-grounded-list">
                        {m.groundedFacts.map((fact, idx) => (
                          <li key={idx}>{fact}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <span className="ask-ai-bubble-time">
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="ask-ai-bubble-row assistant">
                <div className="ask-ai-avatar assistant">
                  <Bot size={14} />
                </div>
                <div className="ask-ai-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={14} className="telemetry-spinner" />
                  <span style={{ fontSize: '13px', color: 'var(--color-slate-600)' }}>
                    Verifying grounded medicine records...
                  </span>
                </div>
              </div>
            )}

            {errorDetails && (
              <div
                className={`ask-ai-error-notice ask-ai-error-notice--${errorDetails.category}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: errorDetails.category === 'timeout' ? '#fffbeb' : '#fef2f2',
                  border: `1px solid ${errorDetails.category === 'timeout' ? '#fde68a' : '#fecaca'}`,
                  color: errorDetails.category === 'timeout' ? '#92400e' : '#991b1b',
                }}
              >
                {errorDetails.category === 'timeout' && (
                  <Clock size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                )}
                {errorDetails.category === 'offline' && (
                  <WifiOff size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                )}
                {errorDetails.category !== 'timeout' && errorDetails.category !== 'offline' && (
                  <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                )}
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '3px' }}>
                    {errorDetails.title}
                  </strong>
                  <span style={{ fontSize: '12px', lineHeight: '1.4', display: 'block' }}>
                    {errorDetails.message}
                  </span>
                  {lastFailedQuery && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '12px',
                          padding: '4px 10px',
                          cursor: 'pointer',
                        }}
                        onClick={handleRetry}
                      >
                        <RotateCw size={12} />
                        Retry Question
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts Carousel */}
          <div className="ask-ai-prompts-bar">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                className="ask-ai-prompt-chip"
                onClick={() => handleSendMessage(prompt)}
                disabled={loading}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            className="ask-ai-drawer__footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="ask-ai-input"
              placeholder="Ask a question about your medicine or verification..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading || !inputText.trim()}
              aria-label="Send question"
            >
              {loading ? <Loader2 size={15} className="telemetry-spinner" /> : <Send size={15} />}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AskMedVerifyDrawer;

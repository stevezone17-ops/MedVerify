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

interface AskMedVerifyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId?: string;
  initialQuestion?: string;
}

const QUICK_PROMPTS = [
  'Why was this medicine verified or flagged?',
  'What does GTIN mean on medicine packaging?',
  'What is a batch number and why does it matter?',
  'What should I do if a tamper seal is broken?',
  'Explain this verification result in simple words.',
];

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
      text: 'Hello! I am MedVerify AI. I can explain medicine verification results, GS1 barcode standards, and packaging safety rules. How can I help you today?',
      groundedFacts: [
        'MedVerify verifies authentic medicine using 6-factor forensic cryptographic evaluation.',
      ],
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

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
      setError(err.message || 'MedVerify AI is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="report-modal-backdrop" onClick={onClose}>
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
                  {verificationId ? `Referencing Token ${verificationId.slice(0, 12)}...` : 'Grounded Assistant'}
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
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.text}</p>
                  </div>

                  {/* Grounded facts badge */}
                  {m.groundedFacts && m.groundedFacts.length > 0 && (
                    <div className="ask-ai-grounded-facts">
                      <div className="ask-ai-grounded-title">
                        <ShieldCheck size={11} style={{ color: 'var(--color-primary-600)' }} />
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

            {error && (
              <div className="ask-ai-error-notice">
                <AlertTriangle size={14} />
                <span>{error}</span>
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

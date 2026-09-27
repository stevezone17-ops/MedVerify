import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ScanLine,
  ClipboardList,
  Database,
  Info,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Command,
  X,
} from 'lucide-react';
import { useNavigate } from '../../router';
import { modalVariants, backdropVariants } from '../../animations/motion';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: string;
  to: string;
  icon: typeof ScanLine;
  shortcut?: string;
  description: string;
}

const DEFAULT_COMMANDS: CommandItem[] = [
  {
    id: 'scanner',
    title: 'Open Medicine Scanner',
    category: 'Authentication',
    to: '/app/scanner',
    icon: ScanLine,
    shortcut: 'S',
    description: 'Scan barcodes, QR codes, or 2D DataMatrix packaging codes',
  },
  {
    id: 'command-center',
    title: 'Command Center',
    category: 'Operations',
    to: '/app/admin',
    icon: LayoutDashboard,
    shortcut: 'C',
    description: 'Real-time telemetry, verification health, and anomaly triage',
  },
  {
    id: 'registry',
    title: 'Pharmaceutical Registry',
    category: 'Database',
    to: '/app/registry',
    icon: Database,
    shortcut: 'R',
    description: 'Browse cryptographically authorized medicine catalog',
  },
  {
    id: 'history',
    title: 'Verification Audit Ledger',
    category: 'Forensics',
    to: '/app/history',
    icon: ClipboardList,
    shortcut: 'H',
    description: 'Immutable verification log and forensic compliance trails',
  },
  {
    id: 'specs',
    title: 'Detection Engine Specs',
    category: 'Architecture',
    to: '/app/about',
    icon: Info,
    shortcut: 'I',
    description: '6-factor confidence model and anomaly detection logic',
  },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredCommands = DEFAULT_COMMANDS.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    );
  });

  const handleSelect = (to: string) => {
    onClose();
    navigate(to);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? filteredCommands.length - 1 : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleSelect(filteredCommands[selectedIndex].to);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="command-palette-portal">
        <motion.div
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="command-palette-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.div
          variants={modalVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="command-palette-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Command search palette"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input Bar */}
          <div className="palette-input-wrap">
            <Search size={18} className="palette-input-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search GTIN, batch, serial, actions... (ESC to exit)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              className="palette-search-input"
            />
            {query && (
              <button
                type="button"
                className="palette-clear-btn"
                onClick={() => setQuery('')}
                aria-label="Clear query"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Results List */}
          <div className="palette-results-list">
            {filteredCommands.length === 0 ? (
              <div className="palette-empty-state">
                <p>No matching commands or destinations found for "{query}".</p>
                <span>Try searching "Scanner", "Registry", or "Audit".</span>
              </div>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const Icon = cmd.icon;
                const isSelected = idx === selectedIndex;

                return (
                  <div
                    key={cmd.id}
                    className={`palette-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(cmd.to)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="palette-item__left">
                      <div className="palette-item__icon-wrap">
                        <Icon size={16} />
                      </div>
                      <div className="palette-item__text">
                        <div className="palette-item__title-row">
                          <span className="palette-item__title">{cmd.title}</span>
                          <span className="palette-item__category">{cmd.category}</span>
                        </div>
                        <span className="palette-item__desc">{cmd.description}</span>
                      </div>
                    </div>

                    <div className="palette-item__right">
                      {cmd.shortcut && (
                        <kbd className="palette-item__kbd">{cmd.shortcut}</kbd>
                      )}
                      <ArrowRight size={14} className="palette-item__arrow" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Guide */}
          <div className="palette-footer">
            <div className="palette-footer__hint">
              <kbd>↑</kbd> <kbd>↓</kbd> to navigate
            </div>
            <div className="palette-footer__hint">
              <kbd>Enter</kbd> to select
            </div>
            <div className="palette-footer__hint">
              <kbd>Esc</kbd> to close
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CommandPalette;

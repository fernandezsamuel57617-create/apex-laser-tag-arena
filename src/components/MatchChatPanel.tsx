import { MessageSquare, Send, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { countryCodeToFlag } from '../shared/countries';
import type { ChatMessageEvent, GamePhase } from '../shared/types';

interface MatchChatPanelProps {
  messages: ChatMessageEvent[];
  blockedReason: string | null;
  phase: GamePhase;
  focusSignal: number;
  onSendMessage: (text: string) => void;
  onClearBlocked: () => void;
}

export function MatchChatPanel({
  messages,
  blockedReason,
  phase,
  focusSignal,
  onSendMessage,
  onClearBlocked,
}: MatchChatPanelProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusSignal > 0) {
      inputRef.current?.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      inputRef.current?.blur();
      return;
    }
    onSendMessage(trimmed);
    setText('');
    inputRef.current?.blur();
  };

  if (phase === 'results') return null;

  return (
    <div
      className={`pointer-events-auto fixed z-20 w-72 rounded-xl border border-slate-700/80 bg-[#0B101B]/92 p-2.5 shadow-xl ${
        phase === 'lobby' ? 'bottom-40 right-5' : 'bottom-40 left-5'
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
          <MessageSquare className="h-3.5 w-3.5 text-cyan-400" />
          <span>Chat de Sala</span>
        </span>
        <span className="font-mono-tab text-[10px] text-slate-400">[T] Escribir</span>
      </div>

      <div
        ref={listRef}
        className="max-h-28 min-h-[54px] overflow-y-auto space-y-1 pr-1 text-xs"
      >
        {messages.length === 0 ? (
          <div className="text-[11px] text-slate-500">
            Presiona [T] para saludar o coordinar con tu equipo...
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="leading-snug break-words">
              <span
                className={`font-semibold ${
                  m.team === 'cyan'
                    ? 'text-cyan-300'
                    : m.team === 'rose'
                      ? 'text-rose-300'
                      : 'text-amber-300'
                }`}
              >
                {m.senderCountry ? `${countryCodeToFlag(m.senderCountry)} ` : ''}
                {m.senderName}:
              </span>{' '}
              <span className="text-slate-100">{m.text}</span>
            </div>
          ))
        )}
      </div>

      {blockedReason && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-rose-500/50 bg-rose-950/70 px-2 py-1.5 text-[11px] text-rose-200">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
          <span>{blockedReason}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          maxLength={140}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (blockedReason) onClearBlocked();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              inputRef.current?.blur();
            }
          }}
          placeholder="[T] Escribe un mensaje..."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Enviar mensaje"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/35 shrink-0 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

import { CheckCircle2, Gamepad2, Keyboard, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TutorialOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ControlGuideItem {
  id: string;
  keyBadge: string;
  title: string;
  description: string;
  category: 'Movimiento' | 'Combate' | 'Social';
}

const CONTROL_ITEMS: ControlGuideItem[] = [
  {
    id: 'move',
    keyBadge: 'W A S D',
    title: 'Moverse',
    description: 'Desplázate por el Lobby, el Obby y la Arena.',
    category: 'Movimiento',
  },
  {
    id: 'sprint',
    keyBadge: 'SHIFT',
    title: 'Correr',
    description: 'Aumenta tu velocidad consumiendo energía al correr en combate.',
    category: 'Movimiento',
  },
  {
    id: 'slide',
    keyBadge: 'C',
    title: 'Deslizarse',
    description: 'Impulso rápido agachado para esquivar láseres enemigos.',
    category: 'Movimiento',
  },
  {
    id: 'jump',
    keyBadge: 'ESPACIO',
    title: 'Saltar',
    description: 'Salta obstáculos y supera las plataformas del Obby.',
    category: 'Movimiento',
  },
  {
    id: 'shoot',
    keyBadge: 'CLIC IZQ',
    title: 'Disparar Láser',
    description: 'Marca oponentes en la Arena (desactivado en el Lobby).',
    category: 'Combate',
  },
  {
    id: 'aim',
    keyBadge: 'CLIC DER / V',
    title: 'Apuntar (ADS)',
    description: 'Aumenta tu precisión y reduce la dispersión de disparo.',
    category: 'Combate',
  },
  {
    id: 'reload',
    keyBadge: 'R',
    title: 'Recargar Celda',
    description: 'Recarga las 12 cargas de tu blaster láser.',
    category: 'Combate',
  },
  {
    id: 'emotes',
    keyBadge: 'G / 1-6',
    title: 'Emotes 3D',
    description: 'Saluda, ríe o celebra con animaciones visibles en el mapa.',
    category: 'Social',
  },
  {
    id: 'chat',
    keyBadge: 'T',
    title: 'Chat de Partida',
    description: 'Abre el chat para escribir en el lobby o en plena partida.',
    category: 'Social',
  },
  {
    id: 'inv',
    keyBadge: 'I / TAB / ENTER',
    title: 'Menús Rápidos',
    description: '[I] Inventario · [Tab] Ranking · [Enter] Empezar partida.',
    category: 'Social',
  },
];

export function TutorialOverlay({ open, onClose }: TutorialOverlayProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    const id = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % CONTROL_ITEMS.length);
    }, 1700);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open) return null;

  const activeItem = CONTROL_ITEMS[activeIdx] ?? CONTROL_ITEMS[0];

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#060911]/88 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-cyan-500/40 bg-[#0B111E] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300">
              <Keyboard className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Tutorial de Controles</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-white">
                Domina todas las teclas antes de entrar
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar tutorial"
            className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Animated Interactive Spotlight Stage */}
        <div className="mt-5 grid gap-5 md:grid-cols-[1.1fr_1.4fr] items-center rounded-xl border border-slate-800 bg-[#080D17] p-4">
          <div className="flex flex-col items-center justify-center text-center py-3">
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
              {activeItem.category}
            </div>
            <div className="mt-3 flex items-center justify-center">
              <div
                key={activeItem.id}
                className="rounded-xl border-2 border-cyan-400 bg-gradient-to-b from-cyan-500/25 to-slate-900 px-6 py-3.5 font-mono-tab text-2xl font-bold text-white shadow-lg shadow-cyan-500/20 transition-transform duration-300 scale-105"
              >
                {activeItem.keyBadge}
              </div>
            </div>
            <h3 className="mt-4 font-display text-xl font-bold text-white">
              {activeItem.title}
            </h3>
            <p className="mt-1 max-w-xs text-sm text-slate-300">
              {activeItem.description}
            </p>

            {/* Animated Visual Movement Demo Bar */}
            <div className="mt-4 flex items-center gap-1.5">
              {CONTROL_ITEMS.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  aria-label={item.title}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === activeIdx ? 'w-7 bg-cyan-400' : 'w-2 bg-slate-700 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* All Keys Animated Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CONTROL_ITEMS.map((item, idx) => {
              const selected = idx === activeIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                    selected
                      ? 'border-cyan-400 bg-cyan-500/15 shadow-md shadow-cyan-500/10 -translate-y-0.5'
                      : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                  }`}
                >
                  <span
                    className={`shrink-0 rounded-lg border px-2 py-1 font-mono-tab text-[11px] font-bold transition-colors ${
                      selected
                        ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                        : 'border-slate-700 bg-slate-950 text-cyan-300'
                    }`}
                  >
                    {item.keyBadge}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-xs font-bold text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1">
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Gamepad2 className="h-4 w-4 text-cyan-400" />
            <span>
              Puedes volver a abrir este tutorial en cualquier momento desde el botón{' '}
              <strong className="text-slate-200">[?]</strong> arriba.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Entendido, ¡A Jugar!</span>
          </button>
        </div>
      </div>
    </div>
  );
}

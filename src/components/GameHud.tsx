import {
  Bot,
  Check,
  Coins,
  Copy,
  Crosshair,
  Crown,
  Eye,
  HelpCircle,
  KeyRound,
  LogOut,
  Map as MapIcon,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Shirt,
  Smile,
  Swords,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RoomInviteRecord } from '../firebase';
import type { WeaponHudState } from '../game/ArenaEngine';
import { ARENA_MAP_LIST, getMapConfig } from '../shared/arenaData';
import { countryCodeToFlag } from '../shared/countries';
import { EMOTES, getEmoteById, type EmoteId } from '../shared/emotes';
import { getOutfitById, getOutfitLevel, type OutfitId } from '../shared/outfits';
import { getRankByWins } from '../shared/ranks';
import { getWeaponById } from '../shared/weapons';
import { getWeaponSkinById } from '../shared/weaponSkins';
import type {
  ArenaMapId,
  ChatMessageEvent,
  Gender,
  KillFeedEvent,
  MatchMode,
  PlayerSnapshot,
  ServerStatePayload,
  TeamMode,
} from '../shared/types';
import type { VoiceStatus } from '../voice/voiceManager';
import { GENDER_PORTRAIT, type LeaderboardTab } from './LeaderboardModal';
import { MAP_AERIAL_IMAGES } from './mapAerialImages';
import { MatchChatPanel } from './MatchChatPanel';
import { MiniMap } from './MiniMap';
import { RankBadge } from './RankBadge';
import { ResultsPodium3D } from './ResultsPodium3D';
import { VoiceChatPanel } from './VoiceChatPanel';

interface HitMarkerState {
  active: boolean;
  isCrit: boolean;
  killed: boolean;
}

export interface DeathCamHudState {
  killerId: string;
  killerName: string;
  killerGender: Gender;
  killerCountry?: string;
  killerOutfit: OutfitId;
  isCrit: boolean;
  endsAt: number;
  totalMs: number;
}

interface GameHudProps {
  state: ServerStatePayload;
  myId: string | null;
  pingMs: number | null;
  hitMarker: HitMarkerState;
  damageFlash: boolean;
  deathCam: DeathCamHudState | null;
  weaponState: WeaponHudState;
  killFeed: KillFeedEvent[];
  muted: boolean;
  voiceStatus: VoiceStatus;
  roomError: string | null;
  incomingInvites: RoomInviteRecord[];
  chatMessages: ChatMessageEvent[];
  chatBlockedReason: string | null;
  chatFocusSignal: number;
  claimableMissionsCount: number;
  onJoinVoiceRoom: (room: string) => void;
  onLeaveVoiceRoom: () => void;
  onToggleMicMute: () => void;
  onToggleDeafen: () => void;
  onToggleMute: () => void;
  onStartMatch: () => void;
  onReturnLobby: () => void;
  onToggleBots: () => void;
  onToggleTeamMode: (mode: TeamMode) => void;
  onToggleMatchMode: (mode: MatchMode) => void;
  onVoteMap: (mapId: ArenaMapId) => void;
  onOpenInventory: () => void;
  onOpenMissions: () => void;
  onOpenTutorial: () => void;
  onOpenFriends: () => void;
  onAcceptInvite: (invite: RoomInviteRecord) => void;
  onDeclineInvite: (invite: RoomInviteRecord) => void;
  onOpenEmotes: () => void;
  onTriggerEmote: (emote: EmoteId) => void;
  onCreatePrivateRoom: () => void;
  onJoinRoom: (roomCode: string) => void;
  onLeavePrivateRoom: () => void;
  onClearRoomError: () => void;
  onSendChat: (text: string) => void;
  onClearChatBlocked: () => void;
  onReload: () => void;
  onOpenLeaderboard: (tab: LeaderboardTab) => void;
  onSignOut?: () => void;
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function GameHud({
  state,
  myId,
  pingMs,
  hitMarker,
  damageFlash,
  deathCam,
  weaponState,
  killFeed,
  muted,
  voiceStatus,
  roomError,
  incomingInvites,
  chatMessages,
  chatBlockedReason,
  chatFocusSignal,
  claimableMissionsCount,
  onJoinVoiceRoom,
  onLeaveVoiceRoom,
  onToggleMicMute,
  onToggleDeafen,
  onToggleMute,
  onStartMatch,
  onReturnLobby,
  onToggleBots,
  onToggleTeamMode,
  onToggleMatchMode,
  onVoteMap,
  onOpenInventory,
  onOpenMissions,
  onOpenTutorial,
  onOpenFriends,
  onAcceptInvite,
  onDeclineInvite,
  onOpenEmotes,
  onTriggerEmote,
  onCreatePrivateRoom,
  onJoinRoom,
  onLeavePrivateRoom,
  onClearRoomError,
  onSendChat,
  onClearChatBlocked,
  onReload,
  onOpenLeaderboard,
  onSignOut,
}: GameHudProps) {
  const me = state.players.find((p) => p.id === myId) ?? null;
  const humanCount = state.players.filter((p) => !p.isBot).length;
  const now = state.serverTime;

  const [roomInput, setRoomInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Clock-synced local ticker for smooth countdown, vote timer, Death Cam & auto-return from results
  const clockOffsetRef = useRef<number>(state.serverTime - Date.now());
  clockOffsetRef.current = state.serverTime - Date.now();
  const [localNowMs, setLocalNowMs] = useState<number>(() => Date.now());
  const [perfNowMs, setPerfNowMs] = useState<number>(() => performance.now());
  const autoReturnedEndsAtRef = useRef<number>(0);

  const hasVoteCountdown = state.phase === 'lobby' && state.voteCountdownEndsAt > 0;

  useEffect(() => {
    if (
      state.phase !== 'results' &&
      state.phase !== 'countdown' &&
      state.phase !== 'playing' &&
      !hasVoteCountdown &&
      !deathCam
    ) {
      autoReturnedEndsAtRef.current = 0;
      return;
    }
    setLocalNowMs(Date.now());
    setPerfNowMs(performance.now());
    const id = window.setInterval(() => {
      setLocalNowMs(Date.now());
      setPerfNowMs(performance.now());
    }, 80);
    return () => window.clearInterval(id);
  }, [state.phase, hasVoteCountdown, deathCam]);

  const syncedNowMs = localNowMs + clockOffsetRef.current;
  const timeLeftMs = Math.max(0, state.phaseEndsAt - syncedNowMs);
  const voteTimeLeftMs = hasVoteCountdown ? Math.max(0, state.voteCountdownEndsAt - syncedNowMs) : 0;
  const voteProgressPct = hasVoteCountdown
    ? Math.max(0, Math.min(100, (voteTimeLeftMs / 5000) * 100))
    : 0;
  const resultsTotalMs = 10_000;
  const resultsProgressPct =
    state.phase === 'results'
      ? Math.max(0, Math.min(100, (timeLeftMs / resultsTotalMs) * 100))
      : 0;

  const deathCamLeftMs =
    deathCam && me && !me.alive ? Math.max(0, deathCam.endsAt - perfNowMs) : 0;
  const isDeathCamActive = Boolean(
    state.phase === 'playing' && me && !me.alive && deathCam && deathCamLeftMs > 0,
  );
  const myVote = myId ? state.mapVotes?.voters?.[myId] ?? null : null;
  const activeMap = getMapConfig(state.currentMapId);
  const previewMap = state.votedPreviewMapId ? getMapConfig(state.votedPreviewMapId) : null;

  const handleCopyRoomCode = () => {
    if (!state.roomCode) return;
    navigator.clipboard?.writeText(state.roomCode).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleJoinRoomSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = roomInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned) return;
    onJoinRoom(cleaned);
    setRoomInput('');
  };

  useEffect(() => {
    if (
      state.phase === 'results' &&
      state.phaseEndsAt > 0 &&
      syncedNowMs - state.phaseEndsAt > 900 &&
      autoReturnedEndsAtRef.current !== state.phaseEndsAt
    ) {
      autoReturnedEndsAtRef.current = state.phaseEndsAt;
      onReturnLobby();
    }
  }, [state.phase, state.phaseEndsAt, syncedNowMs, onReturnLobby]);

  const sortedMatchPlayers = [...state.players].sort(
    (a, b) => b.score - a.score || b.tags - a.tags,
  );
  const topPlayer = sortedMatchPlayers[0] ?? null;
  const topThree = sortedMatchPlayers.slice(0, 3);
  const myTeam = me?.team ?? 'cyan';
  const myTeamPlayers = [...state.players]
    .filter((p) => p.team === myTeam)
    .sort((a, b) => b.tags - a.tags || b.score - a.score);
  const myTeamMvp = myTeamPlayers[0] ?? null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* Damage Vignette Flash */}
      {damageFlash && (
        <div
          className="fixed inset-0 border-8 border-rose-500/70 bg-rose-600/15 transition-opacity duration-150"
          aria-hidden="true"
        />
      )}

      {/* Center Reticle, ADS Sight & Reload Indicator (ONLY in Combat Arena when alive — Lobby is unarmed) */}
      {state.phase === 'playing' && me?.alive && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {weaponState.isAiming && (
              <span className="absolute h-10 w-10 rounded-full border border-cyan-300/70" />
            )}

            {/* Dynamic Crosshair lines (tighten when aiming) */}
            <span
              className={`absolute w-0.5 transition-all duration-100 ${
                weaponState.isAiming
                  ? 'h-2.5 -top-3 bg-amber-300'
                  : 'h-3 -top-4 bg-cyan-300/90'
              }`}
            />
            <span
              className={`absolute w-0.5 transition-all duration-100 ${
                weaponState.isAiming
                  ? 'h-2.5 top-0.5 bg-amber-300'
                  : 'h-3 top-1 bg-cyan-300/90'
              }`}
            />
            <span
              className={`absolute h-0.5 transition-all duration-100 ${
                weaponState.isAiming
                  ? 'w-2.5 -left-3 bg-amber-300'
                  : 'w-3 -left-4 bg-cyan-300/90'
              }`}
            />
            <span
              className={`absolute h-0.5 transition-all duration-100 ${
                weaponState.isAiming
                  ? 'w-2.5 left-0.5 bg-amber-300'
                  : 'w-3 left-1 bg-cyan-300/90'
              }`}
            />
            <span
              className={`h-1 w-1 rounded-full ${
                weaponState.isAiming ? 'bg-amber-300' : 'bg-white'
              }`}
            />

            {/* Reload Progress Bar under reticle */}
            {weaponState.isReloading && (
              <div className="absolute top-7 flex flex-col items-center gap-1">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-900/90 border border-slate-700">
                  <div
                    className="h-full bg-amber-400 transition-all duration-75"
                    style={{ width: `${Math.round(weaponState.reloadProgress * 100)}%` }}
                  />
                </div>
                <span className="font-display text-[10px] font-bold tracking-wider text-amber-300">
                  RECARGANDO
                </span>
              </div>
            )}

            {/* Hitmarker X */}
            {hitMarker.active && (
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                className="absolute"
                aria-hidden="true"
              >
                <line
                  x1="6"
                  y1="6"
                  x2="12"
                  y2="12"
                  stroke={hitMarker.killed ? '#F43F5E' : hitMarker.isCrit ? '#F59E0B' : '#FFFFFF'}
                  strokeWidth="2.5"
                />
                <line
                  x1="26"
                  y1="6"
                  x2="20"
                  y2="12"
                  stroke={hitMarker.killed ? '#F43F5E' : hitMarker.isCrit ? '#F59E0B' : '#FFFFFF'}
                  strokeWidth="2.5"
                />
                <line
                  x1="6"
                  y1="26"
                  x2="12"
                  y2="20"
                  stroke={hitMarker.killed ? '#F43F5E' : hitMarker.isCrit ? '#F59E0B' : '#FFFFFF'}
                  strokeWidth="2.5"
                />
                <line
                  x1="26"
                  y1="26"
                  x2="20"
                  y2="20"
                  stroke={hitMarker.killed ? '#F43F5E' : hitMarker.isCrit ? '#F59E0B' : '#FFFFFF'}
                  strokeWidth="2.5"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* TOP BAR CLUSTER */}
      <div className="flex items-start justify-between p-4 md:p-5 gap-4">
        {/* Top-Left: Lobby Roster / Match Leader + Real-Time Mini-Map */}
        <div className="flex flex-col items-start gap-2.5">
          {state.phase === 'lobby' ? (
            <>
              {/* Left-Side Private Room Panel (Sala Privada con Código Único) */}
              <div className="pointer-events-auto w-[270px] rounded-xl border border-slate-700/85 bg-[#0B101B]/92 p-3 shadow-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-display text-xs font-bold text-white">
                      {state.isPrivateRoom ? 'Sala Privada' : 'Sala Pública'}
                    </span>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 font-mono-tab text-[11px] font-bold ${
                      state.isPrivateRoom
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/40'
                        : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    {state.isPrivateRoom ? state.roomCode : 'PÚBLICA'}
                  </span>
                </div>

                {state.isPrivateRoom ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/35 bg-amber-500/10 px-2.5 py-2">
                      <div>
                        <div className="text-[10px] text-amber-200/80">Comparte este código</div>
                        <div className="font-mono-tab text-base font-bold tracking-widest text-amber-300">
                          {state.roomCode}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyRoomCode}
                        className="flex items-center gap-1 rounded-md border border-amber-400/50 bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-amber-200 hover:bg-slate-800 cursor-pointer"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={onLeavePrivateRoom}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Volver a Sala Pública</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onCreatePrivateRoom}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 font-display text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Hacer Sala Privada</span>
                  </button>
                )}

                <form onSubmit={handleJoinRoomSubmit} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={8}
                    value={roomInput}
                    onChange={(e) => {
                      setRoomInput(e.target.value.toUpperCase());
                      if (roomError) onClearRoomError();
                    }}
                    placeholder="Código de sala..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono-tab text-xs font-semibold uppercase text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer shrink-0"
                  >
                    Unirse
                  </button>
                </form>

                {roomError && (
                  <div className="rounded border border-rose-500/50 bg-rose-950/60 px-2 py-1 text-[11px] text-rose-200">
                    {roomError}
                  </div>
                )}
              </div>

              {/* Lobby Roster */}
              <div className="pointer-events-auto rounded-xl border border-slate-700/80 bg-[#0B101B]/90 px-4 py-3 w-[270px]">
                <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-cyan-400" />
                    <span className="font-display text-sm font-bold text-white">
                      Lobby · Obby
                    </span>
                  </div>
                  <span className="font-mono-tab text-xs font-semibold text-cyan-300">
                    {humanCount} {humanCount === 1 ? 'jugador' : 'jugadores'}
                  </span>
                </div>

                <div className="mt-2.5 max-h-28 overflow-y-auto space-y-1.5">
                  {state.players
                    .filter((p) => !p.isBot)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <img
                            src={GENDER_PORTRAIT[p.gender]}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="h-6 w-6 rounded object-cover object-top bg-slate-800 shrink-0"
                          />
                          <RankBadge rankedWins={p.rankedWins ?? 0} size="xs" />
                          <span className="truncate font-medium text-slate-100">
                            {p.country ? `${countryCodeToFlag(p.country)} ` : ''}
                            {p.name}
                            {p.id === myId ? ' (Tú)' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {state.teamMode === 'teams' && p.team && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                p.team === 'cyan'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {p.team === 'cyan' ? 'AZUL' : 'ROJO'}
                            </span>
                          )}
                          <span className="text-slate-400">
                            {p.gender === 'male' ? 'H' : 'M'}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-700/80 bg-[#0B101B]/90 px-4 py-2.5">
              <div className="text-[11px] font-medium text-slate-400">Líder de Partida</div>
              {topPlayer ? (
                <div className="mt-0.5 flex items-center gap-2">
                  <RankBadge rankedWins={topPlayer.rankedWins ?? 0} size="xs" />
                  <span className="font-display text-sm font-bold text-amber-300">
                    {topPlayer.country ? `${countryCodeToFlag(topPlayer.country)} ` : ''}
                    {topPlayer.name}
                  </span>
                  <span className="font-mono-tab text-xs font-semibold text-slate-200">
                    {topPlayer.tags}/{state.targetScoreTags} tags
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-400">—</div>
              )}
            </div>
          )}

          {state.phase !== 'results' && <MiniMap state={state} myId={myId} />}

          {/* Lobby Map Voting & Clothing Inventory right where the Map/Radar lives */}
          {state.phase === 'lobby' && (
            <div className="pointer-events-auto w-[270px] rounded-xl border border-slate-700/80 bg-[#0B101B]/92 p-3 shadow-xl space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-200 mb-2">
                  <span className="flex items-center gap-1.5">
                    <MapIcon className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Votar Mapa de Arena</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {Object.values(state.mapVotes?.counts ?? {}).reduce((a, b) => a + b, 0)} votos
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ARENA_MAP_LIST.map((m) => {
                    const votes = state.mapVotes?.counts?.[m.id] ?? 0;
                    const voted = myVote === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onVoteMap(m.id)}
                        title={m.name}
                        className={`flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer ${
                          voted
                            ? 'border-cyan-400/70 bg-cyan-500/15 text-white'
                            : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <span className="truncate font-medium">{m.name}</span>
                        <span className="font-mono-tab text-[10px] font-bold text-cyan-300 shrink-0">
                          {votes}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-2.5">
                <button
                  type="button"
                  onClick={onOpenInventory}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Shirt className="h-4 w-4 text-amber-300" />
                    <span>Arsenal e Inventario</span>
                  </span>
                  <span className="font-mono-tab text-amber-300">[I]</span>
                </button>
                {me && (
                  <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400 px-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <strong className="text-amber-200">
                          {getWeaponById(me.equippedWeapon).name}
                        </strong>
                        {' · '}
                        <strong className="text-cyan-300">
                          {getWeaponSkinById(me.equippedWeaponSkin).name}
                        </strong>
                      </span>
                      <span className="font-mono-tab font-semibold text-amber-300 shrink-0">
                        {me.coins} $
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-slate-400">
                      <strong className="text-slate-200">
                        {getOutfitById(me.equippedOutfit).name}
                      </strong>{' '}
                      <span className="text-emerald-300 font-mono-tab">
                        Nv.{getOutfitLevel(me.outfitLevels, me.equippedOutfit)} ({me.maxHp} HP)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Top-Center: Aerial Map Vote Preview + Auto-Countdown, Match Clock, or Deploy Countdown */}
        {state.phase === 'lobby' && hasVoteCountdown && previewMap && (
          <div className="w-80 overflow-hidden rounded-xl border border-cyan-400/70 bg-[#0B101B]/95 shadow-2xl">
            <div className="relative h-36 w-full bg-slate-900">
              <img
                src={MAP_AERIAL_IMAGES[previewMap.id]}
                alt={`Vista aérea de ${previewMap.name}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B101B] via-transparent to-transparent" />
              <div className="absolute top-2.5 right-2.5 rounded-lg border border-amber-400/60 bg-[#0B101B]/90 px-2.5 py-1 font-mono-tab text-sm font-bold text-amber-300">
                {Math.max(1, Math.ceil(voteTimeLeftMs / 1000))}s
              </div>
              <div className="absolute bottom-2 left-3 right-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  Vista Aérea · Mapa Votado
                </div>
                <div className="font-display text-lg font-bold text-white leading-tight">
                  {previewMap.name}
                </div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Llevando jugadores a la arena...</span>
                <span className="font-mono-tab font-bold text-cyan-300">
                  {state.mapVotes?.counts?.[previewMap.id] ?? 0} votos
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${voteProgressPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {state.phase === 'playing' && (
          <div className="rounded-xl border border-slate-700/80 bg-[#0B101B]/92 px-6 py-2 text-center">
            <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400">
              <span>{activeMap.name}</span>
              <span>·</span>
              {state.matchMode === 'ranked' ? (
                <span className="rounded border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.2 font-bold text-amber-300">
                  CLASIFICATORIA
                </span>
              ) : (
                <span>Tiempo Restante</span>
              )}
            </div>
            <div className="font-mono-tab text-2xl font-bold text-white tracking-wider">
              {formatClock(timeLeftMs)}
            </div>
            {state.teamMode === 'teams' && (
              <div className="mt-1 flex items-center justify-center gap-3 border-t border-slate-800 pt-1 text-xs font-bold">
                <span className="font-mono-tab text-cyan-300">
                  AZUL {state.teamScores.cyan}
                  {me?.team === 'cyan' ? ' (Tú)' : ''}
                </span>
                <span className="text-slate-500">vs</span>
                <span className="font-mono-tab text-rose-300">
                  {state.teamScores.rose} ROJO
                  {me?.team === 'rose' ? ' (Tú)' : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {state.phase === 'countdown' && (
          <div className="w-80 overflow-hidden rounded-xl border border-amber-400/70 bg-[#0B101B]/95 text-center shadow-2xl">
            <div className="relative h-32 w-full bg-slate-900">
              <img
                src={MAP_AERIAL_IMAGES[activeMap.id]}
                alt={`Vista aérea de ${activeMap.name}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B101B] via-[#0B101B]/35 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {state.matchMode === 'ranked' && (
                  <span className="mb-1 rounded border border-amber-400/60 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Modo Rangos · Clasificatoria
                  </span>
                )}
                <div className="text-xs font-semibold text-amber-300">
                  Desplegando en {activeMap.name}
                </div>
                <div className="font-mono-tab text-5xl font-bold text-white mt-0.5">
                  {Math.max(1, Math.ceil(timeLeftMs / 1000))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top-Right: Kill Feed + Quick Utility */}
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            {me && (
              <button
                type="button"
                onClick={() => onOpenLeaderboard('ranked')}
                title={`Tu rango actual: ${getRankByWins(me.rankedWins ?? 0).name} (${me.rankedWins ?? 0} victorias en Rangos)`}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0B101B]/92 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:border-amber-400/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RankBadge rankedWins={me.rankedWins ?? 0} size="xs" showLabel />
              </button>
            )}

            {me && (
              <div
                title="Monedas ganadas"
                className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-[#0B101B]/92 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Coins className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-mono-tab text-amber-300">{me.coins}</span>
              </div>
            )}

            <div
              title="Latencia de red (WebSocket RTT)"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0B101B]/92 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <Wifi
                className={`h-3.5 w-3.5 ${
                  pingMs === null
                    ? 'text-slate-500'
                    : pingMs < 70
                      ? 'text-emerald-400'
                      : pingMs < 150
                        ? 'text-amber-300'
                        : 'text-rose-400'
                }`}
              />
              <span
                className={`font-mono-tab ${
                  pingMs === null
                    ? 'text-slate-400'
                    : pingMs < 70
                      ? 'text-emerald-300'
                      : pingMs < 150
                        ? 'text-amber-200'
                        : 'text-rose-300'
                }`}
              >
                {pingMs !== null ? `${pingMs} ms` : '-- ms'}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenMissions}
              className="relative flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0B101B]/92 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Target className="h-3.5 w-3.5 text-amber-400" />
              <span>Misiones</span>
              {claimableMissionsCount > 0 && (
                <span className="ml-0.5 rounded bg-amber-400 px-1.5 py-0.2 font-mono-tab text-[10px] font-bold text-slate-950">
                  {claimableMissionsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenFriends}
              className="relative flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0B101B]/92 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/60 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-cyan-400" />
              <span>Amigos</span>
              {incomingInvites.length > 0 && (
                <span className="ml-0.5 rounded bg-amber-400 px-1.5 py-0.2 font-mono-tab text-[10px] font-bold text-slate-950">
                  {incomingInvites.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenLeaderboard(state.phase === 'playing' ? 'live' : 'global')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0B101B]/92 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>Leaderboard</span>
            </button>

            <button
              type="button"
              onClick={onOpenTutorial}
              aria-label="Tutorial de controles"
              title="Tutorial de controles"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0B101B]/92 text-cyan-300 hover:border-cyan-400/60 transition-colors cursor-pointer"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0B101B]/92 text-slate-200 hover:border-slate-500 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>

            {onSignOut && state.phase === 'lobby' && (
              <button
                type="button"
                onClick={onSignOut}
                title="Cerrar sesión de Google"
                className="flex h-8 items-center gap-1 rounded-lg border border-slate-700/80 bg-[#0B101B]/92 px-2.5 text-xs font-semibold text-slate-300 hover:border-rose-400/60 hover:text-rose-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Salir</span>
              </button>
            )}
          </div>

          {incomingInvites.length > 0 && (
            <div className="pointer-events-auto w-72 space-y-1.5">
              {incomingInvites.slice(0, 2).map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl border border-amber-400/60 bg-[#0D1422]/96 px-3 py-2.5 shadow-xl"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-white">
                      {inv.fromCountry ? `${countryCodeToFlag(inv.fromCountry)} ` : ''}
                      {inv.fromName} te invita
                    </span>
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono-tab text-[10px] font-bold text-amber-300 border border-amber-400/40 shrink-0">
                      {inv.roomCode}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDeclineInvite(inv)}
                      className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      Ignorar
                    </button>
                    <button
                      type="button"
                      onClick={() => onAcceptInvite(inv)}
                      className="rounded-md bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-300 cursor-pointer"
                    >
                      Unirse
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <VoiceChatPanel
            voiceStatus={voiceStatus}
            players={state.players}
            myId={myId}
            onJoinRoom={onJoinVoiceRoom}
            onLeaveRoom={onLeaveVoiceRoom}
            onToggleMicMute={onToggleMicMute}
            onToggleDeafen={onToggleDeafen}
          />

          {state.phase === 'playing' && killFeed.length > 0 && (
            <div className="space-y-1.5 mt-1">
              {killFeed.slice(0, 4).map((kf) => (
                <div
                  key={kf.id}
                  className="rounded-lg border border-slate-800 bg-[#0B101B]/90 px-3 py-1.5 text-xs text-slate-200 flex items-center gap-2"
                >
                  <span className="font-semibold text-cyan-300">
                    {kf.shooterCountry ? `${countryCodeToFlag(kf.shooterCountry)} ` : ''}
                    {kf.shooterName}
                  </span>
                  <span className="text-slate-500">marcó a</span>
                  <span className="font-semibold text-rose-300">
                    {kf.victimCountry ? `${countryCodeToFlag(kf.victimCountry)} ` : ''}
                    {kf.victimName}
                  </span>
                  {kf.isCrit && <span className="font-mono-tab text-amber-400 font-bold">CRÍTICO</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3-SECOND DEATH CAM SPECTATOR VIEW BEFORE RESPAWN SCREEN */}
      {isDeathCamActive && deathCam && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 w-max max-w-[92vw]">
          <div className="rounded-xl border border-rose-500/60 bg-[#0B101B]/92 px-5 py-3.5 shadow-2xl">
            <div className="flex items-center justify-between gap-6 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-rose-400">
                <Eye className="h-4 w-4" />
                <span>CÁMARA DE ELIMINACIÓN</span>
                {deathCam.isCrit && (
                  <span className="rounded border border-amber-400/60 bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                    CRÍTICO
                  </span>
                )}
              </div>
              <span className="font-mono-tab text-xs font-bold text-slate-200">
                {(deathCamLeftMs / 1000).toFixed(1)}s
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <img
                src={GENDER_PORTRAIT[deathCam.killerGender]}
                alt={deathCam.killerName}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-lg object-cover object-top border border-rose-500/50 bg-slate-900"
              />
              <div>
                <div className="text-[11px] text-slate-400">Eliminado por</div>
                <div className="font-display text-base font-bold text-white">
                  {deathCam.killerCountry ? `${countryCodeToFlag(deathCam.killerCountry)} ` : ''}
                  {deathCam.killerName}
                </div>
              </div>
              <div className="ml-4 text-right text-xs text-slate-400">
                <div>Traje</div>
                <div className="font-medium text-cyan-300">
                  {getOutfitById(deathCam.killerOutfit).name}
                </div>
              </div>
            </div>

            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-rose-500 transition-all duration-75"
                style={{
                  width: `${Math.max(0, Math.min(100, (deathCamLeftMs / deathCam.totalMs) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* RESPAWN SCREEN (Appears after the 3-second Death Cam completes) */}
      {state.phase === 'playing' && me && !me.alive && !isDeathCamActive && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-rose-500/60 bg-[#0B101B]/95 px-7 py-4 text-center">
            <div className="font-display text-xl font-bold text-rose-400">
              Traje Desactivado
            </div>
            <div className="mt-1 text-sm text-slate-300">
              Reapareciendo en la arena...
            </div>
          </div>
        </div>
      )}

      {/* LOBBY BOTTOM ACTION DOCK WITH PROMINENT "EMPEZAR" BUTTON */}
      {state.phase === 'lobby' && (
        <div className="pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 w-max max-w-[94vw]">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-slate-700/80 bg-[#0B101B]/94 px-4 py-3 shadow-2xl">
            <button
              type="button"
              onClick={onStartMatch}
              className="flex items-center gap-2.5 rounded-lg bg-amber-400 px-7 py-2.5 font-display text-base font-bold text-slate-950 hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              <Play className="h-4 w-4 fill-slate-950" />
              <span>Empezar</span>
            </button>

            <button
              type="button"
              onClick={onOpenInventory}
              className="flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Shirt className="h-4 w-4 text-amber-300" />
              <span>Armas y Trajes</span>
            </button>

            {/* Separate Ranked Mode Switch */}
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900/90 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onToggleMatchMode('casual')}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  state.matchMode === 'casual'
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                Casual
              </button>
              <button
                type="button"
                onClick={() => onToggleMatchMode('ranked')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  state.matchMode === 'ranked'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-amber-300/80 hover:text-amber-200 border border-transparent'
                }`}
              >
                <Swords className="h-3.5 w-3.5" />
                <span>Modo Rangos</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleBots}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                state.botsEnabled
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>Drones IA: {state.botsEnabled ? 'Activos' : 'No'}</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleTeamMode(state.teamMode === 'teams' ? 'ffa' : 'teams')}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                state.teamMode === 'teams'
                  ? 'border-rose-500/60 bg-rose-500/15 text-rose-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>
                {state.teamMode === 'teams' ? 'Equipos' : 'Todos vs Todos'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenLeaderboard('ranked')}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-amber-400/60 hover:text-amber-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trophy className="h-4 w-4 text-amber-400" />
              <span>Rangos</span>
            </button>
          </div>

          <div className="rounded-md bg-[#0B101B]/85 px-3 py-1 text-[11px] text-slate-300 text-center">
            Camina al <strong className="text-emerald-400">Portal Verde</strong>, completa el <strong className="text-emerald-400">Obby</strong>, presiona <strong className="text-amber-300">Enter</strong> o haz clic en <strong className="text-amber-300">Empezar</strong>
          </div>
        </div>
      )}

      {/* REMAINING LASERS, AIM & RELOAD PANEL (ONLY IN COMBAT ARENA — Lobby has no weapons or lasers) */}
      {state.phase === 'playing' && me && (
        <div className="fixed bottom-5 right-5 flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-4 rounded-xl border border-slate-700/80 bg-[#0B101B]/92 px-4 py-2.5">
            <div className="text-center">
              <div className="text-[11px] text-slate-400">Tags</div>
              <div className="font-mono-tab text-lg font-bold text-cyan-300">{me.tags}</div>
            </div>
            <div className="h-7 w-px bg-slate-800" />
            <div className="text-center">
              <div className="text-[11px] text-slate-400">Racha</div>
              <div className="font-mono-tab text-lg font-bold text-amber-300">{me.streak}</div>
            </div>
            <div className="h-7 w-px bg-slate-800" />
            <div className="text-center">
              <div className="text-[11px] text-slate-400">Puntos</div>
              <div className="font-mono-tab text-lg font-bold text-white">{me.score}</div>
            </div>
          </div>

          <div className="pointer-events-auto w-64 rounded-xl border border-slate-700/80 bg-[#0B101B]/92 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 min-w-0">
                <Crosshair
                  className={`h-3.5 w-3.5 shrink-0 ${
                    weaponState.isAiming ? 'text-amber-400' : 'text-cyan-400'
                  }`}
                />
                <span className="truncate">
                  {weaponState.isAiming
                    ? 'Apuntando'
                    : getWeaponById(weaponState.weaponId).name}
                </span>
              </div>
              <div className="font-mono-tab text-base font-bold shrink-0">
                <span
                  className={
                    weaponState.ammo === 0
                      ? 'text-rose-400'
                      : weaponState.ammo <= Math.max(1, Math.ceil(weaponState.maxAmmo * 0.25))
                        ? 'text-amber-300'
                        : 'text-cyan-300'
                  }
                >
                  {weaponState.ammo}
                </span>
                <span className="text-slate-500 text-xs"> / {weaponState.maxAmmo}</span>
              </div>
            </div>

            {/* Segmented Laser Charge Cells */}
            <div
              className="mt-2 grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${
                  weaponState.maxAmmo <= 6 ? weaponState.maxAmmo : 12
                }, minmax(0, 1fr))`,
              }}
              aria-label={`Láseres restantes: ${weaponState.ammo} de ${weaponState.maxAmmo}`}
            >
              {Array.from({ length: weaponState.maxAmmo }).map((_, i) => {
                const filled = i < weaponState.ammo;
                const lowThreshold = Math.max(1, Math.ceil(weaponState.maxAmmo * 0.25));
                const cellColor = !filled
                  ? 'bg-slate-800'
                  : weaponState.ammo <= lowThreshold
                    ? 'bg-amber-400'
                    : 'bg-cyan-400';
                return <span key={i} className={`h-2.5 rounded-xs ${cellColor}`} />;
              })}
            </div>

            {/* Reload Progress or Action Hint */}
            {weaponState.isReloading ? (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-300">
                  <span>Recargando celda...</span>
                  <span className="font-mono-tab">
                    {Math.round(weaponState.reloadProgress * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all duration-75"
                    style={{ width: `${Math.round(weaponState.reloadProgress * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>Clic Der / V Apuntar · [C] Deslizar</span>
                <button
                  type="button"
                  onClick={onReload}
                  disabled={weaponState.ammo >= weaponState.maxAmmo}
                  className={`font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    weaponState.ammo < weaponState.maxAmmo
                      ? 'text-amber-300 hover:text-amber-200 cursor-pointer'
                      : 'text-slate-500 cursor-default'
                  }`}
                >
                  [R] Recargar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOBBY BOTTOM-RIGHT: EMOTES RADIAL & QUICK SHORTCUTS */}
      {state.phase === 'lobby' && me && (
        <div className="pointer-events-auto fixed bottom-5 right-5 flex flex-col items-end gap-2">
          {me.activeEmote && me.activeEmoteUntil > syncedNowMs && (
            <div className="rounded-lg border border-cyan-400/50 bg-[#0B101B]/95 px-3 py-1.5 text-xs font-semibold text-cyan-200">
              Emote activo: {getEmoteById(me.activeEmote).emoji} {getEmoteById(me.activeEmote).label}
            </div>
          )}
          <div className="w-64 rounded-xl border border-slate-700/80 bg-[#0B101B]/92 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Smile className="h-3.5 w-3.5 text-cyan-400" />
                <span>Emotes 3D</span>
              </span>
              <button
                type="button"
                onClick={onOpenEmotes}
                className="rounded border border-cyan-500/50 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
              >
                Rueda [G]
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {EMOTES.map((em) => (
                <button
                  key={em.id}
                  type="button"
                  title={`${em.label} (${em.chatCmd} · tecla ${em.shortcut})`}
                  onClick={() => onTriggerEmote(em.id)}
                  className="flex flex-col items-center justify-center rounded-md border border-slate-800 bg-slate-900/80 py-1.5 text-base hover:border-cyan-400/70 transition-colors cursor-pointer"
                >
                  <span className="leading-none">{em.emoji}</span>
                  <span className="mt-0.5 font-mono-tab text-[9px] text-slate-400">
                    {em.shortcut}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE MATCH BOTTOM-LEFT SUIT & SPRINT ENERGY BAR (Hidden in Lobby) */}
      {state.phase === 'playing' && me && (() => {
        const suitMaxHp = Math.max(100, me.maxHp || 100);
        const suitHpPct = Math.max(0, Math.min(100, (me.hp / suitMaxHp) * 100));
        const suitLevel = getOutfitLevel(me.outfitLevels, me.equippedOutfit);
        return (
        <div className="fixed bottom-5 left-5 w-64 rounded-xl border border-slate-700/80 bg-[#0B101B]/92 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <RankBadge rankedWins={me.rankedWins ?? 0} size="xs" />
              <span className="truncate font-display text-xs font-bold text-white">
                {me.country ? `${countryCodeToFlag(me.country)} ` : ''}
                {me.name}
              </span>
            </div>
            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono-tab text-[10px] font-bold text-emerald-300 shrink-0">
              Nv.{suitLevel}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300">Energía del Traje</span>
              <span className="font-mono-tab text-sm font-bold text-white">
                {me.hp}
                <span className="text-xs text-slate-400">/{suitMaxHp}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-150 ${
                  suitHpPct > 50 ? 'bg-cyan-400' : suitHpPct > 25 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${suitHpPct}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300">
                Energía al Correr <span className="text-[10px] text-slate-400">[Shift]</span>
              </span>
              <span
                className={`font-mono-tab text-xs font-bold ${
                  weaponState.sprintEnergy < 20
                    ? 'text-rose-400'
                    : weaponState.isSprinting
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}
              >
                {weaponState.sprintEnergy}%
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-75 ${
                  weaponState.sprintEnergy < 20
                    ? 'bg-rose-500'
                    : weaponState.isSprinting
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, weaponState.sprintEnergy))}%` }}
              />
            </div>
          </div>

          {state.phase === 'playing' && (
            <div className="pointer-events-auto flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-2.5 text-[11px] font-semibold">
                {weaponState.isSliding && (
                  <span className="text-cyan-300 font-bold">Deslizando [C]</span>
                )}
                {me.boostUntil > now && (
                  <span className="flex items-center gap-1 text-amber-300">
                    <Zap className="h-3.5 w-3.5" />
                    Sobrecarga
                  </span>
                )}
                {me.shieldUntil > now && (
                  <span className="flex items-center gap-1 text-emerald-300">
                    <Shield className="h-3.5 w-3.5" />
                    Escudo
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenEmotes}
                className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 hover:border-cyan-400 cursor-pointer"
              >
                <Smile className="h-3 w-3" />
                <span>[G] Emotes</span>
              </button>
            </div>
          )}
        </div>
        );
      })()}

      {/* IN-LOBBY & IN-MATCH PROFANITY-FILTERED CHAT */}
      <MatchChatPanel
        messages={chatMessages}
        blockedReason={chatBlockedReason}
        phase={state.phase}
        focusSignal={chatFocusSignal}
        onSendMessage={onSendChat}
        onClearBlocked={onClearChatBlocked}
      />

      {/* MATCH RESULTS MODAL: ANIMATED 3D PODIUM + SIDE TEAM MVP CARD */}
      {state.phase === 'results' && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-[#060911]/90 p-3 md:p-4 overflow-y-auto">
          <div className="flex flex-col lg:flex-row items-stretch justify-center gap-4 w-full max-w-6xl my-auto">
            {/* Main Results & Animated 3D Front-Facing Podium Card */}
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-[#0D1320] p-5 shadow-2xl mx-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <div className="text-xs font-semibold text-amber-400">
                    Partida #{state.matchNumber} Finalizada
                    {state.matchMode === 'ranked' ? ' · Clasificatoria (Rangos)' : ' · Casual'}
                    {state.teamMode === 'teams' ? ' · Modo Equipos' : ''}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                    Podio de la Arena
                  </h2>
                </div>
                <div className="text-right min-w-[140px]">
                  <div className="text-xs text-slate-400">Volviendo al Lobby en</div>
                  <div className="font-mono-tab text-2xl font-bold text-cyan-300">
                    {Math.max(0, Math.ceil(timeLeftMs / 1000))}s
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-100"
                      style={{ width: `${resultsProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {me && me.lastCoinsEarned > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-200">
                    <Coins className="h-4 w-4 text-amber-400" />
                    <span>
                      {topPlayer?.id === me.id
                        ? 'Recompensa por ganar la partida'
                        : 'Recompensa de partida'}
                    </span>
                  </div>
                  <div className="font-mono-tab text-sm sm:text-base font-bold text-amber-300">
                    +{me.lastCoinsEarned} monedas (Total: {me.coins})
                  </div>
                </div>
              )}

              {/* Animated 3D Podium: 3rd Bronze, 2nd Silver, 1st Gold + Rotating Crown */}
              <ResultsPodium3D topThree={topThree} myId={myId} />

              <div className="mt-4 max-h-40 overflow-y-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400">
                      <th className="pb-2">#</th>
                      <th className="pb-2">Agente</th>
                      <th className="pb-2 text-right">Tags</th>
                      <th className="pb-2 text-right">Bajas</th>
                      <th className="pb-2 text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {sortedMatchPlayers.map((p: PlayerSnapshot, idx: number) => (
                      <tr key={p.id} className={p.id === myId ? 'bg-cyan-500/10' : ''}>
                        <td className="py-2 font-mono-tab text-slate-400">{idx + 1}</td>
                        <td className="py-2 font-medium text-slate-100">
                          <span className="inline-flex items-center gap-1.5">
                            <RankBadge rankedWins={p.rankedWins ?? 0} size="xs" />
                            <span>
                              {p.country ? `${countryCodeToFlag(p.country)} ` : ''}
                              {p.name}
                              {p.id === myId ? ' (Tú)' : ''}
                            </span>
                            {state.teamMode === 'teams' && p.team && (
                              <span
                                className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  p.team === 'cyan'
                                    ? 'bg-cyan-500/20 text-cyan-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {p.team === 'cyan' ? 'AZUL' : 'ROJO'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono-tab text-cyan-300">{p.tags}</td>
                        <td className="py-2 text-right font-mono-tab text-slate-400">{p.deaths}</td>
                        <td className="py-2 text-right font-mono-tab font-bold text-white">
                          {p.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => onOpenLeaderboard('global')}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500 cursor-pointer"
                >
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span>Ranking Global</span>
                </button>

                <button
                  type="button"
                  onClick={onReturnLobby}
                  className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Volver al Lobby</span>
                </button>

                <button
                  type="button"
                  onClick={onStartMatch}
                  className="flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2 font-display text-sm font-bold text-slate-950 hover:bg-amber-300 cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-slate-950" />
                  <span>Jugar Otra Vez</span>
                </button>
              </div>
            </div>

            {/* Side Box: Team MVP Card when in Team Mode */}
            {state.teamMode === 'teams' && (
              <div
                className={`w-full lg:w-80 shrink-0 rounded-xl border p-5 shadow-2xl flex flex-col justify-between ${
                  myTeam === 'cyan'
                    ? 'border-cyan-500/50 bg-[#0B1424]'
                    : 'border-rose-500/50 bg-[#1B0D18]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="flex items-center gap-2 font-display text-sm font-bold text-white">
                      <Crown className="h-4 w-4 text-amber-400" />
                      <span>MVP de tu Equipo</span>
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                        myTeam === 'cyan'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {myTeam === 'cyan' ? 'EQUIPO AZUL' : 'EQUIPO ROJO'}
                    </span>
                  </div>

                  {/* Team Score Comparison */}
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-center">
                    <div>
                      <div className="text-[10px] font-bold text-cyan-300">EQUIPO AZUL</div>
                      <div className="font-mono-tab text-xl font-bold text-white">
                        {state.teamScores.cyan}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-rose-300">EQUIPO ROJO</div>
                      <div className="font-mono-tab text-xl font-bold text-white">
                        {state.teamScores.rose}
                      </div>
                    </div>
                  </div>

                  {/* Highlighted Team MVP */}
                  {myTeamMvp ? (
                    <div className="mt-4 rounded-xl border border-amber-400/50 bg-amber-500/10 p-4 text-center">
                      <img
                        src={GENDER_PORTRAIT[myTeamMvp.gender]}
                        alt={myTeamMvp.name}
                        referrerPolicy="no-referrer"
                        className="mx-auto h-16 w-16 rounded-xl object-cover object-top border-2 border-amber-400 bg-slate-900"
                      />
                      <div className="mt-2 inline-block rounded bg-amber-400 px-2 py-0.5 font-mono-tab text-[10px] font-bold text-slate-950">
                        MVP DEL EQUIPO
                      </div>
                      <div className="mt-1.5 flex items-center justify-center gap-1.5 font-display text-lg font-bold text-white">
                        <RankBadge rankedWins={myTeamMvp.rankedWins ?? 0} size="sm" />
                        <span className="truncate">
                          {myTeamMvp.country ? `${countryCodeToFlag(myTeamMvp.country)} ` : ''}
                          {myTeamMvp.name}
                          {myTeamMvp.id === myId ? ' (Tú)' : ''}
                        </span>
                      </div>
                      <div className="mt-1 font-mono-tab text-sm font-bold text-amber-300">
                        {myTeamMvp.tags} tags · {myTeamMvp.score} pts
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono-tab">
                        Racha máx: {myTeamMvp.bestStreak}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-slate-400">Sin datos de equipo.</p>
                  )}

                  {/* Team Roster Breakdown */}
                  <div className="mt-4 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-400">
                      Integrantes de tu equipo
                    </div>
                    {myTeamPlayers.map((tp) => (
                      <div
                        key={tp.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs"
                      >
                        <span className="flex items-center gap-1.5 truncate font-medium text-slate-100">
                          <RankBadge rankedWins={tp.rankedWins ?? 0} size="xs" />
                          <span className="truncate">
                            {tp.country ? `${countryCodeToFlag(tp.country)} ` : ''}
                            {tp.name}
                            {tp.id === myId ? ' (Tú)' : ''}
                          </span>
                        </span>
                        <span className="font-mono-tab font-bold text-cyan-300 shrink-0">
                          {tp.tags} tags
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-center text-xs font-semibold text-slate-300">
                  {state.teamScores.cyan === state.teamScores.rose
                    ? 'Empate técnico entre equipos'
                    : (myTeam === 'cyan' && state.teamScores.cyan > state.teamScores.rose) ||
                        (myTeam === 'rose' && state.teamScores.rose > state.teamScores.cyan)
                      ? '¡Tu equipo ganó la ronda!'
                      : 'El equipo rival se llevó esta ronda'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

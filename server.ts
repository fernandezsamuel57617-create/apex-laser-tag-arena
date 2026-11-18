import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ARENA_MAPS,
  ARENA_MAP_LIST,
  INITIAL_LOBBY_TARGETS,
  LOBBY_SPAWNS,
  LOBBY_START_PAD,
  OBBY_FINISH_PAD,
  PLAYER_EYE_HEIGHT,
  getMapConfig,
  getZoneBounds,
  raycastPlayerHitbox,
  raycastZoneGeometry,
  resolvePlayerMovement,
} from './src/shared/arenaData.ts';
import { isValidCountryCode } from './src/shared/countries.ts';
import {
  getDailyMissionById,
  getTodayDateKey,
  isValidDailyMissionId,
} from './src/shared/dailyMissions.ts';
import { isValidEmoteId } from './src/shared/emotes.ts';
import {
  getOutfitById,
  getOutfitLevel,
  getOutfitMaxHp,
  getOutfitUpgradeCost,
  isValidOutfitId,
  sanitizeOutfitLevels,
  type OutfitId,
} from './src/shared/outfits.ts';
import { validateChatMessage } from './src/shared/profanityFilter.ts';
import { getWeaponById, isValidWeaponId, type WeaponId } from './src/shared/weapons.ts';
import {
  getWeaponSkinById,
  isValidWeaponSkinId,
  type WeaponSkinId,
} from './src/shared/weaponSkins.ts';
import type {
  ArenaMapId,
  AuditEventType,
  AuditLogEntry,
  AuditSeverity,
  BoostPadSnapshot,
  ChatMessageEvent,
  ClientToServerMessage,
  GamePhase,
  Gender,
  KillFeedEvent,
  LaserBeamEvent,
  LeaderboardEntry,
  LobbyTargetSnapshot,
  MapVoteSummary,
  MatchMode,
  MonitorStatePayload,
  PlayerSnapshot,
  PlayerTelemetrySnapshot,
  ServerStatePayload,
  ServerToClientMessage,
  TeamId,
  TeamMode,
  Vec3,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const DATA_DIR = path.resolve(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const USED_CODES_FILE = path.join(DATA_DIR, 'used_room_codes.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_log.json');

const PUBLIC_ROOM_CODE = 'PUBLIC';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOTE_COUNTDOWN_MS = 5_000;
const EMOTE_DURATION_MS = 3_200;

const MATCH_DURATION_MS = 120_000;
const COUNTDOWN_DURATION_MS = 3_000;
const RESULTS_DURATION_MS = 10_000;
const DEATH_CAM_DURATION_MS = 3_000;
const RESPAWN_DELAY_MS = 4_800;
const SPAWN_SHIELD_MS = 1_800;
const BOOST_DURATION_MS = 10_000;
const BOOST_RESPAWN_MS = 12_000;
const TARGET_SCORE_TAGS = 20;
const MAX_LASER_AMMO = 12;
const RELOAD_DURATION_MS = 1_450;

const ACCENT_PALETTE = [
  '#06B6D4', // cyan
  '#F59E0B', // amber
  '#F43F5E', // coral
  '#10B981', // emerald
  '#38BDF8', // sky
  '#FB923C', // orange
];

const BOT_PROFILES: Array<{
  name: string;
  gender: Gender;
  accent: string;
  outfit: OutfitId;
  weapon: WeaponId;
  weaponSkin: WeaponSkinId;
  rankedWins: number;
}> = [
  { name: 'Dron Alfa', gender: 'male', accent: '#F43F5E', outfit: 'cyber_crimson', weapon: 'pulse_carbine', weaponSkin: 'crimson_striker', rankedWins: 3 },
  { name: 'Dron Vega', gender: 'female', accent: '#F59E0B', outfit: 'solar_gold', weapon: 'twin_smg', weaponSkin: 'solar_ember', rankedWins: 7 },
  { name: 'Dron Kiro', gender: 'male', accent: '#38BDF8', outfit: 'neon_phantom', weapon: 'scatter_shotgun', weaponSkin: 'plasma_cobalt', rankedWins: 1 },
  { name: 'Dron Nova', gender: 'female', accent: '#10B981', outfit: 'emerald_viper', weapon: 'rail_sniper', weaponSkin: 'emerald_helix', rankedWins: 13 },
  { name: 'Dron Orión', gender: 'male', accent: '#FB923C', outfit: 'default', weapon: 'pulse_carbine', weaponSkin: 'default', rankedWins: 0 },
];

interface ServerPlayer extends PlayerSnapshot {
  baseAccentColor: string;
  claimedMissionKeys: Set<string>;
  lastShotAt: number;
  respawnAt: number;
  diedAt: number;
  botTargetAngle: number;
  botNextDecisionAt: number;
  botNextShotAt: number;
  botVelY: number;
  botGrounded: boolean;
  // Real-time anti-cheat & telemetry metrics
  prevMoveAt: number;
  prevMoveX: number;
  prevMoveY: number;
  prevMoveZ: number;
  spawnGraceUntil: number;
  currentSpeed: number;
  peakSpeed: number;
  velX: number;
  velY: number;
  velZ: number;
  shotsFired: number;
  shotsHit: number;
  crits: number;
  fireRateViolations: number;
  flagsCount: number;
  lastFlagType: AuditEventType | null;
  lastFlagAt: number;
  lastSpeedFlagAt: number;
  lastRespawnFlagAt: number;
  lastFireRateFlagAt: number;
  lastAccuracyFlagAt: number;
  lastReportedBy: Map<string, number>;
}

interface ServerBoostPad extends BoostPadSnapshot {
  respawnAt: number;
}

interface GameRoom {
  roomCode: string;
  isPrivateRoom: boolean;
  hostPlayerId: string | null;
  teamMode: TeamMode;
  matchMode: MatchMode;
  phase: GamePhase;
  phaseEndsAt: number;
  voteCountdownEndsAt: number;
  votedPreviewMapId: ArenaMapId | null;
  lobbyEnteredAt: number;
  matchNumber: number;
  botsEnabled: boolean;
  currentMapId: ArenaMapId;
  players: Map<string, ServerPlayer>;
  mapVotes: Map<string, ArenaMapId>;
  boostPads: ServerBoostPad[];
  lobbyTargets: LobbyTargetSnapshot[];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadLeaderboard(): LeaderboardEntry[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(LEADERBOARD_FILE, '[]', 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      ...entry,
      rankedWins: typeof entry?.rankedWins === 'number' ? entry.rankedWins : 0,
    }));
  } catch {
    return [];
  }
}

function saveLeaderboard(entries: LeaderboardEntry[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save leaderboard:', err);
  }
}

function loadUsedRoomCodes(): Set<string> {
  try {
    ensureDataDir();
    if (!fs.existsSync(USED_CODES_FILE)) {
      fs.writeFileSync(USED_CODES_FILE, '[]', 'utf-8');
      return new Set<string>([PUBLIC_ROOM_CODE]);
    }
    const raw = fs.readFileSync(USED_CODES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const set = new Set<string>(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
    set.add(PUBLIC_ROOM_CODE);
    return set;
  } catch {
    return new Set<string>([PUBLIC_ROOM_CODE]);
  }
}

function saveUsedRoomCodes(codes: Set<string>) {
  try {
    ensureDataDir();
    fs.writeFileSync(USED_CODES_FILE, JSON.stringify(Array.from(codes)), 'utf-8');
  } catch (err) {
    console.error('Failed to save used room codes:', err);
  }
}

function loadAuditLogs(): AuditLogEntry[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(AUDIT_LOG_FILE)) {
      fs.writeFileSync(AUDIT_LOG_FILE, '[]', 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    return [];
  }
}

function saveAuditLogs(entries: AuditLogEntry[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(entries.slice(0, 200), null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save audit log:', err);
  }
}

let leaderboard: LeaderboardEntry[] = loadLeaderboard();
const usedRoomCodes = loadUsedRoomCodes();
let auditLogs: AuditLogEntry[] = loadAuditLogs();

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!usedRoomCodes.has(code) && !rooms.has(code)) {
      usedRoomCodes.add(code);
      saveUsedRoomCodes(usedRoomCodes);
      return code;
    }
  }
  // Guaranteed unique fallback based on monotonic timestamp + counter
  const fallback = `R${Date.now().toString(36).toUpperCase().slice(-5)}`;
  usedRoomCodes.add(fallback);
  saveUsedRoomCodes(usedRoomCodes);
  return fallback;
}

function getSortedLeaderboard(): LeaderboardEntry[] {
  return [...leaderboard]
    .sort((a, b) => b.totalScore - a.totalScore || b.totalTags - a.totalTags)
    .slice(0, 30);
}

function recordMatchToLeaderboard(
  playersList: ServerPlayer[],
  matchMode: MatchMode,
  teamMode: TeamMode,
  winningTeam: TeamId | null,
) {
  const humanPlayers = playersList.filter((p) => !p.isBot && (p.score > 0 || p.tags > 0 || p.deaths > 0));
  if (humanPlayers.length === 0) return;

  const sortedMatch = [...playersList].sort((a, b) => b.score - a.score || b.tags - a.tags);
  const topScore = sortedMatch[0]?.score ?? 0;
  const now = Date.now();

  for (const p of humanPlayers) {
    const key = `${p.name.toLowerCase()}__${p.gender}`;
    const existing = leaderboard.find((e) => e.id === key);
    const won =
      teamMode === 'teams'
        ? Boolean(winningTeam && p.team === winningTeam)
        : p.score > 0 && p.score === topScore;
    const gainedRankedWin = matchMode === 'ranked' && won ? 1 : 0;
    if (existing) {
      existing.name = p.name;
      existing.totalScore += p.score;
      existing.totalTags += p.tags;
      existing.totalDeaths += p.deaths;
      existing.matchesPlayed += 1;
      if (won) existing.wins += 1;
      existing.rankedWins = Math.max(p.rankedWins, (existing.rankedWins ?? 0) + gainedRankedWin);
      existing.bestStreak = Math.max(existing.bestStreak, p.bestStreak);
      existing.updatedAt = now;
    } else {
      leaderboard.push({
        id: key,
        name: p.name,
        gender: p.gender,
        totalScore: p.score,
        totalTags: p.tags,
        totalDeaths: p.deaths,
        wins: won ? 1 : 0,
        rankedWins: Math.max(p.rankedWins, gainedRankedWin),
        matchesPlayed: 1,
        bestStreak: p.bestStreak,
        updatedAt: now,
      });
    }
  }

  leaderboard = leaderboard
    .sort((a, b) => b.totalScore - a.totalScore || b.totalTags - a.totalTags)
    .slice(0, 100);
  saveLeaderboard(leaderboard);
}

// Authoritative Rooms Registry
const rooms = new Map<string, GameRoom>();
const sockets = new Map<string, WebSocket>();
const clientRooms = new Map<string, string>();
const monitorSubscribers = new Set<string>();

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function buildMonitorPayload(room: GameRoom): MonitorStatePayload {
  const now = Date.now();
  const players: PlayerTelemetrySnapshot[] = Array.from(room.players.values())
    .map((p) => {
      const accuracyPct = p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
      const critPct = p.shotsHit > 0 ? Math.round((p.crits / p.shotsHit) * 100) : 0;
      return {
        id: p.id,
        name: p.name,
        gender: p.gender,
        isBot: p.isBot,
        team: p.team,
        zone: p.zone,
        alive: p.alive,
        speed: Number(p.currentSpeed.toFixed(2)),
        peakSpeed: Number(p.peakSpeed.toFixed(2)),
        velocity: {
          x: Number(p.velX.toFixed(2)),
          y: Number(p.velY.toFixed(2)),
          z: Number(p.velZ.toFixed(2)),
        },
        shotsFired: p.shotsFired,
        shotsHit: p.shotsHit,
        crits: p.crits,
        accuracyPct,
        critPct,
        flagsCount: p.flagsCount,
        lastFlagType: p.lastFlagType,
        lastFlagAt: p.lastFlagAt,
        tags: p.tags,
        deaths: p.deaths,
      };
    })
    .sort((a, b) => Number(a.isBot) - Number(b.isBot) || b.flagsCount - a.flagsCount || b.speed - a.speed);

  return {
    roomCode: room.roomCode,
    serverTime: now,
    players,
    auditLogs: auditLogs.slice(0, 60),
  };
}

function pushMonitorStateToRoomSubscribers(room: GameRoom) {
  if (monitorSubscribers.size === 0) return;
  let payloadStr: string | null = null;
  for (const subId of monitorSubscribers) {
    if (clientRooms.get(subId) !== room.roomCode) continue;
    const ws = sockets.get(subId);
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (!payloadStr) {
      payloadStr = JSON.stringify({
        type: 'monitor_state',
        monitor: buildMonitorPayload(room),
      } satisfies ServerToClientMessage);
    }
    ws.send(payloadStr);
  }
}

function recordAuditEvent(params: {
  room?: GameRoom;
  roomCode: string;
  type: AuditEventType;
  severity: AuditSeverity;
  playerId: string;
  playerName: string;
  reportedById?: string;
  reportedByName?: string;
  reason?: string;
  details: string;
  metrics?: AuditLogEntry['metrics'];
}): AuditLogEntry {
  const now = Date.now();
  const entry: AuditLogEntry = {
    id: nextId('audit'),
    timestamp: now,
    roomCode: params.roomCode,
    type: params.type,
    severity: params.severity,
    playerId: params.playerId,
    playerName: params.playerName,
    ...(params.reportedById ? { reportedById: params.reportedById } : {}),
    ...(params.reportedByName ? { reportedByName: params.reportedByName } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
    details: params.details,
    ...(params.metrics ? { metrics: params.metrics } : {}),
  };

  auditLogs.unshift(entry);
  if (auditLogs.length > 200) {
    auditLogs = auditLogs.slice(0, 200);
  }
  saveAuditLogs(auditLogs);

  const targetRoom = params.room ?? rooms.get(params.roomCode);
  if (targetRoom) {
    const targetPlayer = targetRoom.players.get(params.playerId);
    if (targetPlayer) {
      targetPlayer.flagsCount += 1;
      targetPlayer.lastFlagType = params.type;
      targetPlayer.lastFlagAt = now;
    }
    pushMonitorStateToRoomSubscribers(targetRoom);
  }
  return entry;
}

function sendTo(ws: WebSocket, msg: ServerToClientMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendToRoom(room: GameRoom, msg: ServerToClientMessage) {
  const payload = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.isBot) continue;
    const ws = sockets.get(p.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastGlobal(msg: ServerToClientMessage) {
  const payload = JSON.stringify(msg);
  for (const ws of sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function pickSpawn(room: GameRoom, zone: 'lobby' | 'arena', indexHint: number) {
  const list = zone === 'lobby' ? LOBBY_SPAWNS : getMapConfig(room.currentMapId).spawns;
  return list[Math.abs(indexHint) % list.length];
}

function getMapVoteSummary(room: GameRoom): MapVoteSummary {
  const counts: Record<ArenaMapId, number> = {
    neon_reactor: 0,
    sky_citadel: 0,
    obsidian_maze: 0,
    cyber_colosseum: 0,
    arctic_bastion: 0,
    volcanic_forge: 0,
    solar_temple: 0,
    orbital_station: 0,
  };
  const voters: Record<string, ArenaMapId> = {};
  for (const [uid, mapId] of room.mapVotes.entries()) {
    if (room.players.has(uid) && counts[mapId] !== undefined) {
      counts[mapId] += 1;
      voters[uid] = mapId;
    }
  }
  return { counts, voters };
}

function resolveWinningMapId(room: GameRoom): ArenaMapId {
  const summary = getMapVoteSummary(room);
  const entries = Object.entries(summary.counts) as Array<[ArenaMapId, number]>;
  const maxVotes = Math.max(...entries.map(([, c]) => c));
  if (maxVotes <= 0) {
    // Rotate to a different arena map so the same map doesn't repeat consecutively
    const candidates = ARENA_MAP_LIST.filter((m) => m.id !== room.currentMapId);
    const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? ARENA_MAP_LIST[0];
    return picked.id;
  }
  const tied = entries.filter(([, c]) => c === maxVotes).map(([id]) => id);
  return tied[Math.floor(Math.random() * tied.length)];
}

function getTeamAccent(team: TeamId): string {
  return team === 'cyan' ? '#06B6D4' : '#F43F5E';
}

function getTeamScores(room: GameRoom): { cyan: number; rose: number } {
  let cyan = 0;
  let rose = 0;
  for (const p of room.players.values()) {
    if (p.team === 'cyan') cyan += p.tags;
    else if (p.team === 'rose') rose += p.tags;
  }
  return { cyan, rose };
}

function pickBalancedTeam(room: GameRoom): TeamId {
  let cyan = 0;
  let rose = 0;
  for (const p of room.players.values()) {
    if (p.team === 'cyan') cyan += 1;
    else if (p.team === 'rose') rose += 1;
  }
  return cyan <= rose ? 'cyan' : 'rose';
}

function rebalanceRoomTeams(room: GameRoom) {
  if (room.teamMode === 'ffa') {
    for (const p of room.players.values()) {
      p.team = null;
      p.accentColor = p.baseAccentColor;
    }
    return;
  }
  let idx = 0;
  for (const p of room.players.values()) {
    const team: TeamId = idx % 2 === 0 ? 'cyan' : 'rose';
    idx += 1;
    p.team = team;
    p.accentColor = getTeamAccent(team);
  }
}

function getStatePayload(room: GameRoom): ServerStatePayload {
  const now = Date.now();
  return {
    phase: room.phase,
    phaseEndsAt: room.phaseEndsAt,
    voteCountdownEndsAt: room.voteCountdownEndsAt,
    votedPreviewMapId: room.votedPreviewMapId,
    serverTime: now,
    matchNumber: room.matchNumber,
    roomCode: room.roomCode,
    isPrivateRoom: room.isPrivateRoom,
    hostPlayerId: room.hostPlayerId,
    teamMode: room.teamMode,
    matchMode: room.matchMode,
    teamScores: getTeamScores(room),
    currentMapId: room.currentMapId,
    mapVotes: getMapVoteSummary(room),
    botsEnabled: room.botsEnabled,
    targetScoreTags: TARGET_SCORE_TAGS,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      gender: p.gender,
      country: p.country,
      isBot: p.isBot,
      team: p.team,
      accentColor: p.accentColor,
      equippedOutfit: p.equippedOutfit,
      ownedOutfits: p.ownedOutfits,
      outfitLevels: p.outfitLevels,
      equippedWeapon: p.equippedWeapon,
      ownedWeapons: p.ownedWeapons,
      equippedWeaponSkin: p.equippedWeaponSkin,
      ownedWeaponSkins: p.ownedWeaponSkins,
      coins: p.coins,
      lastCoinsEarned: p.lastCoinsEarned,
      rankedWins: p.rankedWins,
      zone: p.zone,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      sliding: p.sliding,
      hp: p.hp,
      maxHp: p.maxHp,
      score: p.score,
      tags: p.tags,
      deaths: p.deaths,
      streak: p.streak,
      bestStreak: p.bestStreak,
      alive: p.alive,
      deathCamUntil: p.deathCamUntil,
      deathCamKillerId: p.deathCamKillerId,
      deathCamKillerName: p.deathCamKillerName,
      shieldUntil: p.shieldUntil,
      boostUntil: p.boostUntil,
      ammo: p.ammo,
      maxAmmo: p.maxAmmo,
      reloadingUntil: p.reloadingUntil,
      voiceRoom: p.voiceRoom,
      voiceSpeaking: p.voiceSpeaking,
      activeEmote: p.activeEmoteUntil > now ? p.activeEmote : null,
      activeEmoteUntil: p.activeEmoteUntil > now ? p.activeEmoteUntil : 0,
    })),
    boostPads: room.boostPads.map((b) => ({
      id: b.id,
      kind: b.kind,
      x: b.x,
      y: b.y,
      z: b.z,
      active: b.active,
    })),
    lobbyTargets: room.lobbyTargets.map((t) => ({ ...t })),
  };
}

function spawnBotsIfNeeded(room: GameRoom) {
  for (const [id, p] of room.players.entries()) {
    if (p.isBot) room.players.delete(id);
  }
  if (!room.botsEnabled) return;

  const now = Date.now();
  BOT_PROFILES.forEach((profile, idx) => {
    const id = `bot_${room.roomCode}_${idx + 1}`;
    const inArena = room.phase === 'playing' || room.phase === 'countdown';
    const sp = pickSpawn(room, inArena ? 'arena' : 'lobby', idx + 2);
    const botTeam: TeamId | null =
      room.teamMode === 'teams' ? pickBalancedTeam(room) : null;
    const weaponDef = getWeaponById(profile.weapon);
    room.players.set(id, {
      id,
      name: profile.name,
      gender: profile.gender,
      isBot: true,
      team: botTeam,
      baseAccentColor: profile.accent,
      accentColor: botTeam ? getTeamAccent(botTeam) : profile.accent,
      equippedOutfit: profile.outfit,
      ownedOutfits: [profile.outfit],
      outfitLevels: { [profile.outfit]: 1 },
      equippedWeapon: profile.weapon,
      ownedWeapons: [profile.weapon],
      equippedWeaponSkin: profile.weaponSkin,
      ownedWeaponSkins: [profile.weaponSkin],
      coins: 0,
      lastCoinsEarned: 0,
      rankedWins: profile.rankedWins,
      zone: inArena ? 'arena' : 'lobby',
      x: sp.x,
      y: sp.y,
      z: sp.z,
      yaw: sp.yaw,
      pitch: 0,
      sliding: false,
      hp: 100,
      maxHp: 100,
      score: 0,
      tags: 0,
      deaths: 0,
      streak: 0,
      bestStreak: 0,
      alive: true,
      deathCamUntil: 0,
      deathCamKillerId: null,
      deathCamKillerName: null,
      shieldUntil: now + SPAWN_SHIELD_MS,
      boostUntil: 0,
      ammo: weaponDef.maxAmmo,
      maxAmmo: weaponDef.maxAmmo,
      reloadingUntil: 0,
      voiceRoom: null,
      voiceSpeaking: false,
      activeEmote: null,
      activeEmoteUntil: 0,
      claimedMissionKeys: new Set(),
      lastShotAt: 0,
      respawnAt: 0,
      diedAt: 0,
      botTargetAngle: sp.yaw,
      botNextDecisionAt: now + 600 + idx * 250,
      botNextShotAt: now + 900 + idx * 200,
      botVelY: 0,
      botGrounded: true,
      prevMoveAt: now,
      prevMoveX: sp.x,
      prevMoveY: sp.y,
      prevMoveZ: sp.z,
      spawnGraceUntil: now + 1200,
      currentSpeed: 0,
      peakSpeed: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      shotsFired: 0,
      shotsHit: 0,
      crits: 0,
      fireRateViolations: 0,
      flagsCount: 0,
      lastFlagType: null,
      lastFlagAt: 0,
      lastSpeedFlagAt: 0,
      lastRespawnFlagAt: 0,
      lastFireRateFlagAt: 0,
      lastAccuracyFlagAt: 0,
      lastReportedBy: new Map(),
    });
  });
  if (room.teamMode === 'teams') {
    rebalanceRoomTeams(room);
  }
}

function createGameRoom(roomCode: string, isPrivateRoom: boolean, hostPlayerId: string | null, botsEnabled = true): GameRoom {
  const mapId: ArenaMapId =
    ARENA_MAP_LIST[Math.floor(Math.random() * ARENA_MAP_LIST.length)]?.id ?? 'neon_reactor';
  const room: GameRoom = {
    roomCode,
    isPrivateRoom,
    hostPlayerId,
    teamMode: 'ffa',
    matchMode: 'casual',
    phase: 'lobby',
    phaseEndsAt: 0,
    voteCountdownEndsAt: 0,
    votedPreviewMapId: null,
    lobbyEnteredAt: Date.now(),
    matchNumber: 1,
    botsEnabled,
    currentMapId: mapId,
    players: new Map(),
    mapVotes: new Map(),
    boostPads: getMapConfig(mapId).boostPads.map((p) => ({ ...p, respawnAt: 0 })),
    lobbyTargets: INITIAL_LOBBY_TARGETS.map((t) => ({ ...t })),
  };
  spawnBotsIfNeeded(room);
  rooms.set(roomCode, room);
  return room;
}

// Create permanent public lobby room
createGameRoom(PUBLIC_ROOM_CODE, false, null, true);

function getPlayerComputedMaxHp(p: ServerPlayer): number {
  if (p.isBot) return 100;
  return getOutfitMaxHp(getOutfitLevel(p.outfitLevels, p.equippedOutfit));
}

function resetPlayersForArena(room: GameRoom, shieldDurationMs: number) {
  let idx = 0;
  const now = Date.now();
  for (const p of room.players.values()) {
    const sp = pickSpawn(room, 'arena', idx++);
    const maxHp = getPlayerComputedMaxHp(p);
    const weaponDef = getWeaponById(p.equippedWeapon);
    p.zone = 'arena';
    p.x = sp.x;
    p.y = sp.y;
    p.z = sp.z;
    p.yaw = sp.yaw;
    p.pitch = 0;
    p.sliding = false;
    p.maxHp = maxHp;
    p.hp = maxHp;
    p.score = 0;
    p.tags = 0;
    p.deaths = 0;
    p.streak = 0;
    p.bestStreak = 0;
    p.lastCoinsEarned = 0;
    p.alive = true;
    p.deathCamUntil = 0;
    p.deathCamKillerId = null;
    p.deathCamKillerName = null;
    p.shieldUntil = now + shieldDurationMs;
    p.boostUntil = 0;
    p.ammo = weaponDef.maxAmmo;
    p.maxAmmo = weaponDef.maxAmmo;
    p.reloadingUntil = 0;
    p.activeEmote = null;
    p.activeEmoteUntil = 0;
    p.diedAt = 0;
    p.prevMoveAt = now;
    p.prevMoveX = sp.x;
    p.prevMoveY = sp.y;
    p.prevMoveZ = sp.z;
    p.spawnGraceUntil = now + 1200;
    p.currentSpeed = 0;
    p.velX = 0;
    p.velY = 0;
    p.velZ = 0;
    p.shotsFired = 0;
    p.shotsHit = 0;
    p.crits = 0;
    p.fireRateViolations = 0;
  }
}

function transitionToCountdown(room: GameRoom) {
  if (room.phase === 'countdown' || room.phase === 'playing') return;
  room.currentMapId = resolveWinningMapId(room);
  room.mapVotes.clear();
  room.voteCountdownEndsAt = 0;
  room.votedPreviewMapId = null;
  room.boostPads = getMapConfig(room.currentMapId).boostPads.map((p) => ({ ...p, respawnAt: 0 }));

  room.phase = 'countdown';
  room.phaseEndsAt = Date.now() + COUNTDOWN_DURATION_MS;
  room.matchNumber += 1;

  resetPlayersForArena(room, COUNTDOWN_DURATION_MS + SPAWN_SHIELD_MS);
  sendToRoom(room, { type: 'state', state: getStatePayload(room) });
}

function startVotedMatchDirectly(room: GameRoom) {
  if (room.phase !== 'lobby') return;
  room.currentMapId = resolveWinningMapId(room);
  room.mapVotes.clear();
  room.voteCountdownEndsAt = 0;
  room.votedPreviewMapId = null;
  room.boostPads = getMapConfig(room.currentMapId).boostPads.map((p) => ({ ...p, respawnAt: 0 }));

  room.matchNumber += 1;
  room.phase = 'playing';
  room.phaseEndsAt = Date.now() + MATCH_DURATION_MS;

  resetPlayersForArena(room, SPAWN_SHIELD_MS);
  sendToRoom(room, { type: 'state', state: getStatePayload(room) });
}

function transitionToPlaying(room: GameRoom) {
  room.phase = 'playing';
  room.phaseEndsAt = Date.now() + MATCH_DURATION_MS;
  sendToRoom(room, { type: 'state', state: getStatePayload(room) });
}

function transitionToResults(room: GameRoom) {
  if (room.phase === 'results') return;
  room.phase = 'results';
  room.phaseEndsAt = Date.now() + RESULTS_DURATION_MS;

  const allPlayers = Array.from(room.players.values());
  const sortedMatch = [...allPlayers].sort((a, b) => b.score - a.score || b.tags - a.tags);
  const topScore = sortedMatch[0]?.score ?? 0;
  const maxKills = Math.max(0, ...allPlayers.map((p) => p.tags));
  const teamScores = getTeamScores(room);
  const winningTeam: TeamId | null =
    room.teamMode === 'teams'
      ? teamScores.cyan > teamScores.rose
        ? 'cyan'
        : teamScores.rose > teamScores.cyan
          ? 'rose'
          : null
      : null;

  for (const p of allPlayers) {
    if (p.isBot) continue;
    const rank = sortedMatch.findIndex((entry) => entry.id === p.id);
    const won =
      room.teamMode === 'teams'
        ? Boolean(winningTeam && p.team === winningTeam)
        : p.score > 0 && p.score === topScore;
    const isMvp = maxKills > 0 && p.tags === maxKills;

    let earned = 0;
    if (won) {
      earned = room.matchMode === 'ranked' ? 180 : 150;
    } else if (rank >= 0 && rank <= 2 && p.tags > 0) {
      earned = 50;
    } else if (p.tags > 0 || p.score > 0 || p.deaths > 0) {
      earned = 25;
    }
    if (isMvp) {
      earned += 25;
    }

    if (room.matchMode === 'ranked' && won) {
      p.rankedWins = Math.min(10_000, p.rankedWins + 1);
    }

    p.lastCoinsEarned = earned;
    if (earned > 0) {
      p.coins = Math.min(1_000_000, p.coins + earned);
    }
    const ws = sockets.get(p.id);
    if (ws) {
      sendTo(ws, {
        type: 'match_reward',
        coinsEarned: earned,
        totalCoins: p.coins,
        won,
        isMvp,
        tags: p.tags,
        bestStreak: p.bestStreak,
        matchMode: room.matchMode,
        rankedWins: p.rankedWins,
      });
    }
  }

  recordMatchToLeaderboard(allPlayers, room.matchMode, room.teamMode, winningTeam);
  broadcastGlobal({ type: 'leaderboard', leaderboard: getSortedLeaderboard() });
  sendToRoom(room, { type: 'state', state: getStatePayload(room) });
}

function transitionToLobby(room: GameRoom) {
  room.phase = 'lobby';
  room.phaseEndsAt = 0;
  room.voteCountdownEndsAt = 0;
  room.votedPreviewMapId = null;
  room.lobbyEnteredAt = Date.now();
  let idx = 0;
  const now = Date.now();
  for (const p of room.players.values()) {
    const sp = pickSpawn(room, 'lobby', idx++);
    const maxHp = getPlayerComputedMaxHp(p);
    const weaponDef = getWeaponById(p.equippedWeapon);
    p.zone = 'lobby';
    p.x = sp.x;
    p.y = sp.y;
    p.z = sp.z;
    p.yaw = sp.yaw;
    p.pitch = 0;
    p.sliding = false;
    p.maxHp = maxHp;
    p.hp = maxHp;
    p.alive = true;
    p.deathCamUntil = 0;
    p.deathCamKillerId = null;
    p.deathCamKillerName = null;
    p.shieldUntil = now + 500;
    p.boostUntil = 0;
    p.score = 0;
    p.tags = 0;
    p.deaths = 0;
    p.streak = 0;
    p.bestStreak = 0;
    p.lastCoinsEarned = 0;
    p.ammo = weaponDef.maxAmmo;
    p.maxAmmo = weaponDef.maxAmmo;
    p.reloadingUntil = 0;
    p.diedAt = 0;
    p.prevMoveAt = now;
    p.prevMoveX = sp.x;
    p.prevMoveY = sp.y;
    p.prevMoveZ = sp.z;
    p.spawnGraceUntil = now + 1200;
    p.currentSpeed = 0;
    p.velX = 0;
    p.velY = 0;
    p.velZ = 0;
  }
  sendToRoom(room, { type: 'state', state: getStatePayload(room) });
}

function handleLaserShot(room: GameRoom, shooter: ServerPlayer, rawOrigin: Vec3, rawDir: Vec3) {
  const now = Date.now();
  if (!shooter.alive) {
    if (
      !shooter.isBot &&
      room.phase === 'playing' &&
      shooter.diedAt > 0 &&
      now - shooter.diedAt > 450 &&
      now < shooter.respawnAt - 350 &&
      now - shooter.lastRespawnFlagAt > 5000
    ) {
      shooter.lastRespawnFlagAt = now;
      recordAuditEvent({
        room,
        roomCode: room.roomCode,
        type: 'INSTANT_RESPAWN_HACK',
        severity: 'high',
        playerId: shooter.id,
        playerName: shooter.name,
        details: `Intento de disparo mientras está eliminado (faltaban ${Math.max(0, shooter.respawnAt - now)} ms para reaparecer).`,
        metrics: { respawnRemainingMs: Math.max(0, shooter.respawnAt - now) },
      });
    }
    return;
  }
  if (shooter.zone === 'lobby') return;
  if (room.phase !== 'playing') return;
  if (shooter.reloadingUntil > now) return;
  if (
    !rawOrigin ||
    !rawDir ||
    !Number.isFinite(rawOrigin.x) ||
    !Number.isFinite(rawOrigin.y) ||
    !Number.isFinite(rawOrigin.z) ||
    !Number.isFinite(rawDir.x) ||
    !Number.isFinite(rawDir.y) ||
    !Number.isFinite(rawDir.z)
  ) {
    return;
  }

  const weaponDef = getWeaponById(shooter.equippedWeapon);
  if (shooter.ammo <= 0) {
    shooter.reloadingUntil = now + weaponDef.reloadDurationMs;
    return;
  }

  const isBoosted = shooter.boostUntil > now;
  const cooldown = isBoosted ? weaponDef.boostedCooldownMs : weaponDef.fireCooldownMs;
  if (now - shooter.lastShotAt < cooldown) {
    if (!shooter.isBot && now - shooter.lastShotAt < cooldown * 0.65) {
      shooter.fireRateViolations += 1;
      if (shooter.fireRateViolations >= 4 && now - shooter.lastFireRateFlagAt > 6000) {
        shooter.lastFireRateFlagAt = now;
        shooter.fireRateViolations = 0;
        recordAuditEvent({
          room,
          roomCode: room.roomCode,
          type: 'ABNORMAL_FIRE_RATE',
          severity: 'medium',
          playerId: shooter.id,
          playerName: shooter.name,
          details: `Cadencia de disparo anormal detectada con ${weaponDef.name} (${now - shooter.lastShotAt}ms vs límite ${cooldown}ms).`,
        });
      }
    }
    return;
  }
  shooter.fireRateViolations = Math.max(0, shooter.fireRateViolations - 1);
  shooter.lastShotAt = now;
  shooter.shotsFired += 1;
  shooter.ammo = Math.max(0, shooter.ammo - 1);
  if (shooter.ammo === 0) {
    shooter.reloadingUntil = now + weaponDef.reloadDurationMs;
  }

  const len = Math.hypot(rawDir.x, rawDir.y, rawDir.z);
  if (len < 1e-4) return;
  const baseDir: Vec3 = { x: rawDir.x / len, y: rawDir.y / len, z: rawDir.z / len };

  const eyeX = shooter.x;
  const eyeY = shooter.y + PLAYER_EYE_HEIGHT;
  const eyeZ = shooter.z;
  const originDist = Math.hypot(rawOrigin.x - eyeX, rawOrigin.y - eyeY, rawOrigin.z - eyeZ);
  const origin: Vec3 = originDist < 1.8 ? rawOrigin : { x: eyeX, y: eyeY, z: eyeZ };
  const zone = shooter.zone;

  const hitTotals = new Map<string, { victim: ServerPlayer; totalDamage: number; anyCrit: boolean }>();

  for (let pelletIdx = 0; pelletIdx < weaponDef.pellets; pelletIdx++) {
    let px = baseDir.x;
    let py = baseDir.y;
    let pz = baseDir.z;
    if (weaponDef.spreadRad > 0) {
      px += (Math.random() - 0.5) * weaponDef.spreadRad * 2;
      py += (Math.random() - 0.5) * weaponDef.spreadRad * 1.5;
      pz += (Math.random() - 0.5) * weaponDef.spreadRad * 2;
      const plen = Math.hypot(px, py, pz) || 1;
      px /= plen;
      py /= plen;
      pz /= plen;
    }
    const dir: Vec3 = { x: px, y: py, z: pz };
    const wallDist = raycastZoneGeometry(zone, origin, dir, weaponDef.range, room.currentMapId);

    let closestDist = wallDist;
    let hitPlayer: ServerPlayer | null = null;
    let hitIsCrit = false;

    for (const candidate of room.players.values()) {
      if (candidate.id === shooter.id) continue;
      if (room.teamMode === 'teams' && shooter.team && candidate.team === shooter.team) continue;
      if (!candidate.alive || candidate.zone !== 'arena') continue;
      if (candidate.shieldUntil > now) continue;

      const hit = raycastPlayerHitbox(origin, dir, {
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
      });
      if (hit && hit.dist < closestDist) {
        closestDist = hit.dist;
        hitPlayer = candidate;
        hitIsCrit = hit.isCrit;
      }
    }

    const endPoint: Vec3 = {
      x: origin.x + dir.x * closestDist,
      y: origin.y + dir.y * closestDist,
      z: origin.z + dir.z * closestDist,
    };

    const beamStart: Vec3 = {
      x: origin.x + dir.x * 0.45,
      y: origin.y - 0.14 + dir.y * 0.45,
      z: origin.z + dir.z * 0.45,
    };

    const beam: LaserBeamEvent = {
      id: nextId('beam'),
      shooterId: shooter.id,
      zone,
      from: beamStart,
      to: endPoint,
      color: shooter.accentColor,
      isCrit: hitIsCrit,
      beamRadius: weaponDef.beamRadius,
      hitPlayerId: hitPlayer ? hitPlayer.id : null,
      hitTargetId: null,
      timestamp: now,
    };
    sendToRoom(room, { type: 'beam', beam });

    if (hitPlayer) {
      const dmg = hitIsCrit ? weaponDef.critDamage : weaponDef.damage;
      const existing = hitTotals.get(hitPlayer.id);
      if (existing) {
        existing.totalDamage += dmg;
        existing.anyCrit = existing.anyCrit || hitIsCrit;
      } else {
        hitTotals.set(hitPlayer.id, { victim: hitPlayer, totalDamage: dmg, anyCrit: hitIsCrit });
      }
    }
  }

  if (hitTotals.size > 0) {
    shooter.shotsHit += 1;
    let shotHadCrit = false;
    for (const h of hitTotals.values()) {
      if (h.anyCrit) shotHadCrit = true;
    }
    if (shotHadCrit) shooter.crits += 1;

    if (
      !shooter.isBot &&
      shooter.shotsFired >= 14 &&
      shooter.shotsHit / shooter.shotsFired >= 0.88 &&
      now - shooter.lastAccuracyFlagAt > 15_000
    ) {
      shooter.lastAccuracyFlagAt = now;
      const pct = Math.round((shooter.shotsHit / shooter.shotsFired) * 100);
      recordAuditEvent({
        room,
        roomCode: room.roomCode,
        type: 'SUSPICIOUS_ACCURACY',
        severity: 'medium',
        playerId: shooter.id,
        playerName: shooter.name,
        details: `Precisión anómala sostenida (${pct}% en ${shooter.shotsHit}/${shooter.shotsFired} disparos).`,
        metrics: {
          accuracy: pct,
          shotsFired: shooter.shotsFired,
          shotsHit: shooter.shotsHit,
        },
      });
    }
  }

  for (const { victim, totalDamage, anyCrit } of hitTotals.values()) {
    if (!victim.alive) continue;
    victim.hp = Math.max(0, victim.hp - totalDamage);
    const killed = victim.hp <= 0;

    const shooterWs = sockets.get(shooter.id);
    if (shooterWs) {
      sendTo(shooterWs, {
        type: 'hit_confirm',
        victimId: victim.id,
        damage: totalDamage,
        isCrit: anyCrit,
        killed,
      });
    }

    const victimWs = sockets.get(victim.id);
    if (victimWs) {
      sendTo(victimWs, {
        type: 'damaged',
        shooterId: shooter.id,
        damage: totalDamage,
        hp: victim.hp,
        from: origin,
      });
    }

    if (killed) {
      victim.alive = false;
      victim.diedAt = now;
      victim.deathCamUntil = now + DEATH_CAM_DURATION_MS;
      victim.deathCamKillerId = shooter.id;
      victim.deathCamKillerName = shooter.name;
      victim.respawnAt = now + RESPAWN_DELAY_MS;
      victim.deaths += 1;
      victim.streak = 0;
      victim.currentSpeed = 0;
      victim.velX = 0;
      victim.velY = 0;
      victim.velZ = 0;

      if (victimWs) {
        sendTo(victimWs, {
          type: 'eliminated',
          killerId: shooter.id,
          killerName: shooter.name,
          killerGender: shooter.gender,
          killerCountry: shooter.country,
          killerOutfit: shooter.equippedOutfit,
          isCrit: anyCrit,
          deathCamDurationMs: DEATH_CAM_DURATION_MS,
          respawnDelayMs: RESPAWN_DELAY_MS,
        });
      }

      shooter.tags += 1;
      shooter.streak += 1;
      shooter.bestStreak = Math.max(shooter.bestStreak, shooter.streak);
      const pts = 100 + (anyCrit ? 25 : 0) + Math.min(shooter.streak - 1, 5) * 20;
      shooter.score += pts;

      const kf: KillFeedEvent = {
        id: nextId('kf'),
        shooterId: shooter.id,
        shooterName: shooter.name,
        shooterGender: shooter.gender,
        shooterCountry: shooter.country,
        victimId: victim.id,
        victimName: victim.name,
        victimGender: victim.gender,
        victimCountry: victim.country,
        isCrit: anyCrit,
        points: pts,
        timestamp: now,
      };
      sendToRoom(room, { type: 'killfeed', event: kf });

      if (shooter.tags >= TARGET_SCORE_TAGS) {
        transitionToResults(room);
        break;
      }
    }
  }
}

function updateBots(room: GameRoom, now: number, dt: number) {
  for (const bot of room.players.values()) {
    if (!bot.isBot) continue;

    if (!bot.alive) {
      if (now >= bot.respawnAt) {
        const sp = pickSpawn(room, bot.zone, Math.floor(Math.random() * 8));
        bot.x = sp.x;
        bot.y = sp.y;
        bot.z = sp.z;
        bot.yaw = sp.yaw;
        bot.sliding = false;
        bot.hp = 100;
        bot.alive = true;
        bot.shieldUntil = now + SPAWN_SHIELD_MS;
        bot.ammo = bot.maxAmmo;
        bot.reloadingUntil = 0;
      }
      continue;
    }

    if (bot.zone === 'lobby') {
      // Gentle patrol around lobby
      if (now >= bot.botNextDecisionAt) {
        bot.botTargetAngle += (Math.random() - 0.5) * 2.2;
        bot.botNextDecisionAt = now + 1500 + Math.random() * 1500;
      }
      bot.yaw = bot.botTargetAngle;
      const spd = 2.6;
      const res = resolvePlayerMovement(
        'lobby',
        { x: bot.x, y: bot.y, z: bot.z },
        bot.botVelY,
        -Math.sin(bot.yaw) * spd,
        -Math.cos(bot.yaw) * spd,
        false,
        bot.botGrounded,
        dt,
      );
        const prevX = bot.x;
        const prevY = bot.y;
        const prevZ = bot.z;
        bot.x = res.x;
        bot.y = res.y;
        bot.z = res.z;
        bot.botVelY = res.velY;
        bot.botGrounded = res.grounded;
        if (dt > 0.001) {
          bot.velX = (bot.x - prevX) / dt;
          bot.velY = (bot.y - prevY) / dt;
          bot.velZ = (bot.z - prevZ) / dt;
          bot.currentSpeed = Math.hypot(bot.velX, bot.velZ);
          bot.peakSpeed = Math.max(bot.peakSpeed, bot.currentSpeed);
        }
      continue;
    }

    if (room.phase !== 'playing') continue;

    // Arena bot AI: seek nearest visible opponent or patrol
    let nearestOpp: ServerPlayer | null = null;
    let nearestDist = 42;
    for (const other of room.players.values()) {
      if (other.id === bot.id || !other.alive || other.zone !== 'arena') continue;
      if (room.teamMode === 'teams' && bot.team && other.team === bot.team) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestOpp = other;
      }
    }

    if (nearestOpp) {
      const dx = nearestOpp.x - bot.x;
      const dy = nearestOpp.y - bot.y;
      const dz = nearestOpp.z - bot.z;
      const targetYaw = Math.atan2(-dx, -dz);
      bot.yaw = targetYaw;
      bot.pitch = Math.atan2(dy, Math.hypot(dx, dz));

      // Check line of sight
      const dist3d = Math.hypot(dx, dy, dz);
      const dir =
        dist3d >= 0.05
          ? { x: dx / dist3d, y: dy / dist3d, z: dz / dist3d }
          : { x: -Math.sin(bot.yaw), y: 0, z: -Math.cos(bot.yaw) };
      const wallDist =
        dist3d >= 0.05
          ? raycastZoneGeometry(
              'arena',
              { x: bot.x, y: bot.y + PLAYER_EYE_HEIGHT, z: bot.z },
              dir,
              dist3d,
              room.currentMapId,
            )
          : dist3d + 1;

      if (wallDist >= dist3d - 0.8 && now >= bot.botNextShotAt) {
        bot.botNextShotAt = now + 1250 + Math.random() * 500;
        // Limit bots so they frequently miss shots (realistic spread + intentional wild shots)
        const wildMiss = Math.random() < 0.45;
        const spreadMag = wildMiss ? 0.28 : 0.14;
        const spreadDir = {
          x: dir.x + (Math.random() - 0.5) * spreadMag,
          y: dir.y + (Math.random() - 0.5) * (spreadMag * 0.65),
          z: dir.z + (Math.random() - 0.5) * spreadMag,
        };
        handleLaserShot(
          room,
          bot,
          { x: bot.x, y: bot.y + PLAYER_EYE_HEIGHT, z: bot.z },
          spreadDir,
        );
      }

      // Strafe or close distance
      const moveAngle = nearestDist > 14 ? bot.yaw : bot.yaw + Math.PI * 0.5;
      const spd = 4.1;
      const res = resolvePlayerMovement(
        'arena',
        { x: bot.x, y: bot.y, z: bot.z },
        bot.botVelY,
        -Math.sin(moveAngle) * spd,
        -Math.cos(moveAngle) * spd,
        Math.random() < 0.02,
        bot.botGrounded,
        dt,
        room.currentMapId,
      );
      const prevX = bot.x;
      const prevY = bot.y;
      const prevZ = bot.z;
      bot.x = res.x;
      bot.y = res.y;
      bot.z = res.z;
      bot.botVelY = res.velY;
      bot.botGrounded = res.grounded;
      if (dt > 0.001) {
        bot.velX = (bot.x - prevX) / dt;
        bot.velY = (bot.y - prevY) / dt;
        bot.velZ = (bot.z - prevZ) / dt;
        bot.currentSpeed = Math.hypot(bot.velX, bot.velZ);
        bot.peakSpeed = Math.max(bot.peakSpeed, bot.currentSpeed);
      }
    } else {
      if (now >= bot.botNextDecisionAt) {
        bot.botTargetAngle += (Math.random() - 0.5) * 2.5;
        bot.botNextDecisionAt = now + 1200 + Math.random() * 1400;
      }
      bot.yaw = bot.botTargetAngle;
      const spd = 4.3;
      const res = resolvePlayerMovement(
        'arena',
        { x: bot.x, y: bot.y, z: bot.z },
        bot.botVelY,
        -Math.sin(bot.yaw) * spd,
        -Math.cos(bot.yaw) * spd,
        false,
        bot.botGrounded,
        dt,
        room.currentMapId,
      );
      const prevX = bot.x;
      const prevY = bot.y;
      const prevZ = bot.z;
      bot.x = res.x;
      bot.y = res.y;
      bot.z = res.z;
      bot.botVelY = res.velY;
      bot.botGrounded = res.grounded;
      if (dt > 0.001) {
        bot.velX = (bot.x - prevX) / dt;
        bot.velY = (bot.y - prevY) / dt;
        bot.velZ = (bot.z - prevZ) / dt;
        bot.currentSpeed = Math.hypot(bot.velX, bot.velZ);
        bot.peakSpeed = Math.max(bot.peakSpeed, bot.currentSpeed);
      }
    }
  }
}

function getPlayerAndRoom(playerId: string): { room: GameRoom; player: ServerPlayer } | null {
  const roomCode = clientRooms.get(playerId);
  if (!roomCode) return null;
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = room.players.get(playerId);
  if (!player) return null;
  return { room, player };
}

function detachPlayerFromRoom(playerId: string, oldRoom: GameRoom) {
  const leaving = oldRoom.players.get(playerId);
  if (leaving?.voiceRoom) {
    for (const other of oldRoom.players.values()) {
      if (other.id !== playerId && other.voiceRoom === leaving.voiceRoom) {
        const targetWs = sockets.get(other.id);
        if (targetWs) sendTo(targetWs, { type: 'voice:peer_left', peerId: playerId });
      }
    }
    leaving.voiceRoom = null;
    leaving.voiceSpeaking = false;
  }

  oldRoom.players.delete(playerId);
  oldRoom.mapVotes.delete(playerId);

  if (oldRoom.mapVotes.size === 0 && oldRoom.voteCountdownEndsAt > 0) {
    oldRoom.voteCountdownEndsAt = 0;
    oldRoom.votedPreviewMapId = null;
  } else if (oldRoom.voteCountdownEndsAt > 0) {
    oldRoom.votedPreviewMapId = resolveWinningMapId(oldRoom);
  }

  if (oldRoom.isPrivateRoom) {
    const remainingHumans = Array.from(oldRoom.players.values()).filter((p) => !p.isBot);
    if (remainingHumans.length === 0) {
      rooms.delete(oldRoom.roomCode);
      return;
    }
    if (oldRoom.hostPlayerId === playerId) {
      oldRoom.hostPlayerId = remainingHumans[0].id;
    }
  }

  sendToRoom(oldRoom, { type: 'state', state: getStatePayload(oldRoom) });
}

function attachPlayerToRoom(player: ServerPlayer, targetRoom: GameRoom) {
  const now = Date.now();
  const zone = targetRoom.phase === 'playing' || targetRoom.phase === 'countdown' ? 'arena' : 'lobby';
  const sp = pickSpawn(targetRoom, zone, targetRoom.players.size);

  player.zone = zone;
  player.x = sp.x;
  player.y = sp.y;
  player.z = sp.z;
  player.yaw = sp.yaw;
  player.pitch = 0;
  player.sliding = false;
  if (targetRoom.teamMode === 'teams') {
    const team = pickBalancedTeam(targetRoom);
    player.team = team;
    player.accentColor = getTeamAccent(team);
  } else {
    player.team = null;
    player.accentColor = player.baseAccentColor;
  }
  const weaponDef = getWeaponById(player.equippedWeapon);
  const maxHp = getPlayerComputedMaxHp(player);
  player.maxHp = maxHp;
  player.hp = maxHp;
  player.score = 0;
  player.tags = 0;
  player.deaths = 0;
  player.streak = 0;
  player.bestStreak = 0;
  player.lastCoinsEarned = 0;
  player.alive = true;
  player.deathCamUntil = 0;
  player.deathCamKillerId = null;
  player.deathCamKillerName = null;
  player.shieldUntil = now + SPAWN_SHIELD_MS;
  player.boostUntil = 0;
  player.ammo = weaponDef.maxAmmo;
  player.maxAmmo = weaponDef.maxAmmo;
  player.reloadingUntil = 0;
  player.voiceRoom = null;
  player.voiceSpeaking = false;
  player.activeEmote = null;
  player.activeEmoteUntil = 0;
  player.diedAt = 0;
  player.prevMoveAt = now;
  player.prevMoveX = sp.x;
  player.prevMoveY = sp.y;
  player.prevMoveZ = sp.z;
  player.spawnGraceUntil = now + 1200;
  player.currentSpeed = 0;
  player.velX = 0;
  player.velY = 0;
  player.velZ = 0;

  targetRoom.players.set(player.id, player);
  clientRooms.set(player.id, targetRoom.roomCode);
  sendToRoom(targetRoom, { type: 'state', state: getStatePayload(targetRoom) });
}

// Authoritative 20Hz simulation tick across all active rooms
let lastTickAt = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTickAt) / 1000, 0.1);
  lastTickAt = now;

  for (const room of rooms.values()) {
    if (room.phase === 'lobby' && room.voteCountdownEndsAt > 0 && now >= room.voteCountdownEndsAt) {
      startVotedMatchDirectly(room);
    } else if (room.phase === 'countdown' && now >= room.phaseEndsAt) {
      transitionToPlaying(room);
    } else if (room.phase === 'playing' && now >= room.phaseEndsAt) {
      transitionToResults(room);
    } else if (room.phase === 'results' && now >= room.phaseEndsAt) {
      transitionToLobby(room);
    }

    // Complete reloads, clear expired emotes, & respawn dead human players
    for (const p of room.players.values()) {
      if (p.activeEmote && p.activeEmoteUntil > 0 && now >= p.activeEmoteUntil) {
        p.activeEmote = null;
        p.activeEmoteUntil = 0;
      }
      if (p.reloadingUntil > 0 && now >= p.reloadingUntil) {
        p.ammo = p.maxAmmo;
        p.reloadingUntil = 0;
      }
      if (!p.isBot && !p.alive && now >= p.respawnAt) {
        const sp = pickSpawn(room, p.zone, Math.floor(Math.random() * 8));
        const maxHp = getPlayerComputedMaxHp(p);
        p.x = sp.x;
        p.y = sp.y;
        p.z = sp.z;
        p.yaw = sp.yaw;
        p.maxHp = maxHp;
        p.hp = maxHp;
        p.alive = true;
        p.deathCamUntil = 0;
        p.deathCamKillerId = null;
        p.deathCamKillerName = null;
        p.shieldUntil = now + SPAWN_SHIELD_MS;
        p.ammo = p.maxAmmo;
        p.reloadingUntil = 0;
        p.diedAt = 0;
        p.prevMoveAt = now;
        p.prevMoveX = sp.x;
        p.prevMoveY = sp.y;
        p.prevMoveZ = sp.z;
        p.spawnGraceUntil = now + 1200;
        p.currentSpeed = 0;
        p.velX = 0;
        p.velY = 0;
        p.velZ = 0;
      }
      if (!p.isBot && p.currentSpeed > 0 && now - p.prevMoveAt > 250) {
        p.currentSpeed = 0;
        p.velX = 0;
        p.velY = 0;
        p.velZ = 0;
      }
    }

    // Update boost pads
    if (room.phase === 'playing') {
      for (const pad of room.boostPads) {
        if (!pad.active && now >= pad.respawnAt) {
          pad.active = true;
        }
        if (pad.active) {
          for (const p of room.players.values()) {
            if (!p.alive || p.zone !== 'arena') continue;
            const dist = Math.hypot(p.x - pad.x, p.z - pad.z);
            if (dist < 1.75 && Math.abs(p.y - pad.y) < 1.2) {
              pad.active = false;
              pad.respawnAt = now + BOOST_RESPAWN_MS;
              if (pad.kind === 'overcharge') {
                p.boostUntil = now + BOOST_DURATION_MS;
              } else {
                p.hp = Math.min(p.maxHp, p.hp + 50);
                p.shieldUntil = now + 3500;
              }
              break;
            }
          }
        }
      }
    }

    // Trigger match start when a human player steps onto the Lobby Start Portal or Obby Finish Balcony
    if (room.phase === 'lobby' && now - room.lobbyEnteredAt > 1500) {
      for (const p of room.players.values()) {
        if (p.isBot || !p.alive || p.zone !== 'lobby') continue;
        const onStartPad =
          Math.hypot(p.x - LOBBY_START_PAD.x, p.z - LOBBY_START_PAD.z) <= LOBBY_START_PAD.radius &&
          Math.abs(p.y - LOBBY_START_PAD.y) <= 1.25;
        const onObbyFinish =
          Math.hypot(p.x - OBBY_FINISH_PAD.x, p.z - OBBY_FINISH_PAD.z) <= OBBY_FINISH_PAD.radius &&
          Math.abs(p.y - OBBY_FINISH_PAD.y) <= 1.25;
        if (onStartPad || onObbyFinish) {
          transitionToCountdown(room);
          break;
        }
      }
    }

    updateBots(room, now, dt);
    sendToRoom(room, { type: 'state', state: getStatePayload(room) });
    if (now % 200 < 55) {
      pushMonitorStateToRoomSubscribers(room);
    }
  }
}, 50);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: getSortedLeaderboard() });
  });

  app.get('/api/health', (_req, res) => {
    const publicRoom = rooms.get(PUBLIC_ROOM_CODE);
    res.json({
      ok: true,
      rooms: rooms.size,
      players: sockets.size,
      phase: publicRoom?.phase ?? 'lobby',
      auditCount: auditLogs.length,
    });
  });

  app.get('/api/admin/audit', (_req, res) => {
    res.json({ auditLogs: auditLogs.slice(0, 100) });
  });

  app.post('/api/report', (req, res) => {
    const body = (req.body ?? {}) as {
      targetName?: unknown;
      targetId?: unknown;
      reason?: unknown;
      reporterName?: unknown;
      roomCode?: unknown;
    };
    const targetName = String(body.targetName || '').trim().slice(0, 24);
    const reason = String(body.reason || 'Comportamiento sospechoso').trim().slice(0, 120);
    const reporterName = String(body.reporterName || 'Jugador').trim().slice(0, 24);
    const targetId = String(body.targetId || targetName || 'external').trim().slice(0, 64);
    const roomCode = String(body.roomCode || PUBLIC_ROOM_CODE).trim().toUpperCase().slice(0, 12) || PUBLIC_ROOM_CODE;
    if (!targetName) {
      res.status(400).json({ ok: false, error: 'Nombre de jugador inválido.' });
      return;
    }
    const entry = recordAuditEvent({
      roomCode,
      type: 'PLAYER_REPORT',
      severity: 'low',
      playerId: targetId,
      playerName: targetName,
      reportedByName: reporterName,
      reason,
      details: `Reporte enviado por ${reporterName}: "${reason}".`,
    });
    res.json({ ok: true, entry });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const playerId = nextId('usr');
    let joined = false;

    ws.on('message', (raw) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendTo(ws, { type: 'pong', t: msg.t });
        return;
      }

      if (msg.type === 'join') {
        const cleanName = String(msg.name || 'Agente')
          .trim()
          .slice(0, 18) || 'Agente';
        const gender: Gender = msg.gender === 'female' ? 'female' : 'male';
        const rawCountry = typeof msg.country === 'string' ? msg.country.trim().toUpperCase() : undefined;
        const country = isValidCountryCode(rawCountry) ? rawCountry : undefined;
        const coins =
          typeof msg.coins === 'number' && Number.isFinite(msg.coins)
            ? Math.max(0, Math.min(1_000_000, Math.floor(msg.coins)))
            : 0;
        const rankedWins =
          typeof msg.rankedWins === 'number' && Number.isFinite(msg.rankedWins)
            ? Math.max(0, Math.min(10_000, Math.floor(msg.rankedWins)))
            : 0;
        const ownedList: OutfitId[] = Array.isArray(msg.ownedOutfits)
          ? Array.from(new Set(msg.ownedOutfits.filter(isValidOutfitId)))
          : ['default'];
        if (!ownedList.includes('default')) ownedList.unshift('default');
        const equippedOutfit: OutfitId =
          isValidOutfitId(msg.equippedOutfit) && ownedList.includes(msg.equippedOutfit)
            ? msg.equippedOutfit
            : 'default';
        const outfitLevels = sanitizeOutfitLevels(msg.outfitLevels, ownedList);
        const ownedWeapons: WeaponId[] = Array.isArray(msg.ownedWeapons)
          ? Array.from(new Set(msg.ownedWeapons.filter(isValidWeaponId)))
          : ['pulse_carbine'];
        if (!ownedWeapons.includes('pulse_carbine')) ownedWeapons.unshift('pulse_carbine');
        const equippedWeapon: WeaponId =
          isValidWeaponId(msg.equippedWeapon) && ownedWeapons.includes(msg.equippedWeapon)
            ? msg.equippedWeapon
            : 'pulse_carbine';
        const ownedWeaponSkins: WeaponSkinId[] = Array.isArray(msg.ownedWeaponSkins)
          ? Array.from(new Set(msg.ownedWeaponSkins.filter(isValidWeaponSkinId)))
          : ['default'];
        if (!ownedWeaponSkins.includes('default')) ownedWeaponSkins.unshift('default');
        const equippedWeaponSkin: WeaponSkinId =
          isValidWeaponSkinId(msg.equippedWeaponSkin) &&
          ownedWeaponSkins.includes(msg.equippedWeaponSkin)
            ? msg.equippedWeaponSkin
            : 'default';

        const requestedCode =
          typeof msg.roomCode === 'string'
            ? msg.roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
            : '';
        const targetRoom = (requestedCode && rooms.get(requestedCode)) || rooms.get(PUBLIC_ROOM_CODE)!;

        const zone = targetRoom.phase === 'playing' || targetRoom.phase === 'countdown' ? 'arena' : 'lobby';
        const sp = pickSpawn(targetRoom, zone, targetRoom.players.size);
        const baseAccentColor = ACCENT_PALETTE[targetRoom.players.size % ACCENT_PALETTE.length];
        const initialTeam: TeamId | null =
          targetRoom.teamMode === 'teams' ? pickBalancedTeam(targetRoom) : null;
        const accentColor = initialTeam ? getTeamAccent(initialTeam) : baseAccentColor;
        const now = Date.now();
        const weaponDef = getWeaponById(equippedWeapon);
        const initialMaxHp = getOutfitMaxHp(getOutfitLevel(outfitLevels, equippedOutfit));

        const player: ServerPlayer = {
          id: playerId,
          name: cleanName,
          gender,
          country,
          isBot: false,
          team: initialTeam,
          baseAccentColor,
          accentColor,
          equippedOutfit,
          ownedOutfits: ownedList,
          outfitLevels,
          equippedWeapon,
          ownedWeapons,
          equippedWeaponSkin,
          ownedWeaponSkins,
          coins,
          lastCoinsEarned: 0,
          rankedWins,
          zone,
          x: sp.x,
          y: sp.y,
          z: sp.z,
          yaw: sp.yaw,
          pitch: 0,
          sliding: false,
          hp: initialMaxHp,
          maxHp: initialMaxHp,
          score: 0,
          tags: 0,
          deaths: 0,
          streak: 0,
          bestStreak: 0,
          alive: true,
          deathCamUntil: 0,
          deathCamKillerId: null,
          deathCamKillerName: null,
          shieldUntil: now + SPAWN_SHIELD_MS,
          boostUntil: 0,
          ammo: weaponDef.maxAmmo,
          maxAmmo: weaponDef.maxAmmo,
          reloadingUntil: 0,
          voiceRoom: null,
          voiceSpeaking: false,
          activeEmote: null,
          activeEmoteUntil: 0,
          claimedMissionKeys: new Set(),
          lastShotAt: 0,
          respawnAt: 0,
          diedAt: 0,
          botTargetAngle: 0,
          botNextDecisionAt: 0,
          botNextShotAt: 0,
          botVelY: 0,
          botGrounded: true,
          prevMoveAt: now,
          prevMoveX: sp.x,
          prevMoveY: sp.y,
          prevMoveZ: sp.z,
          spawnGraceUntil: now + 1200,
          currentSpeed: 0,
          peakSpeed: 0,
          velX: 0,
          velY: 0,
          velZ: 0,
          shotsFired: 0,
          shotsHit: 0,
          crits: 0,
          fireRateViolations: 0,
          flagsCount: 0,
          lastFlagType: null,
          lastFlagAt: 0,
          lastSpeedFlagAt: 0,
          lastRespawnFlagAt: 0,
          lastFireRateFlagAt: 0,
          lastAccuracyFlagAt: 0,
          lastReportedBy: new Map(),
        };

        targetRoom.players.set(playerId, player);
        sockets.set(playerId, ws);
        clientRooms.set(playerId, targetRoom.roomCode);
        joined = true;

        sendTo(ws, {
          type: 'welcome',
          playerId,
          state: getStatePayload(targetRoom),
          leaderboard: getSortedLeaderboard(),
        });
        sendToRoom(targetRoom, { type: 'state', state: getStatePayload(targetRoom) });
        return;
      }

      if (!joined) return;
      const found = getPlayerAndRoom(playerId);
      if (!found) return;
      const { room, player } = found;

      if (msg.type === 'move') {
        const now = Date.now();
        if (!player.alive) {
          if (
            room.phase === 'playing' &&
            player.diedAt > 0 &&
            now - player.diedAt > 450 &&
            now < player.respawnAt - 350 &&
            now - player.lastRespawnFlagAt > 5000
          ) {
            player.lastRespawnFlagAt = now;
            recordAuditEvent({
              room,
              roomCode: room.roomCode,
              type: 'INSTANT_RESPAWN_HACK',
              severity: 'high',
              playerId: player.id,
              playerName: player.name,
              details: `Intento de movimiento prematuro mientras está eliminado (faltaban ${Math.max(0, player.respawnAt - now)} ms).`,
              metrics: { respawnRemainingMs: Math.max(0, player.respawnAt - now) },
            });
          }
          return;
        }
        if (room.phase === 'results' || room.phase === 'countdown') return;
        if (msg.zone && msg.zone !== player.zone) return;
        const bounds = getZoneBounds(player.zone);
        if (
          Number.isFinite(msg.x) &&
          Number.isFinite(msg.y) &&
          Number.isFinite(msg.z) &&
          Number.isFinite(msg.yaw) &&
          Number.isFinite(msg.pitch)
        ) {
          if (player.zone === 'arena' && msg.z < -45) return;
          const nextX = Math.max(bounds.minX, Math.min(bounds.maxX, msg.x));
          const nextY = Math.max(0, Math.min(18, msg.y));
          const nextZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, msg.z));

          const elapsedSec = Math.max(0.025, (now - player.prevMoveAt) / 1000);
          const dx = nextX - player.prevMoveX;
          const dy = nextY - player.prevMoveY;
          const dz = nextZ - player.prevMoveZ;
          const distXZ = Math.hypot(dx, dz);
          const speedXZ = distXZ / elapsedSec;

          player.velX = dx / elapsedSec;
          player.velY = dy / elapsedSec;
          player.velZ = dz / elapsedSec;
          player.currentSpeed = speedXZ;
          if (now >= player.spawnGraceUntil && speedXZ < 80) {
            player.peakSpeed = Math.max(player.peakSpeed, speedXZ);
          }

          let acceptedX = nextX;
          let acceptedY = nextY;
          let acceptedZ = nextZ;

          if (now >= player.spawnGraceUntil && speedXZ > 31 && distXZ > 2.2) {
            if (now - player.lastSpeedFlagAt > 4000) {
              player.lastSpeedFlagAt = now;
              recordAuditEvent({
                room,
                roomCode: room.roomCode,
                type: 'ABNORMAL_SPEED',
                severity: speedXZ > 55 ? 'high' : 'medium',
                playerId: player.id,
                playerName: player.name,
                details: `Velocidad anormal detectada: ${speedXZ.toFixed(1)} u/s (salto de ${distXZ.toFixed(1)}u en ${(elapsedSec * 1000).toFixed(0)}ms).`,
                metrics: { speed: Number(speedXZ.toFixed(1)) },
              });
            }
            if (distXZ > 22) {
              acceptedX = player.prevMoveX + (dx / distXZ) * 14;
              acceptedZ = player.prevMoveZ + (dz / distXZ) * 14;
            }
          }

          player.x = acceptedX;
          player.y = acceptedY;
          player.z = acceptedZ;
          player.yaw = msg.yaw;
          player.pitch = Math.max(-1.48, Math.min(1.48, msg.pitch));
          player.sliding = Boolean(msg.sliding);

          player.prevMoveAt = now;
          player.prevMoveX = acceptedX;
          player.prevMoveY = acceptedY;
          player.prevMoveZ = acceptedZ;
        }
        return;
      }

      if (msg.type === 'shoot') {
        handleLaserShot(room, player, msg.origin, msg.dir);
        return;
      }

      if (msg.type === 'reload') {
        const now = Date.now();
        if (!player.alive) {
          if (
            room.phase === 'playing' &&
            player.diedAt > 0 &&
            now - player.diedAt > 450 &&
            now < player.respawnAt - 350 &&
            now - player.lastRespawnFlagAt > 5000
          ) {
            player.lastRespawnFlagAt = now;
            recordAuditEvent({
              room,
              roomCode: room.roomCode,
              type: 'INSTANT_RESPAWN_HACK',
              severity: 'high',
              playerId: player.id,
              playerName: player.name,
              details: `Intento de recarga mientras está eliminado (faltaban ${Math.max(0, player.respawnAt - now)} ms).`,
              metrics: { respawnRemainingMs: Math.max(0, player.respawnAt - now) },
            });
          }
          return;
        }
        if (player.zone === 'lobby') return;
        const reloadMs = getWeaponById(player.equippedWeapon).reloadDurationMs;
        if (player.reloadingUntil === 0 && player.ammo < player.maxAmmo) {
          player.reloadingUntil = now + reloadMs;
        }
        return;
      }

      if (msg.type === 'start_match') {
        transitionToCountdown(room);
        return;
      }

      if (msg.type === 'return_lobby') {
        if (room.phase === 'results') {
          transitionToLobby(room);
        }
        return;
      }

      if (msg.type === 'toggle_bots') {
        room.botsEnabled = Boolean(msg.enabled);
        spawnBotsIfNeeded(room);
        sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        return;
      }

      if (msg.type === 'toggle_team_mode') {
        if (room.phase === 'lobby') {
          room.teamMode = msg.teamMode === 'teams' ? 'teams' : 'ffa';
          rebalanceRoomTeams(room);
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'toggle_match_mode') {
        if (room.phase === 'lobby') {
          room.matchMode = msg.matchMode === 'ranked' ? 'ranked' : 'casual';
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'claim_mission_reward') {
        if (isValidDailyMissionId(msg.missionId)) {
          const todayKey = getTodayDateKey();
          const claimKey = `${todayKey}:${msg.missionId}`;
          if (!player.claimedMissionKeys.has(claimKey)) {
            player.claimedMissionKeys.add(claimKey);
            const missionDef = getDailyMissionById(msg.missionId);
            player.coins = Math.min(1_000_000, player.coins + missionDef.rewardCoins);
            sendToRoom(room, { type: 'state', state: getStatePayload(room) });
          }
        }
        return;
      }

      if (msg.type === 'chat') {
        const result = validateChatMessage(String(msg.text || ''));
        if (!result.allowed) {
          sendTo(ws, {
            type: 'chat_blocked',
            reason: result.reason ?? 'Mensaje bloqueado por lenguaje ofensivo.',
          });
          return;
        }
        const chatMessage: ChatMessageEvent = {
          id: nextId('chat'),
          senderId: playerId,
          senderName: player.name,
          senderCountry: player.country,
          team: player.team,
          text: result.cleanText,
          timestamp: Date.now(),
        };
        sendToRoom(room, { type: 'chat', message: chatMessage });
        return;
      }

      if (msg.type === 'vote_map') {
        if (room.phase === 'lobby' && msg.mapId in ARENA_MAPS) {
          room.mapVotes.set(playerId, msg.mapId);
          room.votedPreviewMapId = resolveWinningMapId(room);
          if (room.voteCountdownEndsAt === 0) {
            room.voteCountdownEndsAt = Date.now() + VOTE_COUNTDOWN_MS;
          }
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'emote') {
        if (isValidEmoteId(msg.emote)) {
          const now = Date.now();
          player.activeEmote = msg.emote;
          player.activeEmoteUntil = now + EMOTE_DURATION_MS;
          sendToRoom(room, {
            type: 'player_emote',
            playerId,
            emote: msg.emote,
            expiresAt: player.activeEmoteUntil,
          });
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'create_private_room') {
        const newCode = generateUniqueRoomCode();
        const privateRoom = createGameRoom(newCode, true, playerId, room.botsEnabled);
        detachPlayerFromRoom(playerId, room);
        attachPlayerToRoom(player, privateRoom);
        return;
      }

      if (msg.type === 'join_room') {
        const code = String(msg.roomCode || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        if (!code) {
          sendTo(ws, { type: 'room_error', message: 'Escribe un código de sala válido.' });
          return;
        }
        const targetRoom = rooms.get(code);
        if (!targetRoom) {
          sendTo(ws, {
            type: 'room_error',
            message: `La sala "${code}" no existe o ya se cerró.`,
          });
          return;
        }
        if (targetRoom.roomCode === room.roomCode) {
          return;
        }
        detachPlayerFromRoom(playerId, room);
        attachPlayerToRoom(player, targetRoom);
        return;
      }

      if (msg.type === 'leave_private_room') {
        const publicRoom = rooms.get(PUBLIC_ROOM_CODE);
        if (!publicRoom || publicRoom.roomCode === room.roomCode) return;
        detachPlayerFromRoom(playerId, room);
        attachPlayerToRoom(player, publicRoom);
        return;
      }

      if (msg.type === 'buy_outfit') {
        if (isValidOutfitId(msg.outfitId)) {
          const outfit = getOutfitById(msg.outfitId);
          if (!player.ownedOutfits.includes(outfit.id) && player.coins >= outfit.price) {
            player.coins -= outfit.price;
            player.ownedOutfits = [...player.ownedOutfits, outfit.id];
            player.outfitLevels[outfit.id] = player.outfitLevels[outfit.id] ?? 1;
            player.equippedOutfit = outfit.id;
            const nextMaxHp = getPlayerComputedMaxHp(player);
            player.maxHp = nextMaxHp;
            player.hp = nextMaxHp;
            sendToRoom(room, { type: 'state', state: getStatePayload(room) });
          }
        }
        return;
      }

      if (msg.type === 'equip_outfit') {
        if (isValidOutfitId(msg.outfitId) && player.ownedOutfits.includes(msg.outfitId)) {
          player.equippedOutfit = msg.outfitId;
          player.outfitLevels[msg.outfitId] = player.outfitLevels[msg.outfitId] ?? 1;
          const nextMaxHp = getPlayerComputedMaxHp(player);
          player.maxHp = nextMaxHp;
          player.hp = nextMaxHp;
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'upgrade_outfit') {
        if (isValidOutfitId(msg.outfitId) && player.ownedOutfits.includes(msg.outfitId)) {
          const currentLvl = getOutfitLevel(player.outfitLevels, msg.outfitId);
          const cost = getOutfitUpgradeCost(currentLvl);
          if (cost !== null && player.coins >= cost) {
            player.coins -= cost;
            player.outfitLevels = {
              ...player.outfitLevels,
              [msg.outfitId]: currentLvl + 1,
            };
            const nextMaxHp = getPlayerComputedMaxHp(player);
            player.maxHp = nextMaxHp;
            player.hp = nextMaxHp;
            sendToRoom(room, { type: 'state', state: getStatePayload(room) });
          }
        }
        return;
      }

      if (msg.type === 'buy_weapon') {
        if (isValidWeaponId(msg.weaponId)) {
          const weapon = getWeaponById(msg.weaponId);
          if (!player.ownedWeapons.includes(weapon.id) && player.coins >= weapon.price) {
            player.coins -= weapon.price;
            player.ownedWeapons = [...player.ownedWeapons, weapon.id];
            player.equippedWeapon = weapon.id;
            player.maxAmmo = weapon.maxAmmo;
            player.ammo = weapon.maxAmmo;
            player.reloadingUntil = 0;
            sendToRoom(room, { type: 'state', state: getStatePayload(room) });
          }
        }
        return;
      }

      if (msg.type === 'equip_weapon') {
        if (isValidWeaponId(msg.weaponId) && player.ownedWeapons.includes(msg.weaponId)) {
          const weapon = getWeaponById(msg.weaponId);
          player.equippedWeapon = weapon.id;
          player.maxAmmo = weapon.maxAmmo;
          player.ammo = weapon.maxAmmo;
          player.reloadingUntil = 0;
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'buy_weapon_skin') {
        if (isValidWeaponSkinId(msg.skinId)) {
          const skin = getWeaponSkinById(msg.skinId);
          if (!player.ownedWeaponSkins.includes(skin.id) && player.coins >= skin.price) {
            player.coins -= skin.price;
            player.ownedWeaponSkins = [...player.ownedWeaponSkins, skin.id];
            player.equippedWeaponSkin = skin.id;
            sendToRoom(room, { type: 'state', state: getStatePayload(room) });
          }
        }
        return;
      }

      if (msg.type === 'equip_weapon_skin') {
        if (
          isValidWeaponSkinId(msg.skinId) &&
          player.ownedWeaponSkins.includes(msg.skinId)
        ) {
          player.equippedWeaponSkin = msg.skinId;
          sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        }
        return;
      }

      if (msg.type === 'voice:join') {
        const cleanRoom = String(msg.room || 'general')
          .trim()
          .toLowerCase()
          .slice(0, 24) || 'general';
        const prevRoom = player.voiceRoom;
        if (prevRoom && prevRoom !== cleanRoom) {
          for (const other of room.players.values()) {
            if (other.id !== playerId && other.voiceRoom === prevRoom) {
              const targetWs = sockets.get(other.id);
              if (targetWs) sendTo(targetWs, { type: 'voice:peer_left', peerId: playerId });
            }
          }
        }
        player.voiceRoom = cleanRoom;
        player.voiceSpeaking = false;
        sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        return;
      }

      if (msg.type === 'voice:leave') {
        const prevRoom = player.voiceRoom;
        player.voiceRoom = null;
        player.voiceSpeaking = false;
        if (prevRoom) {
          for (const other of room.players.values()) {
            if (other.id !== playerId && other.voiceRoom === prevRoom) {
              const targetWs = sockets.get(other.id);
              if (targetWs) sendTo(targetWs, { type: 'voice:peer_left', peerId: playerId });
            }
          }
        }
        sendToRoom(room, { type: 'state', state: getStatePayload(room) });
        return;
      }

      if (msg.type === 'voice:speaking') {
        player.voiceSpeaking = Boolean(msg.speaking) && Boolean(player.voiceRoom);
        return;
      }

      if (msg.type === 'voice:signal') {
        const target = room.players.get(msg.targetId);
        const targetWs = sockets.get(msg.targetId);
        if (target && targetWs && target.voiceRoom && target.voiceRoom === player.voiceRoom) {
          sendTo(targetWs, {
            type: 'voice:signal',
            fromId: playerId,
            signal: msg.signal,
          });
        }
        return;
      }

      if (msg.type === 'report_player') {
        const targetName = String(msg.targetName || '').trim().slice(0, 24);
        const reason = String(msg.reason || 'Sospecha de trampa').trim().slice(0, 120);
        const targetId = String(msg.targetId || targetName || 'unknown').trim().slice(0, 64);
        if (!targetName || targetId === playerId) return;

        const now = Date.now();
        const targetPlayer = room.players.get(targetId);
        if (targetPlayer) {
          const prevReportAt = targetPlayer.lastReportedBy.get(playerId) ?? 0;
          if (now - prevReportAt < 15_000) {
            sendTo(ws, {
              type: 'report_ack',
              targetName: targetPlayer.name,
              message: `Ya enviaste un reporte reciente contra ${targetPlayer.name}.`,
            });
            return;
          }
          targetPlayer.lastReportedBy.set(playerId, now);
        }

        const acc =
          targetPlayer && targetPlayer.shotsFired > 0
            ? Math.round((targetPlayer.shotsHit / targetPlayer.shotsFired) * 100)
            : undefined;
        recordAuditEvent({
          room,
          roomCode: room.roomCode,
          type: 'PLAYER_REPORT',
          severity: 'medium',
          playerId: targetPlayer?.id ?? targetId,
          playerName: targetPlayer?.name ?? targetName,
          reportedById: player.id,
          reportedByName: player.name,
          reason,
          details: `${player.name} reportó a ${targetPlayer?.name ?? targetName} (${msg.source ?? 'live'}): "${reason}".`,
          metrics: targetPlayer
            ? {
                speed: Number(targetPlayer.peakSpeed.toFixed(1)),
                accuracy: acc,
                shotsFired: targetPlayer.shotsFired,
                shotsHit: targetPlayer.shotsHit,
              }
            : undefined,
        });
        sendTo(ws, {
          type: 'report_ack',
          targetName: targetPlayer?.name ?? targetName,
          message: `Reporte registrado contra ${targetPlayer?.name ?? targetName} en el registro del servidor.`,
        });
        return;
      }

      if (msg.type === 'monitor_subscribe') {
        if (msg.enabled) {
          monitorSubscribers.add(playerId);
          sendTo(ws, { type: 'monitor_state', monitor: buildMonitorPayload(room) });
        } else {
          monitorSubscribers.delete(playerId);
        }
        return;
      }
    });

    ws.on('close', () => {
      const found = getPlayerAndRoom(playerId);
      monitorSubscribers.delete(playerId);
      sockets.delete(playerId);
      clientRooms.delete(playerId);
      if (found) {
        detachPlayerFromRoom(playerId, found.room);
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Laser Tag Arena server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});

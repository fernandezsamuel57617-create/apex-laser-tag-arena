import type { DailyMissionId } from './dailyMissions.ts';
import type { EmoteId } from './emotes.ts';
import type { OutfitId } from './outfits.ts';
import type { WeaponId } from './weapons.ts';
import type { WeaponSkinId } from './weaponSkins.ts';

export type Gender = 'male' | 'female';

export type TeamMode = 'ffa' | 'teams';

export type MatchMode = 'casual' | 'ranked';

export type TeamId = 'cyan' | 'rose';

export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'results';

export type ZoneId = 'lobby' | 'arena';

export type ArenaMapId =
  | 'neon_reactor'
  | 'sky_citadel'
  | 'obsidian_maze'
  | 'cyber_colosseum'
  | 'arctic_bastion'
  | 'volcanic_forge'
  | 'solar_temple'
  | 'orbital_station';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  gender: Gender;
  country?: string;
  isBot: boolean;
  team: TeamId | null;
  accentColor: string;
  equippedOutfit: OutfitId;
  ownedOutfits: OutfitId[];
  outfitLevels: Partial<Record<OutfitId, number>>;
  equippedWeapon: WeaponId;
  ownedWeapons: WeaponId[];
  equippedWeaponSkin: WeaponSkinId;
  ownedWeaponSkins: WeaponSkinId[];
  coins: number;
  lastCoinsEarned: number;
  rankedWins: number;
  zone: ZoneId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  sliding: boolean;
  hp: number;
  maxHp: number;
  score: number;
  tags: number;
  deaths: number;
  streak: number;
  bestStreak: number;
  alive: boolean;
  deathCamUntil: number;
  deathCamKillerId: string | null;
  deathCamKillerName: string | null;
  shieldUntil: number;
  boostUntil: number;
  ammo: number;
  maxAmmo: number;
  reloadingUntil: number;
  voiceRoom: string | null;
  voiceSpeaking: boolean;
  activeEmote: EmoteId | null;
  activeEmoteUntil: number;
}

export interface ChatMessageEvent {
  id: string;
  senderId: string;
  senderName: string;
  senderCountry?: string;
  team: TeamId | null;
  text: string;
  timestamp: number;
}

export interface LaserBeamEvent {
  id: string;
  shooterId: string;
  zone: ZoneId;
  from: Vec3;
  to: Vec3;
  color: string;
  isCrit: boolean;
  beamRadius?: number;
  hitPlayerId: string | null;
  hitTargetId?: string | null;
  timestamp: number;
}

export interface KillFeedEvent {
  id: string;
  shooterId: string;
  shooterName: string;
  shooterGender: Gender;
  shooterCountry?: string;
  victimId: string;
  victimName: string;
  victimGender: Gender;
  victimCountry?: string;
  isCrit: boolean;
  points: number;
  timestamp: number;
}

export interface BoostPadSnapshot {
  id: string;
  kind: 'overcharge' | 'shield';
  x: number;
  y: number;
  z: number;
  active: boolean;
}

export interface LobbyTargetSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  hitUntil: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  gender: Gender;
  totalScore: number;
  totalTags: number;
  totalDeaths: number;
  wins: number;
  rankedWins: number;
  matchesPlayed: number;
  bestStreak: number;
  updatedAt: number;
}

export interface MapVoteSummary {
  counts: Record<ArenaMapId, number>;
  voters: Record<string, ArenaMapId>;
}

export interface ServerStatePayload {
  phase: GamePhase;
  phaseEndsAt: number;
  voteCountdownEndsAt: number;
  votedPreviewMapId: ArenaMapId | null;
  serverTime: number;
  matchNumber: number;
  roomCode: string;
  isPrivateRoom: boolean;
  hostPlayerId: string | null;
  teamMode: TeamMode;
  matchMode: MatchMode;
  teamScores: { cyan: number; rose: number };
  currentMapId: ArenaMapId;
  mapVotes: MapVoteSummary;
  botsEnabled: boolean;
  targetScoreTags: number;
  players: PlayerSnapshot[];
  boostPads: BoostPadSnapshot[];
  lobbyTargets: LobbyTargetSnapshot[];
}

export type AuditEventType =
  | 'ABNORMAL_SPEED'
  | 'INSTANT_RESPAWN_HACK'
  | 'ABNORMAL_FIRE_RATE'
  | 'SUSPICIOUS_ACCURACY'
  | 'PLAYER_REPORT';

export type AuditSeverity = 'low' | 'medium' | 'high';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  roomCode: string;
  type: AuditEventType;
  severity: AuditSeverity;
  playerId: string;
  playerName: string;
  reportedById?: string;
  reportedByName?: string;
  reason?: string;
  details: string;
  metrics?: {
    speed?: number;
    accuracy?: number;
    shotsFired?: number;
    shotsHit?: number;
    respawnRemainingMs?: number;
  };
}

export interface PlayerTelemetrySnapshot {
  id: string;
  name: string;
  gender: Gender;
  isBot: boolean;
  team: TeamId | null;
  zone: ZoneId;
  alive: boolean;
  speed: number;
  peakSpeed: number;
  velocity: Vec3;
  shotsFired: number;
  shotsHit: number;
  crits: number;
  accuracyPct: number;
  critPct: number;
  flagsCount: number;
  lastFlagType: AuditEventType | null;
  lastFlagAt: number;
  tags: number;
  deaths: number;
}

export interface MonitorStatePayload {
  roomCode: string;
  serverTime: number;
  players: PlayerTelemetrySnapshot[];
  auditLogs: AuditLogEntry[];
}

export interface VoiceSignalData {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export type ClientToServerMessage =
  | {
      type: 'join';
      name: string;
      gender: Gender;
      country?: string;
      coins?: number;
      rankedWins?: number;
      ownedOutfits?: OutfitId[];
      equippedOutfit?: OutfitId;
      outfitLevels?: Partial<Record<OutfitId, number>>;
      ownedWeapons?: WeaponId[];
      equippedWeapon?: WeaponId;
      ownedWeaponSkins?: WeaponSkinId[];
      equippedWeaponSkin?: WeaponSkinId;
      roomCode?: string;
    }
  | {
      type: 'move';
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      sliding?: boolean;
      zone?: ZoneId;
    }
  | {
      type: 'shoot';
      origin: Vec3;
      dir: Vec3;
    }
  | {
      type: 'reload';
    }
  | {
      type: 'start_match';
    }
  | {
      type: 'return_lobby';
    }
  | {
      type: 'toggle_bots';
      enabled: boolean;
    }
  | {
      type: 'toggle_team_mode';
      teamMode: TeamMode;
    }
  | {
      type: 'toggle_match_mode';
      matchMode: MatchMode;
    }
  | {
      type: 'vote_map';
      mapId: ArenaMapId;
    }
  | {
      type: 'buy_outfit';
      outfitId: OutfitId;
    }
  | {
      type: 'equip_outfit';
      outfitId: OutfitId;
    }
  | {
      type: 'upgrade_outfit';
      outfitId: OutfitId;
    }
  | {
      type: 'buy_weapon';
      weaponId: WeaponId;
    }
  | {
      type: 'equip_weapon';
      weaponId: WeaponId;
    }
  | {
      type: 'buy_weapon_skin';
      skinId: WeaponSkinId;
    }
  | {
      type: 'equip_weapon_skin';
      skinId: WeaponSkinId;
    }
  | {
      type: 'claim_mission_reward';
      missionId: DailyMissionId;
    }
  | {
      type: 'chat';
      text: string;
    }
  | {
      type: 'emote';
      emote: EmoteId;
    }
  | {
      type: 'create_private_room';
    }
  | {
      type: 'join_room';
      roomCode: string;
    }
  | {
      type: 'leave_private_room';
    }
  | {
      type: 'voice:join';
      room: string;
    }
  | {
      type: 'voice:leave';
    }
  | {
      type: 'voice:speaking';
      speaking: boolean;
    }
  | {
      type: 'voice:signal';
      targetId: string;
      signal: VoiceSignalData;
    }
  | {
      type: 'report_player';
      targetId?: string;
      targetName: string;
      reason: string;
      source?: 'live' | 'results' | 'leaderboard';
    }
  | {
      type: 'monitor_subscribe';
      enabled: boolean;
    }
  | {
      type: 'ping';
      t: number;
    };

export type ServerToClientMessage =
  | {
      type: 'welcome';
      playerId: string;
      state: ServerStatePayload;
      leaderboard: LeaderboardEntry[];
    }
  | {
      type: 'state';
      state: ServerStatePayload;
    }
  | {
      type: 'beam';
      beam: LaserBeamEvent;
    }
  | {
      type: 'killfeed';
      event: KillFeedEvent;
    }
  | {
      type: 'hit_confirm';
      victimId: string;
      damage: number;
      isCrit: boolean;
      killed: boolean;
    }
  | {
      type: 'damaged';
      shooterId: string;
      damage: number;
      hp: number;
      from: Vec3;
    }
  | {
      type: 'eliminated';
      killerId: string;
      killerName: string;
      killerGender: Gender;
      killerCountry?: string;
      killerOutfit: OutfitId;
      isCrit: boolean;
      deathCamDurationMs: number;
      respawnDelayMs: number;
    }
  | {
      type: 'match_reward';
      coinsEarned: number;
      totalCoins: number;
      won: boolean;
      isMvp: boolean;
      tags: number;
      bestStreak: number;
      matchMode: MatchMode;
      rankedWins: number;
    }
  | {
      type: 'leaderboard';
      leaderboard: LeaderboardEntry[];
    }
  | {
      type: 'voice:signal';
      fromId: string;
      signal: VoiceSignalData;
    }
  | {
      type: 'voice:peer_left';
      peerId: string;
    }
  | {
      type: 'player_emote';
      playerId: string;
      emote: EmoteId;
      expiresAt: number;
    }
  | {
      type: 'chat';
      message: ChatMessageEvent;
    }
  | {
      type: 'chat_blocked';
      reason: string;
    }
  | {
      type: 'room_error';
      message: string;
    }
  | {
      type: 'monitor_state';
      monitor: MonitorStatePayload;
    }
  | {
      type: 'report_ack';
      targetName: string;
      message: string;
    }
  | {
      type: 'pong';
      t: number;
    };

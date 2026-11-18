import { onAuthStateChanged, type User } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { CharacterSelectScreen } from './components/CharacterSelectScreen';
import { DailyMissionsModal } from './components/DailyMissionsModal';
import { EmoteWheelModal } from './components/EmoteWheelModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FriendsModal } from './components/FriendsModal';
import { GameHud, type DeathCamHudState } from './components/GameHud';
import { InventoryModal } from './components/InventoryModal';
import { LeaderboardModal, type LeaderboardTab } from './components/LeaderboardModal';
import { SplashIntroOverlay } from './components/SplashIntroOverlay';
import { TutorialOverlay } from './components/TutorialOverlay';
import {
  auth,
  claimDailyMissionRewardInProfile,
  loadUserProfile,
  respondToRoomInvite,
  saveDailyMissionsProgressToProfile,
  saveEquippedOutfitToProfile,
  saveEquippedWeaponSkinToProfile,
  saveEquippedWeaponToProfile,
  saveMatchProgressToProfile,
  saveOutfitPurchaseToProfile,
  saveOutfitUpgradeToProfile,
  saveUserProfile,
  saveWeaponPurchaseToProfile,
  saveWeaponSkinPurchaseToProfile,
  sendRoomInvite,
  signInWithGoogle,
  signInWithGoogleIdToken,
  signOutGoogle,
  subscribeToIncomingRoomInvites,
  updateUserPresence,
  type FriendProfileItem,
  type RoomInviteRecord,
  type SavedPlayerProfile,
} from './firebase';
import { ArenaEngine, type WeaponHudState } from './game/ArenaEngine';
import {
  DAILY_MISSIONS,
  applyMatchStatsToDailyMissions,
  createEmptyDailyMissions,
  ensureTodayDailyMissions,
  getDailyMissionById,
  isMissionCompleted,
  type DailyMissionId,
  type DailyMissionsProgress,
} from './shared/dailyMissions';
import { EMOTES, type EmoteId } from './shared/emotes';
import {
  getOutfitById,
  getOutfitLevel,
  getOutfitUpgradeCost,
  type OutfitId,
} from './shared/outfits';
import { getWeaponById, type WeaponId } from './shared/weapons';
import { getWeaponSkinById, type WeaponSkinId } from './shared/weaponSkins';
import type {
  ArenaMapId,
  ChatMessageEvent,
  ClientToServerMessage,
  GamePhase,
  Gender,
  KillFeedEvent,
  LeaderboardEntry,
  MatchMode,
  ServerStatePayload,
  ServerToClientMessage,
  TeamMode,
  Vec3,
  VoiceSignalData,
} from './shared/types';
import { VoiceManager, type VoiceStatus } from './voice/voiceManager';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [webglOk, setWebglOk] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [savedProfile, setSavedProfile] = useState<SavedPlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [myId, setMyId] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [serverState, setServerState] = useState<ServerStatePayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('global');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [incomingInvites, setIncomingInvites] = useState<RoomInviteRecord[]>([]);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [dailyMissions, setDailyMissions] = useState<DailyMissionsProgress>(() =>
    createEmptyDailyMissions(),
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageEvent[]>([]);
  const [chatBlockedReason, setChatBlockedReason] = useState<string | null>(null);
  const [chatFocusSignal, setChatFocusSignal] = useState(0);

  const [muted, setMuted] = useState(false);
  const [killFeed, setKillFeed] = useState<KillFeedEvent[]>([]);
  const [hitMarker, setHitMarker] = useState({ active: false, isCrit: false, killed: false });
  const [damageFlash, setDamageFlash] = useState(false);
  const [deathCam, setDeathCam] = useState<DeathCamHudState | null>(null);
  const [weaponState, setWeaponState] = useState<WeaponHudState>({
    weaponId: 'pulse_carbine',
    isAiming: false,
    ammo: 12,
    maxAmmo: 12,
    isReloading: false,
    reloadProgress: 0,
    sprintEnergy: 100,
    isSprinting: false,
    isSliding: false,
    zone: 'lobby',
  });
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    connected: false,
    room: null,
    micMuted: false,
    deafened: false,
    hasMic: false,
    speaking: false,
    error: null,
  });

  const voiceManagerRef = useRef<VoiceManager | null>(null);
  const hitTimerRef = useRef<number>(0);
  const dmgTimerRef = useRef<number>(0);
  const lastCountdownSecRef = useRef<number>(0);
  const prevPhaseRef = useRef<GamePhase>('lobby');
  const myIdRef = useRef<string | null>(null);
  const authUserRef = useRef<User | null>(null);
  const savedProfileRef = useRef<SavedPlayerProfile | null>(null);
  const dailyMissionsRef = useRef<DailyMissionsProgress>(dailyMissions);
  const pendingInviteFriendRef = useRef<FriendProfileItem | null>(null);
  const autoEnteredUidRef = useRef<string | null>(null);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    savedProfileRef.current = savedProfile;
    if (savedProfile?.dailyMissions) {
      setDailyMissions(ensureTodayDailyMissions(savedProfile.dailyMissions));
    }
  }, [savedProfile]);

  useEffect(() => {
    dailyMissionsRef.current = dailyMissions;
  }, [dailyMissions]);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Fetch initial persistent leaderboard
  useEffect(() => {
    fetch('/api/leaderboard')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for Google Auth state & load saved user profile from Firestore
  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 2500);

    const unsub = onAuthStateChanged(auth, async (user) => {
      window.clearTimeout(fallbackTimer);
      setAuthUser(user);
      setAuthError(null);
      if (!user) {
        setSavedProfile(null);
        setProfileLoading(false);
        setAuthReady(true);
        return;
      }

      setProfileLoading(true);
      try {
        const profile = await loadUserProfile(user.uid);
        setSavedProfile(profile);
      } catch (err) {
        console.error('Error loading profile:', err);
        setAuthError('No se pudo cargar tu perfil guardado de Firebase.');
      } finally {
        setProfileLoading(false);
        setAuthReady(true);
      }
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  // Subscribe to incoming private room invitations from friends
  useEffect(() => {
    if (!authUser || !authUser.emailVerified) {
      setIncomingInvites([]);
      return;
    }
    const unsub = subscribeToIncomingRoomInvites(authUser.uid, (invites) => {
      setIncomingInvites(invites);
    });
    return () => unsub();
  }, [authUser]);

  // Publish live online presence & active room code while authenticated and profile exists
  useEffect(() => {
    if (!authUser || !authUser.emailVerified || !savedProfile) return;
    const status =
      joined && serverState?.phase === 'playing' ? ('in_match' as const) : ('online' as const);
    const roomCode = joined && serverState?.roomCode ? serverState.roomCode : 'PUBLIC';

    void updateUserPresence(authUser.uid, status, roomCode).catch(() => {});
    const timer = window.setInterval(() => {
      void updateUserPresence(authUser.uid, status, roomCode).catch(() => {});
    }, 35_000);
    return () => window.clearInterval(timer);
  }, [authUser, savedProfile, joined, serverState?.phase, serverState?.roomCode]);

  // Monitor WebSocket RTT latency every 2 seconds while connected
  useEffect(() => {
    if (!joined) {
      setPingMs(null);
      return;
    }
    const sendPing = () => {
      sendWs({ type: 'ping', t: performance.now() });
    };
    sendPing();
    const timer = window.setInterval(sendPing, 2000);
    return () => window.clearInterval(timer);
  }, [joined, sendWs]);

  // Mount isolated Three.js canvas once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new ArenaEngine(container, {
      onSendMove: (x, y, z, yaw, pitch, sliding, zone) => {
        sendWs({ type: 'move', x, y, z, yaw, pitch, sliding, zone });
      },
      onSendShoot: (origin: Vec3, dir: Vec3) => {
        sendWs({ type: 'shoot', origin, dir });
      },
      onSendReload: () => {
        sendWs({ type: 'reload' });
      },
      onWeaponStateChange: (nextWeapon) => {
        setWeaponState(nextWeapon);
      },
      onPointerLockChange: () => {},
      onWebGLStatus: (ok) => {
        setWebglOk(ok);
      },
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [sendWs]);

  // Instantiate WebRTC VoiceManager once
  useEffect(() => {
    const vm = new VoiceManager({
      onSendSignal: (targetId: string, signal: VoiceSignalData) => {
        sendWs({ type: 'voice:signal', targetId, signal });
      },
      onSpeakingChange: (speaking: boolean) => {
        sendWs({ type: 'voice:speaking', speaking });
      },
      onStatusChange: (status: VoiceStatus) => {
        setVoiceStatus(status);
      },
    });
    voiceManagerRef.current = vm;

    return () => {
      vm.dispose();
      voiceManagerRef.current = null;
    };
  }, [sendWs]);

  // Sync WebRTC peers when players in the same voice room change
  useEffect(() => {
    if (!serverState || !voiceStatus.connected || !voiceStatus.room) return;
    const peerIds = serverState.players
      .filter((p) => !p.isBot && p.voiceRoom === voiceStatus.room)
      .map((p) => p.id);
    voiceManagerRef.current?.syncPeers(peerIds);
  }, [serverState, voiceStatus.connected, voiceStatus.room]);

  // Countdown audio cues, pointer lock release on results, and clean UI return to lobby
  useEffect(() => {
    if (!serverState) return;
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = serverState.phase;

    if (serverState.phase === 'countdown') {
      const sec = Math.max(1, Math.ceil((serverState.phaseEndsAt - serverState.serverTime) / 1000));
      if (sec !== lastCountdownSecRef.current) {
        lastCountdownSecRef.current = sec;
        soundEngine.playCountdownBeep(false);
      }
    } else if (serverState.phase === 'playing' && lastCountdownSecRef.current > 0) {
      lastCountdownSecRef.current = 0;
      soundEngine.playCountdownBeep(true);
    } else if (serverState.phase === 'results') {
      engineRef.current?.exitPointerLock();
    } else if (serverState.phase === 'lobby' && prevPhase === 'results') {
      lastCountdownSecRef.current = 0;
      setLeaderboardOpen(false);
    }
  }, [serverState]);

  const formatAuthError = (err: unknown): string => {
    const code = (err as { code?: string } | null)?.code || '';
    const msg = err instanceof Error ? err.message : String(err ?? '');
    if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
      return 'La ventana de Google se cerró antes de completar el acceso. Si estás dentro de una vista previa, usa el botón oficial de Google de arriba o abre el juego en una pestaña nueva.';
    }
    if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
      return 'El navegador bloqueó la ventana emergente. Usa el botón oficial de Google de arriba, permite ventanas emergentes o abre el juego en una pestaña nueva.';
    }
    if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
      return `Dominio no autorizado en Firebase (${window.location.hostname}). Usa el botón oficial de Google de arriba o entra en modo invitado.`;
    }
    if (code === 'auth/cancelled-popup-request') {
      return 'Se canceló la solicitud anterior. Intenta iniciar sesión nuevamente.';
    }
    return `No se pudo iniciar sesión con Google (${code || 'error de conexión'}). Prueba con el botón oficial de Google de arriba o abre en una pestaña nueva.`;
  };

  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogleIdToken(idToken);
    } catch (err) {
      console.error('Google GIS credential error:', err);
      setAuthError(formatAuthError(err));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google Popup error:', err);
      setAuthError(formatAuthError(err));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const handleGoogleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      if (authUserRef.current && savedProfileRef.current) {
        await updateUserPresence(authUserRef.current.uid, 'offline', 'PUBLIC').catch(() => {});
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      autoEnteredUidRef.current = null;
      setJoined(false);
      setConnecting(false);
      setServerState(null);
      myIdRef.current = null;
      setMyId(null);
      engineRef.current?.setMode('preview');
      await signOutGoogle();
      setSavedProfile(null);
    } catch {
      setAuthError('No se pudo cerrar la sesión.');
    }
  }, []);

  const handleEnterLobby = useCallback(
    async (
      name: string,
      gender: Gender,
      country?: string,
      options?: { skipTutorial?: boolean },
    ) => {
      const cleanName = name.trim().slice(0, 18) || 'Agente';
      const cleanCountry = country?.trim().toUpperCase() || savedProfileRef.current?.country;
      setConnectError(null);
      setAuthError(null);
      setRoomError(null);

      let activeProfile = savedProfileRef.current;

      if (authUser && authUser.emailVerified && !activeProfile) {
        setSavingProfile(true);
        try {
          const updated = await saveUserProfile(authUser.uid, cleanName, gender, cleanCountry);
          setSavedProfile(updated);
          activeProfile = updated;
        } catch (err) {
          console.error('Failed to save user profile:', err);
          setAuthError('No se pudo guardar tu perfil en Firestore.');
          setSavingProfile(false);
          return;
        }
        setSavingProfile(false);
      }

      setConnecting(true);

      if (wsRef.current) {
        const prevWs = wsRef.current;
        wsRef.current = null;
        prevWs.close();
      }
      myIdRef.current = null;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      let welcomed = false;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'join',
            name: cleanName,
            gender,
            country: cleanCountry,
            coins: activeProfile?.coins ?? 0,
            rankedWins: activeProfile?.rankedWins ?? 0,
            ownedOutfits: activeProfile?.ownedOutfits ?? ['default'],
            equippedOutfit: activeProfile?.equippedOutfit ?? 'default',
            outfitLevels: activeProfile?.outfitLevels ?? { default: 1 },
            ownedWeapons: activeProfile?.ownedWeapons ?? ['pulse_carbine'],
            equippedWeapon: activeProfile?.equippedWeapon ?? 'pulse_carbine',
            ownedWeaponSkins: activeProfile?.ownedWeaponSkins ?? ['default'],
            equippedWeaponSkin: activeProfile?.equippedWeaponSkin ?? 'default',
          } satisfies ClientToServerMessage),
        );
      };

      ws.onmessage = (event) => {
        let msg: ServerToClientMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'welcome') {
          welcomed = true;
          myIdRef.current = msg.playerId;
          setMyId(msg.playerId);
          voiceManagerRef.current?.setMyId(msg.playerId);
          setServerState(msg.state);
          setLeaderboard(msg.leaderboard);
          setDeathCam(null);
          setChatMessages([]);
          setChatBlockedReason(null);
          setJoined(true);
          setConnecting(false);
          if (!options?.skipTutorial) {
            setTutorialOpen(true);
          }
          engineRef.current?.setMode('play');
          engineRef.current?.applyServerState(msg.state, msg.playerId);
        } else if (msg.type === 'state') {
          setServerState(msg.state);
          engineRef.current?.applyServerState(msg.state, myIdRef.current);
          if (msg.state.phase !== 'lobby') {
            setInventoryOpen(false);
          }
          const localMe = msg.state.players.find((p) => p.id === myIdRef.current);
          if (msg.state.phase !== 'playing' || localMe?.alive) {
            setDeathCam(null);
          }
        } else if (msg.type === 'beam') {
          engineRef.current?.spawnBeam(msg.beam);
        } else if (msg.type === 'hit_confirm') {
          soundEngine.playHitConfirm(msg.isCrit);
          engineRef.current?.triggerHitFeel(msg.killed);
          setHitMarker({ active: true, isCrit: msg.isCrit, killed: msg.killed });
          window.clearTimeout(hitTimerRef.current);
          hitTimerRef.current = window.setTimeout(() => {
            setHitMarker({ active: false, isCrit: false, killed: false });
          }, 160);
        } else if (msg.type === 'damaged') {
          engineRef.current?.triggerDamagedFeel();
          setDamageFlash(true);
          window.clearTimeout(dmgTimerRef.current);
          dmgTimerRef.current = window.setTimeout(() => {
            setDamageFlash(false);
          }, 170);
        } else if (msg.type === 'eliminated') {
          engineRef.current?.triggerDeathCam(msg.killerId, msg.deathCamDurationMs);
          setDeathCam({
            killerId: msg.killerId,
            killerName: msg.killerName,
            killerGender: msg.killerGender,
            killerCountry: msg.killerCountry,
            killerOutfit: msg.killerOutfit,
            isCrit: msg.isCrit,
            endsAt: performance.now() + msg.deathCamDurationMs,
            totalMs: msg.deathCamDurationMs,
          });
        } else if (msg.type === 'match_reward') {
          const user = authUserRef.current;
          const nextMissions = applyMatchStatsToDailyMissions(dailyMissionsRef.current, {
            tags: msg.tags,
            won: msg.won,
            bestStreak: msg.bestStreak,
          });
          setDailyMissions(nextMissions);
          if (user && user.emailVerified) {
            void saveMatchProgressToProfile(
              user.uid,
              msg.totalCoins,
              msg.matchMode === 'ranked' ? msg.rankedWins : undefined,
              msg.coinsEarned,
            ).catch((err) => {
              console.error('Failed to persist match progress:', err);
            });
            void saveDailyMissionsProgressToProfile(user.uid, nextMissions).catch((err) => {
              console.error('Failed to persist daily missions:', err);
            });
          }
          setSavedProfile((prev) =>
            prev
              ? {
                  ...prev,
                  coins: msg.totalCoins,
                  rankedWins: msg.rankedWins,
                  dailyMissions: nextMissions,
                }
              : prev,
          );
        } else if (msg.type === 'killfeed') {
          setKillFeed((prev) => [msg.event, ...prev].slice(0, 6));
        } else if (msg.type === 'leaderboard') {
          setLeaderboard(msg.leaderboard);
        } else if (msg.type === 'player_emote') {
          engineRef.current?.applyRemoteEmote(
            msg.playerId,
            msg.emote,
            Math.max(500, msg.expiresAt - Date.now()),
          );
        } else if (msg.type === 'chat') {
          setChatMessages((prev) => [...prev, msg.message].slice(-40));
          setChatBlockedReason(null);
        } else if (msg.type === 'chat_blocked') {
          setChatBlockedReason(msg.reason);
        } else if (msg.type === 'room_error') {
          setRoomError(msg.message);
        } else if (msg.type === 'voice:signal') {
          voiceManagerRef.current?.handleSignal(msg.fromId, msg.signal);
        } else if (msg.type === 'voice:peer_left') {
          voiceManagerRef.current?.removePeer(msg.peerId);
        } else if (msg.type === 'pong') {
          const rtt = Math.max(1, Math.round(performance.now() - msg.t));
          setPingMs(rtt);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        if (!welcomed) {
          setConnecting(false);
          setConnectError('No se pudo conectar con el servidor multijugador.');
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        voiceManagerRef.current?.leaveRoom();
        setPingMs(null);
        myIdRef.current = null;
        setMyId(null);
        if (!welcomed) {
          setConnecting(false);
          setConnectError('Conexión cerrada antes de entrar al lobby.');
        } else {
          setJoined(false);
          setServerState(null);
          setConnecting(false);
          setConnectError('Se perdió la conexión con el servidor. Vuelve a entrar.');
          engineRef.current?.setMode('preview');
        }
      };
    },
    [authUser],
  );

  // Keep latest myId in ref for ws.onmessage closure
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  // Automatically enter Lobby once splash finishes if user already has a saved Google account
  useEffect(() => {
    if (
      !splashDone ||
      !authReady ||
      profileLoading ||
      !authUser ||
      !savedProfile ||
      joined ||
      connecting ||
      connectError
    ) {
      return;
    }
    if (autoEnteredUidRef.current === authUser.uid) return;
    autoEnteredUidRef.current = authUser.uid;
    void handleEnterLobby(savedProfile.playerName, savedProfile.gender, savedProfile.country, {
      skipTutorial: true,
    });
  }, [
    splashDone,
    authReady,
    profileLoading,
    authUser,
    savedProfile,
    joined,
    connecting,
    connectError,
    handleEnterLobby,
  ]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Global keyboard shortcuts inside Lobby & Match
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!joined) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (
        e.code === 'Enter' &&
        serverState?.phase === 'lobby' &&
        !leaderboardOpen &&
        !inventoryOpen &&
        !missionsOpen &&
        !tutorialOpen &&
        !friendsOpen &&
        !emoteOpen
      ) {
        e.preventDefault();
        sendWs({ type: 'start_match' });
        engineRef.current?.requestPointerLock();
      } else if (e.code === 'KeyT' && serverState?.phase !== 'results') {
        e.preventDefault();
        engineRef.current?.exitPointerLock();
        setChatFocusSignal((n) => n + 1);
      } else if (e.code === 'KeyG') {
        e.preventDefault();
        setEmoteOpen((open) => {
          const next = !open;
          if (next) engineRef.current?.exitPointerLock();
          return next;
        });
      } else if (
        ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code) &&
        !leaderboardOpen &&
        !inventoryOpen &&
        !missionsOpen &&
        !tutorialOpen &&
        !friendsOpen &&
        !emoteOpen
      ) {
        const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
        const emoteDef = EMOTES[idx];
        if (emoteDef) {
          e.preventDefault();
          sendWs({ type: 'emote', emote: emoteDef.id });
        }
      } else if (e.code === 'KeyI' && serverState?.phase === 'lobby') {
        e.preventDefault();
        engineRef.current?.exitPointerLock();
        setInventoryOpen((open) => !open);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        engineRef.current?.exitPointerLock();
        setLeaderboardTab(serverState?.phase === 'playing' ? 'live' : 'global');
        setLeaderboardOpen((open) => !open);
      } else if (e.code === 'KeyM' && voiceStatus.connected) {
        e.preventDefault();
        voiceManagerRef.current?.toggleMicMute();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    joined,
    serverState?.phase,
    leaderboardOpen,
    inventoryOpen,
    missionsOpen,
    tutorialOpen,
    friendsOpen,
    emoteOpen,
    voiceStatus.connected,
    sendWs,
  ]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleJoinVoiceRoom = useCallback(
    async (room: string) => {
      const clean = room.trim().toLowerCase().slice(0, 24) || 'amigos';
      await voiceManagerRef.current?.joinRoom(clean);
      sendWs({ type: 'voice:join', room: clean });
    },
    [sendWs],
  );

  const handleLeaveVoiceRoom = useCallback(() => {
    voiceManagerRef.current?.leaveRoom();
    sendWs({ type: 'voice:leave' });
  }, [sendWs]);

  const handleToggleMicMute = useCallback(() => {
    voiceManagerRef.current?.toggleMicMute();
  }, []);

  const handleToggleDeafen = useCallback(() => {
    voiceManagerRef.current?.toggleDeafen();
  }, []);

  const handleStartMatch = useCallback(() => {
    sendWs({ type: 'start_match' });
    engineRef.current?.requestPointerLock();
  }, [sendWs]);

  const handleReturnLobby = useCallback(() => {
    sendWs({ type: 'return_lobby' });
  }, [sendWs]);

  const handleToggleBots = useCallback(() => {
    sendWs({ type: 'toggle_bots', enabled: !(serverState?.botsEnabled ?? true) });
  }, [sendWs, serverState?.botsEnabled]);

  const handleVoteMap = useCallback(
    (mapId: ArenaMapId) => {
      sendWs({ type: 'vote_map', mapId });
    },
    [sendWs],
  );

  const handleOpenInventory = useCallback(() => {
    engineRef.current?.exitPointerLock();
    setInventoryOpen(true);
  }, []);

  const handleBuyOutfit = useCallback(
    (outfitId: OutfitId) => {
      const outfit = getOutfitById(outfitId);
      const me = serverState?.players.find((p) => p.id === myId);
      const currentCoins = me?.coins ?? savedProfileRef.current?.coins ?? 0;
      const currentOwned = me?.ownedOutfits ?? savedProfileRef.current?.ownedOutfits ?? ['default'];
      const currentLevels = me?.outfitLevels ?? savedProfileRef.current?.outfitLevels ?? { default: 1 };
      if (currentOwned.includes(outfitId) || currentCoins < outfit.price) return;

      const nextCoins = currentCoins - outfit.price;
      const nextOwned = [...currentOwned, outfitId];
      const nextLevels = { ...currentLevels, [outfitId]: currentLevels[outfitId] ?? 1 };
      sendWs({ type: 'buy_outfit', outfitId });

      if (authUserRef.current?.emailVerified) {
        void saveOutfitPurchaseToProfile(
          authUserRef.current.uid,
          nextCoins,
          nextOwned,
          outfitId,
          nextLevels,
        ).catch((err) => {
          console.error('Failed to persist suit purchase:', err);
        });
      }
      setSavedProfile((prev) =>
        prev
          ? {
              ...prev,
              coins: nextCoins,
              ownedOutfits: nextOwned,
              equippedOutfit: outfitId,
              outfitLevels: nextLevels,
            }
          : prev,
      );
    },
    [myId, sendWs, serverState?.players],
  );

  const handleEquipOutfit = useCallback(
    (outfitId: OutfitId) => {
      const me = serverState?.players.find((p) => p.id === myId);
      const currentOwned = me?.ownedOutfits ?? savedProfileRef.current?.ownedOutfits ?? ['default'];
      if (!currentOwned.includes(outfitId)) return;

      sendWs({ type: 'equip_outfit', outfitId });

      if (authUserRef.current?.emailVerified) {
        void saveEquippedOutfitToProfile(authUserRef.current.uid, outfitId).catch((err) => {
          console.error('Failed to persist equipped suit:', err);
        });
      }
      setSavedProfile((prev) => (prev ? { ...prev, equippedOutfit: outfitId } : prev));
    },
    [myId, sendWs, serverState?.players],
  );

  const handleUpgradeOutfit = useCallback(
    (outfitId: OutfitId) => {
      const me = serverState?.players.find((p) => p.id === myId);
      const currentCoins = me?.coins ?? savedProfileRef.current?.coins ?? 0;
      const currentOwned = me?.ownedOutfits ?? savedProfileRef.current?.ownedOutfits ?? ['default'];
      const currentLevels =
        me?.outfitLevels ?? savedProfileRef.current?.outfitLevels ?? { default: 1 };
      if (!currentOwned.includes(outfitId)) return;

      const currentLvl = getOutfitLevel(currentLevels, outfitId);
      const cost = getOutfitUpgradeCost(currentLvl);
      if (cost === null || currentCoins < cost) return;

      const nextCoins = currentCoins - cost;
      const nextLevels = { ...currentLevels, [outfitId]: currentLvl + 1 };
      sendWs({ type: 'upgrade_outfit', outfitId });

      if (authUserRef.current?.emailVerified) {
        void saveOutfitUpgradeToProfile(
          authUserRef.current.uid,
          nextCoins,
          nextLevels,
          currentOwned,
        ).catch((err) => {
          console.error('Failed to persist suit upgrade:', err);
        });
      }
      setSavedProfile((prev) =>
        prev ? { ...prev, coins: nextCoins, outfitLevels: nextLevels } : prev,
      );
    },
    [myId, sendWs, serverState?.players],
  );

  const handleBuyWeapon = useCallback(
    (weaponId: WeaponId) => {
      const weapon = getWeaponById(weaponId);
      const me = serverState?.players.find((p) => p.id === myId);
      const currentCoins = me?.coins ?? savedProfileRef.current?.coins ?? 0;
      const currentOwned =
        me?.ownedWeapons ?? savedProfileRef.current?.ownedWeapons ?? ['pulse_carbine'];
      if (currentOwned.includes(weaponId) || currentCoins < weapon.price) return;

      const nextCoins = currentCoins - weapon.price;
      const nextOwned = [...currentOwned, weaponId];
      sendWs({ type: 'buy_weapon', weaponId });

      if (authUserRef.current?.emailVerified) {
        void saveWeaponPurchaseToProfile(
          authUserRef.current.uid,
          nextCoins,
          nextOwned,
          weaponId,
        ).catch((err) => {
          console.error('Failed to persist weapon purchase:', err);
        });
      }
      setSavedProfile((prev) =>
        prev
          ? {
              ...prev,
              coins: nextCoins,
              ownedWeapons: nextOwned,
              equippedWeapon: weaponId,
            }
          : prev,
      );
    },
    [myId, sendWs, serverState?.players],
  );

  const handleEquipWeapon = useCallback(
    (weaponId: WeaponId) => {
      const me = serverState?.players.find((p) => p.id === myId);
      const currentOwned =
        me?.ownedWeapons ?? savedProfileRef.current?.ownedWeapons ?? ['pulse_carbine'];
      if (!currentOwned.includes(weaponId)) return;

      sendWs({ type: 'equip_weapon', weaponId });

      if (authUserRef.current?.emailVerified) {
        void saveEquippedWeaponToProfile(authUserRef.current.uid, weaponId).catch((err) => {
          console.error('Failed to persist equipped weapon:', err);
        });
      }
      setSavedProfile((prev) => (prev ? { ...prev, equippedWeapon: weaponId } : prev));
    },
    [myId, sendWs, serverState?.players],
  );

  const handleBuyWeaponSkin = useCallback(
    (skinId: WeaponSkinId) => {
      const skin = getWeaponSkinById(skinId);
      const me = serverState?.players.find((p) => p.id === myId);
      const currentCoins = me?.coins ?? savedProfileRef.current?.coins ?? 0;
      const currentOwned =
        me?.ownedWeaponSkins ?? savedProfileRef.current?.ownedWeaponSkins ?? ['default'];
      if (currentOwned.includes(skinId) || currentCoins < skin.price) return;

      const nextCoins = currentCoins - skin.price;
      const nextOwned = [...currentOwned, skinId];
      sendWs({ type: 'buy_weapon_skin', skinId });

      if (authUserRef.current?.emailVerified) {
        void saveWeaponSkinPurchaseToProfile(
          authUserRef.current.uid,
          nextCoins,
          nextOwned,
          skinId,
        ).catch((err) => {
          console.error('Failed to persist weapon skin purchase:', err);
        });
      }
      setSavedProfile((prev) =>
        prev
          ? {
              ...prev,
              coins: nextCoins,
              ownedWeaponSkins: nextOwned,
              equippedWeaponSkin: skinId,
            }
          : prev,
      );
    },
    [myId, sendWs, serverState?.players],
  );

  const handleEquipWeaponSkin = useCallback(
    (skinId: WeaponSkinId) => {
      const me = serverState?.players.find((p) => p.id === myId);
      const currentOwned =
        me?.ownedWeaponSkins ?? savedProfileRef.current?.ownedWeaponSkins ?? ['default'];
      if (!currentOwned.includes(skinId)) return;

      sendWs({ type: 'equip_weapon_skin', skinId });

      if (authUserRef.current?.emailVerified) {
        void saveEquippedWeaponSkinToProfile(authUserRef.current.uid, skinId).catch((err) => {
          console.error('Failed to persist equipped weapon skin:', err);
        });
      }
      setSavedProfile((prev) => (prev ? { ...prev, equippedWeaponSkin: skinId } : prev));
    },
    [myId, sendWs, serverState?.players],
  );

  const handleTriggerEmote = useCallback(
    (emote: EmoteId) => {
      sendWs({ type: 'emote', emote });
    },
    [sendWs],
  );

  const handleOpenEmotes = useCallback(() => {
    engineRef.current?.exitPointerLock();
    setEmoteOpen(true);
  }, []);

  const handleOpenFriends = useCallback(() => {
    engineRef.current?.exitPointerLock();
    setFriendsOpen(true);
  }, []);

  const handleOpenMissions = useCallback(() => {
    engineRef.current?.exitPointerLock();
    setMissionsOpen(true);
  }, []);

  const handleOpenTutorial = useCallback(() => {
    engineRef.current?.exitPointerLock();
    setTutorialOpen(true);
  }, []);

  const handleToggleTeamMode = useCallback(
    (teamMode: TeamMode) => {
      sendWs({ type: 'toggle_team_mode', teamMode });
    },
    [sendWs],
  );

  const handleToggleMatchMode = useCallback(
    (matchMode: MatchMode) => {
      sendWs({ type: 'toggle_match_mode', matchMode });
    },
    [sendWs],
  );

  const handleSendChat = useCallback(
    (text: string) => {
      setChatBlockedReason(null);
      sendWs({ type: 'chat', text });
    },
    [sendWs],
  );

  const handleClaimMissionReward = useCallback(
    (missionId: DailyMissionId) => {
      const def = getDailyMissionById(missionId);
      const currentProgress = ensureTodayDailyMissions(dailyMissionsRef.current);
      if (
        !isMissionCompleted(def, currentProgress) ||
        currentProgress.claimedIds.includes(missionId)
      ) {
        return;
      }

      const me = serverState?.players.find((p) => p.id === myId);
      const currentCoins = me?.coins ?? savedProfileRef.current?.coins ?? 0;
      const nextCoins = Math.min(1_000_000, currentCoins + def.rewardCoins);
      const nextProgress: DailyMissionsProgress = {
        ...currentProgress,
        claimedIds: [...currentProgress.claimedIds, missionId],
      };

      setDailyMissions(nextProgress);
      sendWs({ type: 'claim_mission_reward', missionId });

      if (authUserRef.current?.emailVerified) {
        void claimDailyMissionRewardInProfile(
          authUserRef.current.uid,
          nextCoins,
          nextProgress,
        ).catch((err) => {
          console.error('Failed to persist daily mission reward:', err);
        });
      }
      setSavedProfile((prev) =>
        prev ? { ...prev, coins: nextCoins, dailyMissions: nextProgress } : prev,
      );
    },
    [myId, sendWs, serverState?.players],
  );

  const handleCreatePrivateRoom = useCallback(() => {
    setRoomError(null);
    sendWs({ type: 'create_private_room' });
  }, [sendWs]);

  const handleJoinRoom = useCallback(
    (roomCode: string) => {
      setRoomError(null);
      sendWs({ type: 'join_room', roomCode });
    },
    [sendWs],
  );

  const handleLeavePrivateRoom = useCallback(() => {
    setRoomError(null);
    sendWs({ type: 'leave_private_room' });
  }, [sendWs]);

  const mePlayer = serverState?.players.find((p) => p.id === myId) ?? null;
  const claimableMissionsCount = DAILY_MISSIONS.filter(
    (m) => isMissionCompleted(m, dailyMissions) && !dailyMissions.claimedIds.includes(m.id),
  ).length;

  // Flush queued friend invite right after creating a private room on the server
  useEffect(() => {
    const pending = pendingInviteFriendRef.current;
    if (
      !pending ||
      !serverState?.isPrivateRoom ||
      !serverState.roomCode ||
      serverState.roomCode === 'PUBLIC' ||
      !authUser ||
      !authUser.emailVerified
    ) {
      return;
    }
    pendingInviteFriendRef.current = null;
    void sendRoomInvite({
      fromUid: authUser.uid,
      fromName: savedProfileRef.current?.playerName || mePlayer?.name || 'Agente',
      fromCountry: savedProfileRef.current?.country || mePlayer?.country,
      toUid: pending.uid,
      toName: pending.playerName,
      roomCode: serverState.roomCode,
    }).catch((err) => {
      console.error('Failed to send queued room invite:', err);
    });
  }, [
    serverState?.isPrivateRoom,
    serverState?.roomCode,
    authUser,
    mePlayer?.name,
    mePlayer?.country,
  ]);

  const handleInviteFriend = useCallback(
    async (friend: FriendProfileItem) => {
      const user = authUserRef.current;
      if (!user || !user.emailVerified) return;

      if (serverState?.isPrivateRoom && serverState.roomCode && serverState.roomCode !== 'PUBLIC') {
        await sendRoomInvite({
          fromUid: user.uid,
          fromName: savedProfileRef.current?.playerName || mePlayer?.name || 'Agente',
          fromCountry: savedProfileRef.current?.country || mePlayer?.country,
          toUid: friend.uid,
          toName: friend.playerName,
          roomCode: serverState.roomCode,
        });
      } else {
        pendingInviteFriendRef.current = friend;
        setRoomError(null);
        sendWs({ type: 'create_private_room' });
      }
    },
    [serverState?.isPrivateRoom, serverState?.roomCode, mePlayer?.name, mePlayer?.country, sendWs],
  );

  const handleAcceptInvite = useCallback(
    async (invite: RoomInviteRecord) => {
      setRoomError(null);
      sendWs({ type: 'join_room', roomCode: invite.roomCode });
      setFriendsOpen(false);
      await respondToRoomInvite(invite.id, 'accepted').catch((err) => {
        console.error('Failed to mark invite accepted:', err);
      });
    },
    [sendWs],
  );

  const handleDeclineInvite = useCallback(async (invite: RoomInviteRecord) => {
    await respondToRoomInvite(invite.id, 'declined').catch((err) => {
      console.error('Failed to mark invite declined:', err);
    });
  }, []);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative h-screen w-screen overflow-hidden bg-[#080C14]">
        {/* Isolated Three.js WebGL Mount */}
        <div ref={canvasMountRef} className="fixed inset-0 h-full w-full" />

        {!webglOk && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#080C14] p-6 text-center">
            <div className="max-w-md rounded-xl border border-slate-700 bg-[#0D1422] p-6">
              <h2 className="font-display text-xl font-bold text-white">
                WebGL no disponible
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Tu navegador o entorno gráfico suspendió el contexto 3D. Recarga la página o activa la aceleración por hardware.
              </p>
            </div>
          </div>
        )}

        {!joined ? (
          <CharacterSelectScreen
            authReady={authReady}
            authUser={authUser}
            savedProfile={savedProfile}
            profileLoading={profileLoading}
            signingIn={signingIn}
            savingProfile={savingProfile}
            authError={authError}
            onGoogleCredential={handleGoogleCredential}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onEnterLobby={handleEnterLobby}
            connecting={connecting}
            errorMsg={connectError}
            leaderboard={leaderboard}
            onOpenLeaderboard={() => {
              setLeaderboardTab('global');
              setLeaderboardOpen(true);
            }}
            muted={muted}
            onToggleMute={handleToggleMute}
          />
        ) : (
          serverState && (
            <GameHud
              state={serverState}
              myId={myId}
              pingMs={pingMs}
              hitMarker={hitMarker}
              damageFlash={damageFlash}
              deathCam={deathCam}
              weaponState={weaponState}
              killFeed={killFeed}
              muted={muted}
              voiceStatus={voiceStatus}
              roomError={roomError}
              incomingInvites={incomingInvites}
              chatMessages={chatMessages}
              chatBlockedReason={chatBlockedReason}
              chatFocusSignal={chatFocusSignal}
              claimableMissionsCount={claimableMissionsCount}
              onJoinVoiceRoom={handleJoinVoiceRoom}
              onLeaveVoiceRoom={handleLeaveVoiceRoom}
              onToggleMicMute={handleToggleMicMute}
              onToggleDeafen={handleToggleDeafen}
              onToggleMute={handleToggleMute}
              onStartMatch={handleStartMatch}
              onReturnLobby={handleReturnLobby}
              onToggleBots={handleToggleBots}
              onToggleTeamMode={handleToggleTeamMode}
              onToggleMatchMode={handleToggleMatchMode}
              onVoteMap={handleVoteMap}
              onOpenInventory={handleOpenInventory}
              onOpenMissions={handleOpenMissions}
              onOpenTutorial={handleOpenTutorial}
              onOpenFriends={handleOpenFriends}
              onAcceptInvite={handleAcceptInvite}
              onDeclineInvite={handleDeclineInvite}
              onOpenEmotes={handleOpenEmotes}
              onTriggerEmote={handleTriggerEmote}
              onCreatePrivateRoom={handleCreatePrivateRoom}
              onJoinRoom={handleJoinRoom}
              onLeavePrivateRoom={handleLeavePrivateRoom}
              onClearRoomError={() => setRoomError(null)}
              onSendChat={handleSendChat}
              onClearChatBlocked={() => setChatBlockedReason(null)}
              onReload={() => engineRef.current?.triggerReload()}
              onOpenLeaderboard={(tab) => {
                engineRef.current?.exitPointerLock();
                setLeaderboardTab(tab);
                setLeaderboardOpen(true);
              }}
              onSignOut={authUser ? handleGoogleSignOut : undefined}
            />
          )
        )}

        <SplashIntroOverlay open={!splashDone} onComplete={handleSplashComplete} />

        <TutorialOverlay open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

        <DailyMissionsModal
          open={missionsOpen}
          onClose={() => setMissionsOpen(false)}
          progress={dailyMissions}
          coins={mePlayer?.coins ?? savedProfile?.coins ?? 0}
          onClaimReward={handleClaimMissionReward}
        />

        <EmoteWheelModal
          open={emoteOpen}
          onClose={() => setEmoteOpen(false)}
          onSelectEmote={handleTriggerEmote}
        />

        <InventoryModal
          open={inventoryOpen}
          onClose={() => setInventoryOpen(false)}
          coins={mePlayer?.coins ?? savedProfile?.coins ?? 0}
          gender={mePlayer?.gender ?? savedProfile?.gender ?? 'male'}
          playerName={mePlayer?.name ?? savedProfile?.playerName ?? 'Agente'}
          accentColor={mePlayer?.accentColor ?? '#06B6D4'}
          ownedOutfits={mePlayer?.ownedOutfits ?? savedProfile?.ownedOutfits ?? ['default']}
          equippedOutfit={mePlayer?.equippedOutfit ?? savedProfile?.equippedOutfit ?? 'default'}
          outfitLevels={
            mePlayer?.outfitLevels ?? savedProfile?.outfitLevels ?? { default: 1 }
          }
          ownedWeapons={
            mePlayer?.ownedWeapons ?? savedProfile?.ownedWeapons ?? ['pulse_carbine']
          }
          equippedWeapon={
            mePlayer?.equippedWeapon ?? savedProfile?.equippedWeapon ?? 'pulse_carbine'
          }
          ownedWeaponSkins={
            mePlayer?.ownedWeaponSkins ?? savedProfile?.ownedWeaponSkins ?? ['default']
          }
          equippedWeaponSkin={
            mePlayer?.equippedWeaponSkin ?? savedProfile?.equippedWeaponSkin ?? 'default'
          }
          onBuyOutfit={handleBuyOutfit}
          onEquipOutfit={handleEquipOutfit}
          onUpgradeOutfit={handleUpgradeOutfit}
          onBuyWeapon={handleBuyWeapon}
          onEquipWeapon={handleEquipWeapon}
          onBuyWeaponSkin={handleBuyWeaponSkin}
          onEquipWeaponSkin={handleEquipWeaponSkin}
        />

        <FriendsModal
          open={friendsOpen}
          onClose={() => setFriendsOpen(false)}
          isSignedIn={Boolean(authUser && authUser.emailVerified)}
          myUid={authUser?.uid ?? null}
          isPrivateRoom={Boolean(serverState?.isPrivateRoom)}
          currentRoomCode={serverState?.roomCode ?? 'PUBLIC'}
          incomingInvites={incomingInvites}
          onInviteFriend={handleInviteFriend}
          onAcceptInvite={handleAcceptInvite}
          onDeclineInvite={handleDeclineInvite}
        />

        <LeaderboardModal
          open={leaderboardOpen}
          onClose={() => setLeaderboardOpen(false)}
          globalEntries={leaderboard}
          livePlayers={serverState?.players ?? []}
          myRankedWins={mePlayer?.rankedWins ?? savedProfile?.rankedWins ?? 0}
          initialTab={leaderboardTab}
          onTabChange={setLeaderboardTab}
        />
      </div>
    </ErrorBoundary>
  );
}

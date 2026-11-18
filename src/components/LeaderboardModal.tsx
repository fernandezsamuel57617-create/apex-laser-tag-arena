import { Shield, Trophy, X } from 'lucide-react';
import { countryCodeToFlag } from '../shared/countries';
import { RANK_TIERS, getNextRankProgress, getRankByWins } from '../shared/ranks';
import type { LeaderboardEntry, PlayerSnapshot } from '../shared/types';
import { RankBadge, RankEmblemSvg } from './RankBadge';

export const GENDER_PORTRAIT: Record<'male' | 'female', string> = {
  male: '/assets/aistudio/Captura_de_pantalla_2026-11-16_161406_5e3ea922.png',
  female: '/assets/aistudio/Captura_de_pantalla_2026-11-16_161605_65709189.png',
};

export type LeaderboardTab = 'global' | 'live' | 'ranked';

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  globalEntries: LeaderboardEntry[];
  livePlayers?: PlayerSnapshot[];
  myRankedWins?: number;
  initialTab?: LeaderboardTab;
  onTabChange?: (tab: LeaderboardTab) => void;
}

export function LeaderboardModal({
  open,
  onClose,
  globalEntries,
  livePlayers = [],
  myRankedWins = 0,
  initialTab = 'global',
  onTabChange,
}: LeaderboardModalProps) {
  if (!open) return null;

  const sortedLive = [...livePlayers].sort((a, b) => b.score - a.score || b.tags - a.tags);
  const maxKills = sortedLive.reduce((max, p) => Math.max(max, p.tags), 0);
  const mvpPlayerId =
    maxKills > 0
      ? ([...sortedLive].sort((a, b) => b.tags - a.tags || b.score - a.score)[0]?.id ?? null)
      : null;

  const showLive = initialTab === 'live' && livePlayers.length > 0;
  const showRanked = initialTab === 'ranked';
  const sortedRanked = [...globalEntries].sort(
    (a, b) =>
      (b.rankedWins ?? 0) - (a.rankedWins ?? 0) ||
      b.wins - a.wins ||
      b.totalScore - a.totalScore,
  );
  const myProgress = getNextRankProgress(myRankedWins);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060911]/88 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-700/80 bg-[#0D1320] shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            {showRanked ? (
              <Shield className="h-5 w-5 text-amber-400" />
            ) : (
              <Trophy className="h-5 w-5 text-amber-400" />
            )}
            <h2 className="font-display text-xl font-bold tracking-wide text-slate-50">
              {showRanked ? 'Clasificatoria · Rangos' : 'Tabla de Líderes'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {onTabChange && (
              <div className="flex items-center rounded-lg bg-slate-900 p-1 border border-slate-800">
                {livePlayers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onTabChange('live')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showLive
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Partida Actual
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onTabChange('global')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !showLive && !showRanked
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Ranking Global
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('ranked')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showRanked
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Rangos
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar tabla de líderes"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[68vh] overflow-y-auto p-6">
          {showRanked ? (
            <div className="space-y-5">
              {/* Personal Ranked Progress Card */}
              <div className="rounded-xl border border-amber-400/40 bg-[#0A101D] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
                      <RankEmblemSvg tierId={myProgress.current.id} size={28} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Tu Rango Clasificatorio
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-display text-lg font-bold ${myProgress.current.textClass}`}>
                          {myProgress.current.name}
                        </span>
                        <span className="font-mono-tab text-xs text-slate-300">
                          ({myRankedWins} {myRankedWins === 1 ? 'victoria' : 'victorias'} en Rangos)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-300">
                    {myProgress.next ? (
                      <>
                        Siguiente: <strong className={myProgress.next.textClass}>{myProgress.next.name}</strong>
                        <div className="font-mono-tab text-[11px] text-amber-300">
                          Faltan {myProgress.winsNeededForNext} victorias
                        </div>
                      </>
                    ) : (
                      <span className="font-display font-bold text-purple-300">
                        Rango Máximo Alcanzado
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${myProgress.pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  Solo las partidas ganadas en el <strong className="text-amber-300">Modo Rangos</strong> aumentan tu nivel de rango.
                </p>
              </div>

              {/* 5 Rank Tiers Legend */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {RANK_TIERS.map((tier) => {
                  const active = myProgress.current.id === tier.id;
                  return (
                    <div
                      key={tier.id}
                      className={`rounded-lg border p-2.5 text-center ${
                        active ? tier.badgeClass : 'border-slate-800 bg-slate-900/60'
                      }`}
                    >
                      <div className="flex justify-center">
                        <RankEmblemSvg tierId={tier.id} size={22} />
                      </div>
                      <div className={`mt-1 font-display text-xs font-bold ${tier.textClass}`}>
                        {tier.name}
                      </div>
                      <div className="font-mono-tab text-[10px] text-slate-400">
                        {tier.minWins}+ vic.
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ranked Leaderboard Table */}
              {sortedRanked.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  Aún no hay jugadores clasificados. Activa el Modo Rangos en el Lobby para comenzar tu ascenso.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                      <th className="pb-3 pr-3">#</th>
                      <th className="pb-3 pr-3">Agente</th>
                      <th className="pb-3 pr-3">Rango</th>
                      <th className="pb-3 pr-3 text-right">Victorias Rangos</th>
                      <th className="pb-3 pr-3 text-right">Tags</th>
                      <th className="pb-3 text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-sm">
                    {sortedRanked.map((entry, idx) => {
                      const rankedWins = entry.rankedWins ?? 0;
                      const tier = getRankByWins(rankedWins);
                      return (
                        <tr key={entry.id} className="hover:bg-slate-800/35 transition-colors">
                          <td className="py-3 pr-3 font-mono-tab font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={GENDER_PORTRAIT[entry.gender]}
                                alt={entry.name}
                                referrerPolicy="no-referrer"
                                className="h-9 w-9 rounded-md object-cover object-top bg-slate-800 border border-slate-700"
                              />
                              <div>
                                <div className="font-semibold text-slate-100">{entry.name}</div>
                                <div className="text-xs text-slate-400">
                                  {entry.gender === 'male' ? 'Hombre' : 'Mujer'} · {entry.matchesPlayed}{' '}
                                  {entry.matchesPlayed === 1 ? 'partida' : 'partidas'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <RankBadge rankedWins={rankedWins} showLabel size="sm" />
                          </td>
                          <td className={`py-3 pr-3 text-right font-mono-tab font-bold ${tier.textClass}`}>
                            {rankedWins}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono-tab text-cyan-300">
                            {entry.totalTags}
                          </td>
                          <td className="py-3 text-right font-mono-tab font-bold text-white">
                            {entry.totalScore}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : showLive ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                  <th className="pb-3 pr-3">#</th>
                  <th className="pb-3 pr-3">Agente</th>
                  <th className="pb-3 pr-3 text-right">Tags</th>
                  <th className="pb-3 pr-3 text-right">Bajas</th>
                  <th className="pb-3 pr-3 text-right">Mejor Racha</th>
                  <th className="pb-3 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {sortedLive.map((p, idx) => {
                  const isMvp = p.id === mvpPlayerId;
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isMvp ? 'bg-amber-500/10 hover:bg-amber-500/15' : 'hover:bg-slate-800/35'
                      }`}
                    >
                      <td className="py-3 pr-3 font-mono-tab font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={GENDER_PORTRAIT[p.gender]}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className={`h-9 w-9 rounded-md object-cover object-top bg-slate-800 border ${
                              isMvp ? 'border-amber-400' : 'border-slate-700'
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <RankBadge rankedWins={p.rankedWins ?? 0} size="sm" />
                              <span className="font-semibold text-slate-100">
                                {p.country ? `${countryCodeToFlag(p.country)} ` : ''}
                                {p.name}
                              </span>
                              {isMvp && (
                                <span className="rounded border border-amber-400/70 bg-amber-400/20 px-1.5 py-0.5 font-display text-[10px] font-bold tracking-wider text-amber-300">
                                  MVP
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {p.gender === 'male' ? 'Hombre' : 'Mujer'}
                              {p.isBot ? ' · Dron' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono-tab text-cyan-300 font-semibold">
                        {p.tags}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono-tab text-slate-400">
                        {p.deaths}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono-tab text-amber-300">
                        {p.bestStreak}
                      </td>
                      <td className="py-3 text-right font-mono-tab font-bold text-white">
                        {p.score}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : globalEntries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-display text-lg font-semibold text-slate-200">
                Aún no hay partidas registradas
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Completa una partida en la arena para registrar tu puntuación en el ranking global.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                  <th className="pb-3 pr-3">#</th>
                  <th className="pb-3 pr-3">Agente</th>
                  <th className="pb-3 pr-3 text-right">Victorias</th>
                  <th className="pb-3 pr-3 text-right">Tags</th>
                  <th className="pb-3 pr-3 text-right">Mejor Racha</th>
                  <th className="pb-3 text-right">Puntos Totales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {globalEntries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-800/35 transition-colors">
                    <td
                      className={`py-3 pr-3 font-mono-tab font-bold ${
                        idx === 0
                          ? 'text-amber-400'
                          : idx === 1
                            ? 'text-slate-200'
                            : idx === 2
                              ? 'text-amber-600'
                              : 'text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={GENDER_PORTRAIT[entry.gender]}
                          alt={entry.name}
                          referrerPolicy="no-referrer"
                          className="h-9 w-9 rounded-md object-cover object-top bg-slate-800 border border-slate-700"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <RankBadge rankedWins={entry.rankedWins ?? 0} size="xs" />
                            <span className="font-semibold text-slate-100">{entry.name}</span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {entry.gender === 'male' ? 'Hombre' : 'Mujer'} · {entry.matchesPlayed}{' '}
                            {entry.matchesPlayed === 1 ? 'partida' : 'partidas'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono-tab text-emerald-400 font-semibold">
                      {entry.wins}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono-tab text-cyan-300">
                      {entry.totalTags}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono-tab text-amber-300">
                      {entry.bestStreak}
                    </td>
                    <td className="py-3 text-right font-mono-tab font-bold text-white">
                      {entry.totalScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

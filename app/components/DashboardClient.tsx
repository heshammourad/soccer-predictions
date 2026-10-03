'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getFlagUrl } from '../lib/simulator/config/confederations';
import { getFifaCode } from '../lib/fifaCodes';
import { TOURNAMENTS, finalMilestoneIfOver, getTournament } from '../lib/tournaments';
import SearchInput from './SearchInput';
import { isNewResult, teamResults, TeamResult } from '../lib/teamResults';
import TeamResultsTooltip, { formatRatingChange, ratingChangeStyle, UpsetIcon } from './TeamResultsTooltip';
import Sparkline, { SparklinePoint } from './Sparkline';
import OddsBar from './OddsBar';
import { fixtureOdds, isBigSwing, preMatchOdds, upsetWinner } from '../lib/matchOdds';

interface Team {
  id: string;
  name: string;
  currentElo: number;
}

interface Prediction {
  id: number;
  teamId: string;
  tournament: string;
  milestone: string;
  probability: number;
  // Proven from the real results as of the run's cutoff; null while open.
  certainty: 'CERTAIN' | 'IMPOSSIBLE' | null;
  eloAtSimulation: number;
  updatedAt: Date;
  team: Team;
}

interface Match {
  id: number;
  tournament: string;
  date: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  isKnockout: boolean;
  location: string | null;
  // The home team's rating gain, as published by eloratings.net.
  ratingChange: number;
  // When the sync first recorded the score (null if unplayed, or recorded
  // before that was tracked).
  resultSyncedAt: string | null;
  homeTeam: Team;
  awayTeam: Team;
}

interface SimulationRun {
  id: number;
  tournament: string;
  createdAt: string;
  description: string;
  predictions: Prediction[];
}

interface Props {
  activeTournament: string;
  simulationRuns: SimulationRun[];
  results: Match[];
  fixtures: Match[];
  teamGroups: { [teamId: string]: string };
  // Start of the latest successful sync (null if none recorded yet).
  lastSyncStartedAt: string | null;
}

// One row per team for the active SimulationRun, pivoted from the flat
// (team, milestone, probability) Prediction rows into a single record with
// a lookup by milestone name.
interface TeamRow {
  teamId: string;
  team: Team;
  group: string | null;
  eloAtSimulation: number;
  updatedAt: Date;
  values: { [milestone: string]: number };
  certainty: { [milestone: string]: 'CERTAIN' | 'IMPOSSIBLE' | null };
}

type SortColumn = string; // 'team' | 'group' | 'elo' | a milestone name

type Certainty = 'CERTAIN' | 'IMPOSSIBLE' | null;

// 100% and "—" are kept for outcomes proven from the real results; a
// simulated 1 or 0 that isn't proven shows as >99% or <1%, since it only
// means nothing else came up in the simulation.
function effectiveProbability(val: number, certainty: Certainty | undefined): number {
  if (certainty === 'IMPOSSIBLE') return 0.0;
  if (certainty === 'CERTAIN') return 1.0;
  return Math.max(0.0001, Math.min(0.9999, val));
}

function formatEffectiveProbability(eff: number): string {
  if (eff === 0.0) return '—';
  if (eff === 1.0) return '100%';
  if (eff <= 0.005) return '<1%';
  if (eff >= 0.995) return '>99%';
  return `${Math.round(eff * 100)}%`;
}

const percent = (p: number) => `${Math.round(p * 100)}%`;

export default function DashboardClient({ activeTournament, simulationRuns, results, fixtures, teamGroups, lastSyncStartedAt }: Props) {
  const router = useRouter();
  const tournament = getTournament(activeTournament) ?? TOURNAMENTS[0];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'projections' | 'matches'>('projections');
  // Once every dated milestone has passed and the final one has been simulated,
  // the live "Current Projections" run adds nothing (it would only repeat the
  // final result), so it is hidden and the final run is the default.
  const finalMilestone = finalMilestoneIfOver(tournament);
  const completedRun = finalMilestone
    ? simulationRuns.find(run => run.description === finalMilestone)
    : undefined;
  const visibleRuns = completedRun
    ? simulationRuns.filter(run => run.description !== 'Current Projections')
    : simulationRuns;
  const [selectedRunId, setSelectedRunId] = useState<number | null>(() => {
    if (completedRun) return completedRun.id;
    const currentRun = simulationRuns.find(run => run.description === 'Current Projections');
    if (currentRun) return currentRun.id;
    return simulationRuns.length > 0 ? simulationRuns[simulationRuns.length - 1].id : null;
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const sortMilestones = tournament.defaultSortMilestones ?? [...tournament.milestones].reverse();
  const championsMilestone = sortMilestones[0];
  // The milestone the trend column plots; the headline one by default.
  const [trendMilestone, setTrendMilestone] = useState<string>(championsMilestone);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(col);
      setSortDir(col === 'team' || col === 'group' ? 'asc' : 'desc');
    }
  };

  const activeRun = simulationRuns.find(run => run.id === selectedRunId);

  // Pivot this run's flat Prediction rows into one row per team
  const teamRows: TeamRow[] = React.useMemo(() => {
    if (!activeRun) return [];
    const rowsByTeam = new Map<string, TeamRow>();
    activeRun.predictions.forEach((p) => {
      let row = rowsByTeam.get(p.teamId);
      if (!row) {
        row = {
          teamId: p.teamId,
          team: p.team,
          group: teamGroups[p.teamId] ?? null,
          eloAtSimulation: p.eloAtSimulation,
          updatedAt: p.updatedAt,
          values: {},
          certainty: {},
        };
        rowsByTeam.set(p.teamId, row);
      }
      row.values[p.milestone] = p.probability;
      row.certainty[p.milestone] = p.certainty ?? null;
    });
    return Array.from(rowsByTeam.values());
  }, [activeRun, teamGroups]);

  const handleTournamentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    router.push(`/tournament/${val}`);
  };

  // Extract unique group letters
  const groupsList = Array.from(new Set(teamRows.map((r) => r.group).filter(Boolean))) as string[];
  groupsList.sort();

  // Filter predictions
  const filteredRows = teamRows.filter((r) => {
    const matchesSearch = r.team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.teamId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroup === 'ALL' || r.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const activeRunDescription = activeRun?.description || 'Current Projections';
  const cutOffDateStr = tournament.milestoneDates[activeRunDescription];
  const cutOffDate = cutOffDateStr ? new Date(cutOffDateStr) : undefined;

  // Dynamically filter results and fixtures based on the active run's historical date
  const activeResults = results.filter((m) => {
    if (m.homeGoals === null) return false;
    if (cutOffDate) return new Date(m.date) <= cutOffDate;
    return true;
  });

  const activeFixtures = fixtures.concat(results).filter((m) => {
    if (cutOffDate) return new Date(m.date) > cutOffDate;
    return m.homeGoals === null;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // A team's rating as of this run's cutoff (what the run simulated from), for
  // the fixtures' odds; the current rating if the run doesn't have the team.
  const runElo: { [teamId: string]: number } = {};
  activeRun?.predictions.forEach((p) => (runElo[p.teamId] = p.eloAtSimulation));
  const ratingAtCutoff = (team: Team) => runElo[team.id] || team.currentElo;

  // Newest first, so the latest results are on top of the results list.
  const resultsNewestFirst = [...activeResults].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Each team's results as of this run's cutoff, for the tooltip on its name,
  // and whether the latest sync brought one in (the dot next to it).
  const resultsByTeam: { [teamId: string]: TeamResult[] } = {};
  teamRows.forEach((r) => {
    resultsByTeam[r.teamId] = teamResults(r.teamId, activeResults, tournament.milestoneDates, lastSyncStartedAt);
  });
  const hasNewResults = teamRows.some((r) => resultsByTeam[r.teamId].some((m) => m.isNew));

  // Still in the group/league phase if there are unplayed non-knockout
  // fixtures as of this run's cutoff — true for every tournament shape,
  // since it doesn't depend on this tournament's specific milestone names.
  const isGroupStage = activeFixtures.some(f => !f.isKnockout);

  const certaintyByTeam: { [teamId: string]: TeamRow['certainty'] } = {};
  teamRows.forEach((r) => (certaintyByTeam[r.teamId] = r.certainty));

  // A team whose headline outcome (e.g. the title) is proven out of reach.
  const isEliminatedMap: { [teamId: string]: boolean } = {};
  teamRows.forEach((r) => {
    isEliminatedMap[r.teamId] =
      tournament.dimEliminatedTeams !== false && r.certainty[championsMilestone] === 'IMPOSSIBLE';
  });

  // Points (3 / 1 / 0) and games played from this run's completed group-phase
  // matches, shown under each team's name to explain a projection.
  const groupRecord: { [teamId: string]: { pts: number; pld: number } } = {};
  activeResults.forEach((m) => {
    if (m.isKnockout || m.homeGoals === null || m.awayGoals === null) return;
    const home = (groupRecord[m.homeTeamId] ??= { pts: 0, pld: 0 });
    const away = (groupRecord[m.awayTeamId] ??= { pts: 0, pld: 0 });
    home.pld++;
    away.pld++;
    if (m.homeGoals > m.awayGoals) home.pts += 3;
    else if (m.homeGoals < m.awayGoals) away.pts += 3;
    else {
      home.pts++;
      away.pts++;
    }
  });

  const getEffectiveProbability = (val: number, teamId: string, col: SortColumn) =>
    effectiveProbability(val, certaintyByTeam[teamId]?.[col]);

  const formatProbability = (val: number, teamId: string, col: SortColumn) =>
    formatEffectiveProbability(getEffectiveProbability(val, teamId, col));

  // Sort predictions based on whether it is group stage or knockout stage
  const sortedRows = React.useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      // If user has selected a sort column, use that
      if (sortColumn) {
        let cmp = 0;
        if (sortColumn === 'team') {
          cmp = a.team.name.localeCompare(b.team.name);
        } else if (sortColumn === 'group') {
          cmp = (a.group || '').localeCompare(b.group || '') ||
                (getEffectiveProbability(b.values[championsMilestone] ?? 0, b.teamId, championsMilestone) -
                 getEffectiveProbability(a.values[championsMilestone] ?? 0, a.teamId, championsMilestone));
        } else if (sortColumn === 'elo') {
          cmp = a.team.currentElo - b.team.currentElo;
        } else {
          cmp = getEffectiveProbability(a.values[sortColumn] ?? 0, a.teamId, sortColumn) -
                getEffectiveProbability(b.values[sortColumn] ?? 0, b.teamId, sortColumn);
        }
        return sortDir === 'desc' ? -cmp : cmp;
      }

      // Default: group stage → group first, then success metrics
      if (isGroupStage) {
        const groupA = a.group || '';
        const groupB = b.group || '';
        if (groupA !== groupB) {
          return groupA.localeCompare(groupB);
        }
      }
      // Sort by success metrics descending using effective probabilities,
      // from the last (biggest) milestone down to the first.
      for (const milestone of sortMilestones) {
        const diff =
          getEffectiveProbability(b.values[milestone] ?? 0, b.teamId, milestone) -
          getEffectiveProbability(a.values[milestone] ?? 0, a.teamId, milestone);
        if (diff !== 0) return diff;
      }
      return b.team.currentElo - a.team.currentElo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, sortColumn, sortDir, isGroupStage, tournament]);

  // Helper to calculate cell background style: a white-to-colour gradient
  // overlay, green for outcomes worth having and red for negative ones
  // (relegation).
  const getCellBgStyle = (val: number, text: string, teamId?: string, milestone?: string) => {
    if (text === '—') return {};
    if (teamId && isEliminatedMap[teamId]) return {}; // Suppress cell background coloring for eliminated teams
    const effectiveVal = text === '<1%' ? 0.005 : (text === '100%' ? 1.0 : (text === '>99%' ? 0.9999 : val));
    const isNegative = milestone !== undefined && tournament.negativeMilestones?.includes(milestone) === true;
    // Linearly interpolate rgb color between white (255, 255, 255) and Green (34, 197, 94) or Red (248, 105, 107)
    const [tr, tg, tb] = isNegative ? [248, 105, 107] : [34, 197, 94];
    const r = Math.round(255 - (255 - tr) * effectiveVal);
    const g = Math.round(255 - (255 - tg) * effectiveVal);
    const b = Math.round(255 - (255 - tb) * effectiveVal);
    return {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      color: '#020617', // high contrast dark text color for readability
    };
  };

  // The runs in milestone order (the live "Current Projections" last), for
  // each team's trend line in the chosen milestone.
  const trendRuns = [...visibleRuns].sort(
    (a, b) =>
      (tournament.milestoneDates[a.description] ? new Date(tournament.milestoneDates[a.description]!).getTime() : Infinity) -
        (tournament.milestoneDates[b.description] ? new Date(tournament.milestoneDates[b.description]!).getTime() : Infinity) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const showTrend = trendRuns.length >= 2;
  const trendActiveIndex = trendRuns.findIndex((run) => run.id === selectedRunId);
  const trendPoints: { [teamId: string]: SparklinePoint[] } = {};
  trendRuns.forEach((run, i) => {
    run.predictions.forEach((p) => {
      if (p.milestone !== trendMilestone) return;
      const eff = effectiveProbability(p.probability, p.certainty);
      (trendPoints[p.teamId] ??= trendRuns.map((r) => ({ label: r.description, text: 'n/a', value: null })))[i] = {
        label: run.description,
        text: formatEffectiveProbability(eff),
        value: eff,
      };
    });
  });
  // One y-scale for every team, topped at the highest value any team reached,
  // so small chances still show movement but rows stay comparable.
  const trendMax = Math.max(0, ...Object.values(trendPoints).flatMap((ps) => ps.map((p) => p.value ?? 0)));

  // Columns to render: team/group/elo, then this tournament's milestones
  // (group-phase milestone hidden once we're past the group stage).
  const visibleMilestones = tournament.milestones.filter((m) => {
    if (tournament.groupPhaseMilestone && m === tournament.groupPhaseMilestone) {
      return isGroupStage || tournament.keepGroupPhaseMilestoneAfterGroupStage === true;
    }
    return true;
  });
  const columns: SortColumn[] = ['team', ...(isGroupStage ? ['group'] : []), 'elo', ...(showTrend ? ['trend'] : []), ...visibleMilestones];
  const columnLabels: Record<string, string> = {
    team: 'Team',
    group: 'Group',
    elo: 'ELO',
    ...tournament.milestoneLabels,
  };
  const milestoneLabel = (m: string) => tournament.milestoneLabels[m] ?? m;

  return (
    <div className="space-y-8">
      {/* Simulation Summary */}
      <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl backdrop-blur-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Monte Carlo Projections</h2>
          <p className="text-sm text-slate-400">
            {teamRows.length > 0
              ? `Based on 10,000 simulation runs. Last updated: ${new Date(
                  teamRows[0].updatedAt
                ).toLocaleString()}`
              : 'No simulation data found in database yet.'}
          </p>
        </div>
        {/* Format rules, so the milestone columns (e.g. auto promotion vs
            promotion) make sense without knowing the competition. */}
        <div className="pt-4 border-t border-slate-800">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">How it works</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300 marker:text-slate-600">
            {tournament.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('projections')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition duration-150 ${
            activeTab === 'projections'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Tournament Projections
        </button>
        <button
          onClick={() => setActiveTab('matches')}
          className={`px-6 py-3 font-medium text-sm border-b-2 transition duration-150 ${
            activeTab === 'matches'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Match Schedule & Results
        </button>
      </div>

      {/* Tab Contents: Projections */}
      {activeTab === 'projections' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col gap-6">
            {/* Top Row: Search & Dropdowns */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
              <SearchInput
                className="flex-1"
                placeholder="Search teams..."
                value={searchTerm}
                onChange={setSearchTerm}
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <select
                    value={activeTournament}
                    onChange={handleTournamentChange}
                    className="w-full sm:w-56 px-4 pr-10 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none cursor-pointer"
                  >
                    {TOURNAMENTS.map(({ code, name }) => (
                      <option key={code} value={code} className="bg-slate-950 text-slate-300">
                        {name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div className="relative">
                  <select
                    value={selectedRunId || ''}
                    onChange={(e) => setSelectedRunId(Number(e.target.value))}
                    className="w-full sm:w-64 px-4 pr-10 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none cursor-pointer font-semibold font-sans"
                  >
                    {visibleRuns.map((run) => (
                      <option key={run.id} value={run.id} className="bg-slate-950 text-slate-300 font-sans">
                        {run.description}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400 font-sans">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {showTrend && (
                  <div className="relative">
                    <select
                      value={trendMilestone}
                      onChange={(e) => setTrendMilestone(e.target.value)}
                      aria-label="Milestone the trend column shows"
                      className="w-full sm:w-56 px-4 pr-10 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 text-sm appearance-none cursor-pointer"
                    >
                      {tournament.milestones.map((m) => (
                        <option key={m} value={m} className="bg-slate-950 text-slate-300">
                          Trend: {milestoneLabel(m)}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Bottom Row: Group Selector */}
            <div className="flex gap-2 items-center overflow-x-auto pb-4 border-b border-slate-900/40">
              <button
                onClick={() => setSelectedGroup('ALL')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition shrink-0 ${
                  selectedGroup === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                All Groups
              </button>
              {groupsList.map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGroup(g)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition shrink-0 ${
                    selectedGroup === g
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Group {g}
                </button>
              ))}
            </div>
          </div>

          {activeResults.length > 0 && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              {hasNewResults && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <span className="mr-2">New result since the last update.</span>
                </>
              )}
              <span>Hover or tap a team to see its results.</span>
            </p>
          )}

          {teamRows.length === 0 ? (
            <div className="text-center p-12 bg-slate-900/20 border border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-base mb-4">No prediction records found in NeonDB.</p>
              <p className="text-sm text-slate-500">Run the simulation above to calculate predictions!</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-900/10 backdrop-blur-xl">
              <table className={`w-full text-left border-collapse ${showTrend ? 'min-w-[1020px]' : 'min-w-[900px]'}`}>
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                    {columns.map(col => {
                      if (col === 'trend') {
                        return (
                          <th key={col} className="py-4 px-4 text-center whitespace-nowrap">
                            Trend
                            <div className="mt-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500">
                              {milestoneLabel(trendMilestone)}
                            </div>
                          </th>
                        );
                      }
                      const isSorted = sortColumn === col;
                      const arrow = isSorted ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
                      const isTeam = col === 'team';
                      return (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className={`py-4 ${isTeam ? 'px-5 text-left' : 'px-4 text-center w-28'} cursor-pointer hover:text-slate-200 transition whitespace-nowrap ${isSorted ? 'text-indigo-400' : ''}`}
                        >
                          {columnLabels[col] ?? col}{arrow}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                  {sortedRows.map((r) => {
                    const isEliminated = isEliminatedMap[r.teamId];

                    return (
                      <tr key={r.teamId} className={`hover:bg-slate-900/30 transition ${isEliminated ? 'opacity-35 grayscale text-slate-500 font-normal' : ''}`}>
                        <td className="py-3 px-5 font-semibold text-slate-100">
                          <TeamResultsTooltip teamName={r.team.name} results={resultsByTeam[r.teamId]}>
                            {/* Flags vary in aspect ratio; a fixed-width box keeps the names aligned. */}
                            <span className="flex w-[26px] shrink-0 justify-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={getFlagUrl(r.teamId)}
                                alt={`${r.team.name} flag`}
                                className="h-4 w-auto max-w-full rounded-sm shadow-sm border border-slate-850"
                                loading="lazy"
                              />
                            </span>
                            <span className="flex flex-col leading-tight">
                              <span className="flex items-center gap-1.5">
                                <span className={isEliminated ? 'text-slate-500 line-through decoration-slate-600/45' : ''}>
                                  {r.team.name}
                                </span>
                                {resultsByTeam[r.teamId].some((m) => m.isNew) && (
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400"
                                    role="img"
                                    aria-label="New result since the last update"
                                  />
                                )}
                              </span>
                              {isGroupStage && groupRecord[r.teamId] && (
                                <span className="text-[11px] font-normal text-slate-500">
                                  {groupRecord[r.teamId].pts} pts · {groupRecord[r.teamId].pld} pld
                                </span>
                              )}
                            </span>
                          </TeamResultsTooltip>
                        </td>
                        {isGroupStage && (
                          <td className="py-3 px-4 text-center font-bold text-slate-400">
                            {r.group}
                          </td>
                        )}
                        <td className="py-3 px-4 text-center font-bold font-mono text-slate-400">
                          {r.eloAtSimulation || r.team.currentElo}
                        </td>
                        {showTrend && (
                          <td className="py-2 px-4">
                            {trendPoints[r.teamId] && (
                              <Sparkline points={trendPoints[r.teamId]} max={trendMax} activeIndex={trendActiveIndex} />
                            )}
                          </td>
                        )}
                        {visibleMilestones.map((milestone) => {
                          const val = r.values[milestone] ?? 0;
                          // A team with no group (e.g. CONCACAF League A's four
                          // seeds) can't win one, so the cell doesn't apply.
                          const noGroup = milestone === tournament.groupPhaseMilestone && !r.group;
                          const txt = noGroup ? '—' : formatProbability(val, r.teamId, milestone);
                          const isChampions = milestone === championsMilestone;
                          return (
                            <td
                              key={milestone}
                              className={`py-3 px-4 text-center font-mono ${isChampions ? 'font-bold' : 'font-semibold'}`}
                              style={getCellBgStyle(val, txt, r.teamId, milestone)}
                            >
                              {txt}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Contents: Matches */}
      {activeTab === 'matches' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Completed Results */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              Recent Match Results ({activeResults.length})
            </h3>
            {activeResults.length === 0 ? (
              <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/10 text-slate-500 text-sm">
                No completed match results found in database.
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {resultsNewestFirst.map((m) => {
                  const odds = preMatchOdds(m);
                  const upset = upsetWinner(m, odds);
                  const bigSwing = isBigSwing(m.ratingChange, m.tournament);
                  const homeName = m.homeTeam?.name || m.homeTeamId;
                  const awayName = m.awayTeam?.name || m.awayTeamId;
                  return (
                    <div key={m.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded-xl flex justify-between items-center text-sm">
                      <div className="flex-1 flex items-center justify-end gap-2 pr-4 font-semibold text-slate-200">
                        <span className={`text-[11px] font-mono ${ratingChangeStyle(m.ratingChange, bigSwing)}`}>
                          {formatRatingChange(m.ratingChange)}
                        </span>
                        <abbr title={homeName} className="no-underline">{getFifaCode(m.homeTeamId)}</abbr>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getFlagUrl(m.homeTeamId)}
                          alt={`${m.homeTeam?.name || m.homeTeamId} flag`}
                          className="h-3.5 w-auto max-w-[22px] rounded-sm shadow-sm border border-slate-800"
                          loading="lazy"
                        />
                      </div>
                      <div
                        className="flex items-center gap-3 bg-slate-900/80 px-4 py-1.5 rounded-lg font-mono font-bold text-slate-100 border border-slate-800"
                        title={odds ? `Before the match: ${homeName} ${percent(odds.homeWin)} · draw ${percent(odds.draw)} · ${awayName} ${percent(odds.awayWin)}` : undefined}
                      >
                        <span>{m.homeGoals}</span>
                        <span className="text-slate-600">:</span>
                        <span>{m.awayGoals}</span>
                      </div>
                      <div className="flex-1 flex items-center justify-start gap-2 pl-4 font-semibold text-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getFlagUrl(m.awayTeamId)}
                          alt={`${m.awayTeam?.name || m.awayTeamId} flag`}
                          className="h-3.5 w-auto max-w-[22px] rounded-sm shadow-sm border border-slate-800"
                          loading="lazy"
                        />
                        <abbr title={awayName} className="no-underline">{getFifaCode(m.awayTeamId)}</abbr>
                        <span className={`text-[11px] font-mono ${ratingChangeStyle(-m.ratingChange, bigSwing)}`}>
                          {formatRatingChange(-m.ratingChange)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 pl-4 w-28 flex flex-col items-end gap-1 font-mono">
                        <span className="flex items-center gap-1.5">
                          {isNewResult(m, lastSyncStartedAt) && (
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" role="img" aria-label="New result since the last update" />
                          )}
                          {new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                        {upset && odds && (
                          <span
                            className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-sans font-semibold text-amber-400"
                            title={`${upset === 'home' ? homeName : awayName} had a ${percent(upset === 'home' ? odds.homeWin : odds.awayWin)} chance to win`}
                          >
                            <UpsetIcon className="h-2.5 w-2.5" />
                            Upset · {percent(upset === 'home' ? odds.homeWin : odds.awayWin)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Fixtures */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              Upcoming Fixtures ({activeFixtures.length})
            </h3>
            {activeFixtures.length === 0 ? (
              <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/10 text-slate-500 text-sm">
                No upcoming fixtures scheduled.
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {activeFixtures.map((m) => {
                  const homeName = m.homeTeam?.name || m.homeTeamId;
                  const awayName = m.awayTeam?.name || m.awayTeamId;
                  return (
                    <div key={m.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded-xl text-sm">
                      <div className="flex justify-between items-center">
                        <div className="flex-1 flex items-center justify-end gap-2 pr-4 font-medium text-slate-300">
                          <abbr title={homeName} className="no-underline">{getFifaCode(m.homeTeamId)}</abbr>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getFlagUrl(m.homeTeamId)}
                            alt={`${m.homeTeam?.name || m.homeTeamId} flag`}
                            className="h-3.5 w-auto max-w-[22px] rounded-sm shadow-sm border border-slate-800"
                            loading="lazy"
                          />
                        </div>
                        <div className="px-3 py-1 bg-slate-800 text-slate-400 font-mono text-xs rounded border border-slate-800 uppercase tracking-wider font-semibold">
                          VS
                        </div>
                        <div className="flex-1 flex items-center justify-start gap-2 pl-4 font-medium text-slate-300">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getFlagUrl(m.awayTeamId)}
                            alt={`${m.awayTeam?.name || m.awayTeamId} flag`}
                            className="h-3.5 w-auto max-w-[22px] rounded-sm shadow-sm border border-slate-800"
                            loading="lazy"
                          />
                          <abbr title={awayName} className="no-underline">{getFifaCode(m.awayTeamId)}</abbr>
                        </div>
                        <div className="text-[11px] text-indigo-400 pl-4 w-28 text-right font-mono font-semibold">
                          {new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div className="mt-3">
                        <OddsBar
                          odds={fixtureOdds(ratingAtCutoff(m.homeTeam), ratingAtCutoff(m.awayTeam), m)}
                          homeName={homeName}
                          awayName={awayName}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

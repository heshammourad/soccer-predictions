'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerSimulation } from '../actions/simulate';
import { getFlagUrl } from '../lib/simulator/config/confederations';
import { TOURNAMENTS, getTournament } from '../lib/tournaments';

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
}

type SortColumn = string; // 'team' | 'group' | 'elo' | a milestone name

export default function DashboardClient({ activeTournament, simulationRuns, results, fixtures, teamGroups }: Props) {
  const router = useRouter();
  const tournament = getTournament(activeTournament) ?? TOURNAMENTS[0];
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'projections' | 'matches'>('projections');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(() => {
    const currentRun = simulationRuns.find(run => run.description === 'Current Projections');
    if (currentRun) return currentRun.id;
    return simulationRuns.length > 0 ? simulationRuns[simulationRuns.length - 1].id : null;
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(col);
      setSortDir(col === 'team' || col === 'group' ? 'asc' : 'desc');
    }
  };

  const activeRun = simulationRuns.find(run => run.id === selectedRunId);
  const [isPending, startTransition] = useTransition();
  const [simMessage, setSimMessage] = useState('');

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
        };
        rowsByTeam.set(p.teamId, row);
      }
      row.values[p.milestone] = p.probability;
    });
    return Array.from(rowsByTeam.values());
  }, [activeRun, teamGroups]);

  const handleTournamentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    router.push(`/tournament/${val}`);
  };

  const handleSimulate = () => {
    setSimMessage('Simulating 10,000 tournaments on the server... this takes 5-10 seconds.');
    startTransition(async () => {
      const res = await triggerSimulation(activeTournament);
      if (res.success) {
        setSimMessage('Simulation completed! Projections updated.');
        setTimeout(() => setSimMessage(''), 5000);
      } else {
        setSimMessage(`Error: ${res.error || 'Failed to simulate'}`);
      }
    });
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

  // Still in the group/league phase if there are unplayed non-knockout
  // fixtures as of this run's cutoff — true for every tournament shape,
  // since it doesn't depend on this tournament's specific milestone names.
  const isGroupStage = activeFixtures.some(f => !f.isKnockout);

  const knockoutStages = tournament.knockoutStages;

  const getTargetStageKey = () => {
    // Find the earliest knockout stage that's still undecided (fractional)
    // for at least one team in this run — that's the "current" stage.
    for (const stage of knockoutStages) {
      const hasFractional = teamRows.some((r) => {
        const val = r.values[stage];
        return val !== undefined && val > 0 && val < 1;
      });
      if (hasFractional) {
        return stage;
      }
    }
    return knockoutStages[knockoutStages.length - 1];
  };

  const simpleTeams = React.useMemo(() => {
    return teamRows.map((r) => ({
      id: r.teamId,
      name: r.team.name,
      group: r.group,
    }));
  }, [teamRows]);

  const mathStatus = React.useMemo(() => {
    if (teamRows.length === 0) {
      return {
        guaranteedProgress: new Set<string>(),
        mathematicallyEliminated: new Set<string>(),
        guaranteedWinGroup: new Set<string>(),
        eliminatedWinGroup: new Set<string>(),
      };
    }

    if (isGroupStage) {
      return tournament.calculateMathStatus(
        simpleTeams,
        activeResults.map(m => ({
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          isKnockout: m.isKnockout,
        })),
        activeFixtures.map(m => ({
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          isKnockout: m.isKnockout,
        }))
      );
    } else {
      const targetStageKey = getTargetStageKey();
      const guaranteedProgress = new Set<string>();
      const mathematicallyEliminated = new Set<string>();

      teamRows.forEach((r) => {
        const val = r.values[targetStageKey];
        if (val === 1.0) {
          guaranteedProgress.add(r.teamId);
        } else if (val === 0.0) {
          mathematicallyEliminated.add(r.teamId);
        }
      });

      return {
        guaranteedProgress,
        mathematicallyEliminated,
        guaranteedWinGroup: new Set<string>(),
        eliminatedWinGroup: new Set<string>(),
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamRows, isGroupStage, activeResults, activeFixtures, activeRunDescription, simpleTeams, tournament]);

  const isEliminatedMap: { [teamId: string]: boolean } = {};
  teamRows.forEach((r) => {
    isEliminatedMap[r.teamId] = mathStatus.mathematicallyEliminated.has(r.teamId);
  });

  const getEffectiveProbability = (val: number, teamId: string, col: SortColumn) => {
    let isGuaranteed = false;
    let isEliminated = false;

    if (tournament.groupPhaseMilestone && col === tournament.groupPhaseMilestone) {
      if (isGroupStage) {
        isGuaranteed = mathStatus.guaranteedWinGroup.has(teamId);
        isEliminated = mathStatus.eliminatedWinGroup.has(teamId);
      } else {
        isGuaranteed = val === 1.0;
        isEliminated = val === 0.0;
      }
    } else if (knockoutStages.includes(col)) {
      const targetStageKey = getTargetStageKey();
      const targetIndex = knockoutStages.indexOf(targetStageKey);
      const colIndex = knockoutStages.indexOf(col);

      if (colIndex >= targetIndex) {
        isEliminated = mathStatus.mathematicallyEliminated.has(teamId);
        if (colIndex === targetIndex) {
          isGuaranteed = mathStatus.guaranteedProgress.has(teamId);
        }
      } else {
        isGuaranteed = val > 0.5;
        isEliminated = val <= 0.5;
      }
    }

    if (isEliminated) return 0.0;
    if (isGuaranteed) return 1.0;

    if (val === 0.0) return 0.0001;
    if (val === 1.0) return 0.9999;

    return Math.max(0.0001, Math.min(0.9999, val));
  };

  const formatProbability = (val: number, teamId: string, col: SortColumn) => {
    const eff = getEffectiveProbability(val, teamId, col);
    if (eff === 0.0) return '—';
    if (eff === 1.0) return '100%';
    if (eff <= 0.005) return '<1%';
    if (eff >= 0.995) return '>99%';
    return `${Math.round(eff * 100)}%`;
  };

  const championsMilestone = tournament.milestones[tournament.milestones.length - 1];

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
      for (let i = tournament.milestones.length - 1; i >= 0; i--) {
        const milestone = tournament.milestones[i];
        const diff =
          getEffectiveProbability(b.values[milestone] ?? 0, b.teamId, milestone) -
          getEffectiveProbability(a.values[milestone] ?? 0, a.teamId, milestone);
        if (diff !== 0) return diff;
      }
      return b.team.currentElo - a.team.currentElo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, sortColumn, sortDir, isGroupStage, mathStatus, tournament]);

  // Helper to calculate cell background style (green-white gradient overlay)
  const getCellBgStyle = (val: number, text: string, teamId?: string) => {
    if (text === '—') return {};
    if (teamId && isEliminatedMap[teamId]) return {}; // Suppress cell background coloring for eliminated teams
    const effectiveVal = text === '<1%' ? 0.005 : (text === '100%' ? 1.0 : (text === '>99%' ? 0.9999 : val));
    // Linearly interpolate rgb color between white (255, 255, 255) and Green (34, 197, 94)
    const r = Math.round(255 - (255 - 34) * effectiveVal);
    const g = Math.round(255 - (255 - 197) * effectiveVal);
    const b = Math.round(255 - (255 - 94) * effectiveVal);
    return {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      color: '#020617', // high contrast dark text color for readability
    };
  };

  // Columns to render: team/group/elo, then this tournament's milestones
  // (group-phase milestone hidden once we're past the group stage).
  const visibleMilestones = tournament.milestones.filter((m) => {
    if (tournament.groupPhaseMilestone && m === tournament.groupPhaseMilestone) return isGroupStage;
    return true;
  });
  const columns: SortColumn[] = ['team', ...(isGroupStage ? ['group'] : []), 'elo', ...visibleMilestones];
  const columnLabels: Record<string, string> = {
    team: 'Team',
    group: 'Group',
    elo: 'ELO',
    ...tournament.milestoneLabels,
  };

  return (
    <div className="space-y-8">
      {/* Simulation Controls & Notification */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-6 bg-slate-900/40 border border-slate-800 rounded-2xl backdrop-blur-xl gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Monte Carlo Projections</h2>
          <p className="text-sm text-slate-400">
            {teamRows.length > 0
              ? `Based on 10,000 simulation runs. Last updated: ${new Date(
                  teamRows[0].updatedAt
                ).toLocaleString()}`
              : 'No simulation data found in database. Please run the simulation.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {simMessage && (
            <span className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 px-4 py-2 rounded-xl text-center">
              {simMessage}
            </span>
          )}
          <button
            onClick={handleSimulate}
            disabled={isPending}
            className={`px-6 py-3 font-semibold text-white rounded-xl shadow-lg transition duration-200 text-center ${
              isPending
                ? 'bg-indigo-700/60 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20 hover:scale-[1.02]'
            }`}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Simulating...
              </span>
            ) : (
              'Run 10,000 Simulations'
            )}
          </button>
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
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
                <svg
                  className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
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
                    {simulationRuns.map((run) => (
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

          {teamRows.length === 0 ? (
            <div className="text-center p-12 bg-slate-900/20 border border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-base mb-4">No prediction records found in NeonDB.</p>
              <p className="text-sm text-slate-500">Run the simulation above to calculate predictions!</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-900/10 backdrop-blur-xl">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                    {columns.map(col => {
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
                        <td className="py-3 px-5 font-semibold text-slate-100 flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getFlagUrl(r.teamId)}
                            alt={`${r.team.name} flag`}
                            className="h-4 w-auto max-w-[26px] rounded-sm shadow-sm border border-slate-850"
                            loading="lazy"
                          />
                          <span className={isEliminated ? 'text-slate-500 line-through decoration-slate-600/45' : ''}>
                            {r.team.name}
                          </span>
                        </td>
                        {isGroupStage && (
                          <td className="py-3 px-4 text-center font-bold text-slate-400">
                            {r.group}
                          </td>
                        )}
                        <td className="py-3 px-4 text-center font-bold font-mono text-slate-400">
                          {r.eloAtSimulation || r.team.currentElo}
                        </td>
                        {visibleMilestones.map((milestone) => {
                          const val = r.values[milestone] ?? 0;
                          const txt = formatProbability(val, r.teamId, milestone);
                          const isChampions = milestone === championsMilestone;
                          return (
                            <td
                              key={milestone}
                              className={`py-3 px-4 text-center font-mono ${isChampions ? 'font-bold' : 'font-semibold'}`}
                              style={getCellBgStyle(val, txt, r.teamId)}
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
                {activeResults.map((m) => (
                  <div key={m.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded-xl flex justify-between items-center text-sm">
                    <div className="flex-1 flex items-center justify-end gap-2 pr-4 font-semibold text-slate-200">
                      <span>{m.homeTeam?.name || m.homeTeamId}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getFlagUrl(m.homeTeamId)}
                        alt={`${m.homeTeam?.name || m.homeTeamId} flag`}
                        className="h-3.5 w-auto max-w-[22px] rounded-sm shadow-sm border border-slate-800"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-1.5 rounded-lg font-mono font-bold text-slate-100 border border-slate-800">
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
                      <span>{m.awayTeam?.name || m.awayTeamId}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 pl-4 w-28 text-right font-mono">
                      {new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
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
                {activeFixtures.map((m) => (
                  <div key={m.id} className="p-4 border border-slate-800 bg-slate-900/30 rounded-xl flex justify-between items-center text-sm">
                    <div className="flex-1 flex items-center justify-end gap-2 pr-4 font-medium text-slate-300">
                      <span>{m.homeTeam?.name || m.homeTeamId}</span>
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
                      <span>{m.awayTeam?.name || m.awayTeamId}</span>
                    </div>
                    <div className="text-[11px] text-indigo-400 pl-4 w-28 text-right font-mono font-semibold">
                      {new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

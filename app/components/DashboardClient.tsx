'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerSimulation } from '../actions/simulate';
import { getFlagUrl } from '../lib/simulator/config/confederations';
import { calculateMathematicalStatus } from '../lib/simulator/mathematicalStatus';

interface Team {
  id: string;
  name: string;
  currentElo: number;
  group: string | null;
}

interface Prediction {
  id: number;
  teamId: string;
  tournament: string;
  winGroup: number;
  roundOf32: number;
  roundOf16: number;
  champions: number;
  final: number;
  semifinals: number;
  quarterfinals: number;
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
}

const MILESTONE_DATES: { [desc: string]: string | undefined } = {
  'Start (Pre-tournament)': '2026-06-10T23:59:59Z',
  'Matchday 1 Completed': '2026-06-17T23:59:59Z',
  'Matchday 2 Completed': '2026-06-23T23:59:59Z',
  'Matchday 3 Completed': '2026-06-27T23:59:59Z',
  'Round of 32 Completed': '2026-07-03T23:59:59Z',
  'Round of 16 Completed': '2026-07-08T23:59:59Z',
  'Quarterfinals Completed': '2026-07-13T23:59:59Z',
  'Semifinals Completed': '2026-07-17T23:59:59Z',
  'Current Projections': undefined,
};

type SortColumn = 'team' | 'group' | 'elo' | 'winGroup' | 'roundOf32' | 'roundOf16' | 'quarterfinals' | 'semifinals' | 'final' | 'champions';
type SortDir = 'asc' | 'desc';

export default function DashboardClient({ activeTournament, simulationRuns, results, fixtures }: Props) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'projections' | 'matches'>('projections');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(() => {
    const currentRun = simulationRuns.find(run => run.description === 'Current Projections');
    if (currentRun) return currentRun.id;
    return simulationRuns.length > 0 ? simulationRuns[simulationRuns.length - 1].id : null;
  });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(col);
      setSortDir(col === 'team' || col === 'group' ? 'asc' : 'desc');
    }
  };

  const activeRun = simulationRuns.find(run => run.id === selectedRunId);
  const predictions = activeRun ? activeRun.predictions : [];
  const [isPending, startTransition] = useTransition();
  const [simMessage, setSimMessage] = useState('');

  const tournamentNames: { [code: string]: string } = {
    WC: '2026 World Cup',
  };

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
  const groupsList = Array.from(new Set(predictions.map((p) => p.team.group).filter(Boolean))) as string[];
  groupsList.sort();

  // Filter predictions
  const filteredPredictions = predictions.filter((p) => {
    const matchesSearch = p.team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.teamId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroup === 'ALL' || p.team.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const activeRunDescription = activeRun?.description || 'Current Projections';
  const cutOffDateStr = MILESTONE_DATES[activeRunDescription];
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

  const isGroupStage = 
    activeRunDescription.includes('Start') ||
    activeRunDescription.includes('Matchday 1') ||
    activeRunDescription.includes('Matchday 2') ||
    (activeRunDescription === 'Current Projections' && activeFixtures.some(f => !f.isKnockout));

  const getTargetStageKey = (desc: string) => {
    if (desc.includes('Start') || desc.includes('Matchday')) {
      return 'roundOf32';
    }
    if (desc.includes('Round of 32')) {
      return 'roundOf16';
    }
    if (desc.includes('Round of 16')) {
      return 'quarterfinals';
    }
    if (desc.includes('Quarterfinals')) {
      return 'semifinals';
    }
    if (desc.includes('Semifinals')) {
      return 'final';
    }

    // Default or 'Current Projections' fallback: check predictions to find the active stage
    const stages = ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'];
    for (const stage of stages) {
      const hasFractional = predictions.some(p => {
        const val = p[stage as keyof Prediction] as number;
        return val > 0 && val < 1;
      });
      if (hasFractional) {
        return stage;
      }
    }
    return 'champions';
  };

  const simpleTeams = React.useMemo(() => {
    return predictions.map((p) => ({
      id: p.teamId,
      name: p.team.name,
      group: p.team.group,
    }));
  }, [predictions]);

  const mathStatus = React.useMemo(() => {
    if (predictions.length === 0) {
      return {
        guaranteedProgress: new Set<string>(),
        mathematicallyEliminated: new Set<string>(),
        guaranteedWinGroup: new Set<string>(),
        eliminatedWinGroup: new Set<string>(),
      };
    }
    
    if (isGroupStage) {
      return calculateMathematicalStatus(
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
      const targetStageKey = getTargetStageKey(activeRunDescription);
      const guaranteedProgress = new Set<string>();
      const mathematicallyEliminated = new Set<string>();
      
      predictions.forEach((p) => {
        const val = p[targetStageKey as keyof Prediction] as number;
        if (val === 1.0) {
          guaranteedProgress.add(p.teamId);
        } else if (val === 0.0) {
          mathematicallyEliminated.add(p.teamId);
        }
      });
      
      return {
        guaranteedProgress,
        mathematicallyEliminated,
        guaranteedWinGroup: new Set<string>(),
        eliminatedWinGroup: new Set<string>(),
      };
    }
  }, [predictions, isGroupStage, activeResults, activeFixtures, activeRunDescription, simpleTeams]);

  const isEliminatedMap: { [teamId: string]: boolean } = {};
  predictions.forEach((p) => {
    isEliminatedMap[p.teamId] = mathStatus.mathematicallyEliminated.has(p.teamId);
  });

  const getEffectiveProbability = (val: number, teamId: string, col: SortColumn) => {
    let isGuaranteed = false;
    let isEliminated = false;

    if (col === 'winGroup') {
      if (isGroupStage) {
        isGuaranteed = mathStatus.guaranteedWinGroup.has(teamId);
        isEliminated = mathStatus.eliminatedWinGroup.has(teamId);
      } else {
        isGuaranteed = val === 1.0;
        isEliminated = val === 0.0;
      }
    } else if (
      col === 'roundOf32' ||
      col === 'roundOf16' ||
      col === 'quarterfinals' ||
      col === 'semifinals' ||
      col === 'final' ||
      col === 'champions'
    ) {
      const targetStageKey = getTargetStageKey(activeRunDescription);
      const stages = ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'];
      const targetIndex = stages.indexOf(targetStageKey);
      const colIndex = stages.indexOf(col);

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

  // Sort predictions based on whether it is group stage or knockout stage
  const sortedPredictions = React.useMemo(() => {
    return [...filteredPredictions].sort((a, b) => {
      // If user has selected a sort column, use that
      if (sortColumn) {
        let cmp = 0;
        if (sortColumn === 'team') {
          cmp = a.team.name.localeCompare(b.team.name);
        } else if (sortColumn === 'group') {
          cmp = (a.team.group || '').localeCompare(b.team.group || '') || 
                (getEffectiveProbability(b.champions, b.teamId, 'champions') - getEffectiveProbability(a.champions, a.teamId, 'champions'));
        } else if (sortColumn === 'elo') {
          cmp = a.team.currentElo - b.team.currentElo;
        } else {
          cmp = getEffectiveProbability(a[sortColumn] as number, a.teamId, sortColumn) - 
                getEffectiveProbability(b[sortColumn] as number, b.teamId, sortColumn);
        }
        return sortDir === 'desc' ? -cmp : cmp;
      }

      // Default: group stage → group first, then success metrics
      if (isGroupStage) {
        const groupA = a.team.group || '';
        const groupB = b.team.group || '';
        if (groupA !== groupB) {
          return groupA.localeCompare(groupB);
        }
      }
      // Sort by success metrics descending using effective probabilities
      return (
        (getEffectiveProbability(b.champions, b.teamId, 'champions') - getEffectiveProbability(a.champions, a.teamId, 'champions')) ||
        (getEffectiveProbability(b.final, b.teamId, 'final') - getEffectiveProbability(a.final, a.teamId, 'final')) ||
        (getEffectiveProbability(b.semifinals, b.teamId, 'semifinals') - getEffectiveProbability(a.semifinals, a.teamId, 'semifinals')) ||
        (getEffectiveProbability(b.quarterfinals, b.teamId, 'quarterfinals') - getEffectiveProbability(a.quarterfinals, a.teamId, 'quarterfinals')) ||
        (getEffectiveProbability(b.roundOf16, b.teamId, 'roundOf16') - getEffectiveProbability(a.roundOf16, a.teamId, 'roundOf16')) ||
        (getEffectiveProbability(b.roundOf32, b.teamId, 'roundOf32') - getEffectiveProbability(a.roundOf32, a.teamId, 'roundOf32')) ||
        (getEffectiveProbability(b.winGroup, b.teamId, 'winGroup') - getEffectiveProbability(a.winGroup, a.teamId, 'winGroup')) ||
        b.team.currentElo - a.team.currentElo
      );
    });
  }, [filteredPredictions, sortColumn, sortDir, isGroupStage, mathStatus]);

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

  return (
    <div className="space-y-8">
      {/* Simulation Controls & Notification */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-6 bg-slate-900/40 border border-slate-800 rounded-2xl backdrop-blur-xl gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Monte Carlo Projections</h2>
          <p className="text-sm text-slate-400">
            {predictions.length > 0
              ? `Based on 10,000 simulation runs. Last updated: ${new Date(
                  predictions[0].updatedAt
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
                    {Object.entries(tournamentNames).map(([code, name]) => (
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

          {predictions.length === 0 ? (
            <div className="text-center p-12 bg-slate-900/20 border border-slate-800 rounded-2xl">
              <p className="text-slate-400 text-base mb-4">No prediction records found in NeonDB.</p>
              <p className="text-sm text-slate-500">Run the simulation above to calculate predictions!</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-900/10 backdrop-blur-xl">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                    {(['team', 'group', 'elo', 'winGroup', 'roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'] as SortColumn[]).filter(col => {
                      if (col === 'group' && !isGroupStage) return false;
                      if (col === 'winGroup' && !isGroupStage) return false;
                      return true;
                    }).map(col => {
                      const labels: Record<SortColumn, string> = {
                        team: 'Team', group: 'Group', elo: 'ELO',
                        winGroup: 'Win Group', roundOf32: 'Round of 32', roundOf16: 'Round of 16',
                        quarterfinals: 'Quarterfinals', semifinals: 'Semifinals', final: 'Finalist', champions: 'Champion'
                      };
                      const isSorted = sortColumn === col;
                      const arrow = isSorted ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
                      const isTeam = col === 'team';
                      return (
                        <th
                          key={col}
                          onClick={() => handleSort(col)}
                          className={`py-4 ${isTeam ? 'px-5 text-left' : 'px-4 text-center w-28'} cursor-pointer hover:text-slate-200 transition whitespace-nowrap ${isSorted ? 'text-indigo-400' : ''}`}
                        >
                          {labels[col]}{arrow}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                  {sortedPredictions.map((p) => {
                    const isEliminated = isEliminatedMap[p.teamId];
                    const winGroupTxt = formatProbability(p.winGroup, p.teamId, 'winGroup');
                    const roundOf32Txt = formatProbability(p.roundOf32, p.teamId, 'roundOf32');
                    const roundOf16Txt = formatProbability(p.roundOf16, p.teamId, 'roundOf16');
                    const quarterfinalsTxt = formatProbability(p.quarterfinals, p.teamId, 'quarterfinals');
                    const semifinalsTxt = formatProbability(p.semifinals, p.teamId, 'semifinals');
                    const finalTxt = formatProbability(p.final, p.teamId, 'final');
                    const championsTxt = formatProbability(p.champions, p.teamId, 'champions');

                    return (
                      <tr key={p.id} className={`hover:bg-slate-900/30 transition ${isEliminated ? 'opacity-35 grayscale text-slate-500 font-normal' : ''}`}>
                        <td className="py-3 px-5 font-semibold text-slate-100 flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getFlagUrl(p.teamId)}
                            alt={`${p.team.name} flag`}
                            className="h-4 w-auto max-w-[26px] rounded-sm shadow-sm border border-slate-850"
                            loading="lazy"
                          />
                          <span className={isEliminated ? 'text-slate-500 line-through decoration-slate-600/45' : ''}>
                            {p.team.name}
                          </span>
                        </td>
                        {isGroupStage && (
                          <td className="py-3 px-4 text-center font-bold text-slate-400">
                            {p.team.group}
                          </td>
                        )}
                        <td className="py-3 px-4 text-center font-bold font-mono text-slate-400">
                          {p.eloAtSimulation || p.team.currentElo}
                        </td>
                        {isGroupStage && (
                          <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.winGroup, winGroupTxt, p.teamId)}>
                            {winGroupTxt}
                          </td>
                        )}
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.roundOf32, roundOf32Txt, p.teamId)}>
                          {roundOf32Txt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.roundOf16, roundOf16Txt, p.teamId)}>
                          {roundOf16Txt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.quarterfinals, quarterfinalsTxt, p.teamId)}>
                          {quarterfinalsTxt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.semifinals, semifinalsTxt, p.teamId)}>
                          {semifinalsTxt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.final, finalTxt, p.teamId)}>
                          {finalTxt}
                        </td>
                        <td className="py-3 px-4 text-center font-bold font-mono" style={getCellBgStyle(p.champions, championsTxt, p.teamId)}>
                          {championsTxt}
                        </td>
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

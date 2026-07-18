'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerSimulation } from '../actions/simulate';
import { getFlagUrl } from '../lib/simulator/config/confederations';

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
    WC: 'World Cup 2026',
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

  // Sort predictions based on whether it is group stage or knockout stage
  const sortedPredictions = [...filteredPredictions].sort((a, b) => {
    // If user has selected a sort column, use that
    if (sortColumn) {
      let cmp = 0;
      if (sortColumn === 'team') cmp = a.team.name.localeCompare(b.team.name);
      else if (sortColumn === 'group') cmp = (a.team.group || '').localeCompare(b.team.group || '') || (b.champions - a.champions);
      else if (sortColumn === 'elo') cmp = a.team.currentElo - b.team.currentElo;
      else if (sortColumn === 'winGroup') cmp = a.winGroup - b.winGroup;
      else if (sortColumn === 'roundOf32') cmp = a.roundOf32 - b.roundOf32;
      else if (sortColumn === 'roundOf16') cmp = a.roundOf16 - b.roundOf16;
      else if (sortColumn === 'quarterfinals') cmp = a.quarterfinals - b.quarterfinals;
      else if (sortColumn === 'semifinals') cmp = a.semifinals - b.semifinals;
      else if (sortColumn === 'final') cmp = a.final - b.final;
      else if (sortColumn === 'champions') cmp = a.champions - b.champions;
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
    // Sort by success metrics descending
    return (
      (b.champions - a.champions) ||
      (b.final - a.final) ||
      (b.semifinals - a.semifinals) ||
      (b.quarterfinals - a.quarterfinals) ||
      (b.roundOf16 - a.roundOf16) ||
      (b.roundOf32 - a.roundOf32) ||
      (b.winGroup - a.winGroup) ||
      b.team.currentElo - a.team.currentElo
    );
  });

  const getIsActive = (p: Prediction) => {
    if (activeRunDescription.includes('Start') || 
        activeRunDescription.includes('Matchday')) {
      return p.roundOf32 > 0;
    }
    if (activeRunDescription.includes('Round of 32')) {
      return p.roundOf16 > 0;
    }
    if (activeRunDescription.includes('Round of 16')) {
      return p.quarterfinals > 0;
    }
    if (activeRunDescription.includes('Quarterfinals')) {
      return p.semifinals > 0;
    }
    if (activeRunDescription.includes('Semifinals') || activeRunDescription === 'Current Projections') {
      return p.final > 0;
    }
    return p.champions > 0;
  };

  const isEliminatedMap: { [teamId: string]: boolean } = {};
  predictions.forEach((p) => {
    isEliminatedMap[p.teamId] = !getIsActive(p);
  });

  // Helper to format probabilities with the required strict conditions
  const formatProbability = (val: number, teamId: string, isEliminated: boolean = false, canStillChange: boolean = false) => {
    if (val === 0) {
      // Eliminated teams always show — even if they have upcoming fixtures
      if (isEliminated) return '—';
      // Check if team is still active in group stage or knockout stage
      const hasUpcomingGroup = activeFixtures.some(
        (f) => !f.isKnockout && (f.homeTeamId === teamId || f.awayTeamId === teamId)
      );
      const hasUpcomingKnockout = activeFixtures.some(
        (f) => f.isKnockout && (f.homeTeamId === teamId || f.awayTeamId === teamId)
      );
      if (hasUpcomingGroup || hasUpcomingKnockout) {
        return '<1%';
      }
      return '—';
    }

    if (val === 1) {
      // Only show >99% if this specific metric can still change (i.e. the current stage)
      if (canStillChange) return '>99%';
      return '100%';
    }

    const percentage = val * 100;
    if (percentage > 0 && percentage < 0.5) {
      return '<1%';
    }
    if (percentage >= 99.5 && percentage < 100) {
      return '>99%';
    }

    return `${Math.round(percentage)}%`;
  };

  // Helper to calculate cell background style (green-white gradient overlay)
  const getCellBgStyle = (val: number, text: string) => {
    if (text === '—') return {};
    const effectiveVal = text === '<1%' ? 0.005 : val;
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
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
            <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-xl">
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
            <div className="flex gap-2 items-center overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedGroup('ALL')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
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
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
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
                    // For val===1 cells: only hedge to >99% for the *current* active-stage metric.
                    // Past metrics that are already 100% locked show as 100%.
                    const isCurrentStageGroupWin = isGroupStage && activeFixtures.some(f => !f.isKnockout && (f.homeTeamId === p.teamId || f.awayTeamId === p.teamId));
                    const isCurrentStageR32 = activeFixtures.some(f => f.isKnockout && (f.homeTeamId === p.teamId || f.awayTeamId === p.teamId));
                    const fmt = (val: number, canStillChange: boolean) => formatProbability(val, p.teamId, isEliminated, canStillChange);
                    const winGroupTxt = fmt(p.winGroup, isCurrentStageGroupWin);
                    const roundOf32Txt = fmt(p.roundOf32, isCurrentStageR32 || isCurrentStageGroupWin);
                    const roundOf16Txt = fmt(p.roundOf16, false);
                    const quarterfinalsTxt = fmt(p.quarterfinals, false);
                    const semifinalsTxt = fmt(p.semifinals, false);
                    const finalTxt = fmt(p.final, false);
                    const championsTxt = fmt(p.champions, false);

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
                          <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.winGroup, winGroupTxt)}>
                            {winGroupTxt}
                          </td>
                        )}
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.roundOf32, roundOf32Txt)}>
                          {roundOf32Txt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.roundOf16, roundOf16Txt)}>
                          {roundOf16Txt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.quarterfinals, quarterfinalsTxt)}>
                          {quarterfinalsTxt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.semifinals, semifinalsTxt)}>
                          {semifinalsTxt}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold font-mono" style={getCellBgStyle(p.final, finalTxt)}>
                          {finalTxt}
                        </td>
                        <td className="py-3 px-4 text-center font-bold font-mono" style={getCellBgStyle(p.champions, championsTxt)}>
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
                    <div className="flex-1 text-right pr-4 font-semibold text-slate-200">
                      {m.homeTeam?.name || m.homeTeamId}
                    </div>
                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-1.5 rounded-lg font-mono font-bold text-slate-100 border border-slate-800">
                      <span>{m.homeGoals}</span>
                      <span className="text-slate-600">:</span>
                      <span>{m.awayGoals}</span>
                    </div>
                    <div className="flex-1 text-left pl-4 font-semibold text-slate-200">
                      {m.awayTeam?.name || m.awayTeamId}
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
                    <div className="flex-1 text-right pr-4 font-medium text-slate-300">
                      {m.homeTeam?.name || m.homeTeamId}
                    </div>
                    <div className="px-3 py-1 bg-slate-800 text-slate-400 font-mono text-xs rounded border border-slate-800 uppercase tracking-wider font-semibold">
                      VS
                    </div>
                    <div className="flex-1 text-left pl-4 font-medium text-slate-300">
                      {m.awayTeam?.name || m.awayTeamId}
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

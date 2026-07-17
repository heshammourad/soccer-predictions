'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { triggerSimulation } from '../actions/simulate';

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
  champions: number;
  final: number;
  semifinals: number;
  quarterfinals: number;
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
    const matchesSearch = p.team.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroup === 'ALL' || p.team.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  // Group predictions by group letter for the grid view
  const groupedPredictions: { [group: string]: Prediction[] } = {};
  filteredPredictions.forEach((p) => {
    const g = p.team.group || 'Other';
    if (!groupedPredictions[g]) groupedPredictions[g] = [];
    groupedPredictions[g].push(p);
  });

  // Format percent utility
  const formatPercent = (val: number) => `${Math.round(val * 100)}%`;

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
            <>
              {selectedGroup !== 'ALL' ? (
                // Table view for single group
                <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/40 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-4 px-6">Team</th>
                        <th className="py-4 px-6 text-center">ELO Rating</th>
                        <th className="py-4 px-6 text-center">Quarterfinals</th>
                        <th className="py-4 px-6 text-center">Semifinals</th>
                        <th className="py-4 px-6 text-center">Finals</th>
                        <th className="py-4 px-6 text-center">Champions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm text-slate-300">
                      {filteredPredictions.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-900/30 transition">
                          <td className="py-4 px-6 font-medium text-slate-200 flex items-center gap-3">
                            <span className="text-slate-500 text-xs font-mono w-6">{p.teamId}</span>
                            {p.team.name}
                          </td>
                          <td className="py-4 px-6 text-center font-semibold text-slate-400">{p.team.currentElo}</td>
                          <td className="py-4 px-6 text-center">{formatPercent(p.quarterfinals)}</td>
                          <td className="py-4 px-6 text-center">{formatPercent(p.semifinals)}</td>
                          <td className="py-4 px-6 text-center">{formatPercent(p.final)}</td>
                          <td className="py-4 px-6 text-center font-bold text-emerald-400 bg-emerald-500/5">{formatPercent(p.champions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                // Grid view of all groups
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(groupedPredictions).sort().map(([group, list]) => (
                    <div key={group} className="border border-slate-800 rounded-2xl bg-slate-900/20 overflow-hidden backdrop-blur-md">
                      <div className="px-5 py-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
                        <h3 className="font-bold text-slate-200">Group {group}</h3>
                        <span className="text-xs text-slate-500 font-semibold uppercase">WC 2026</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {list.sort((a, b) => b.champions - a.champions).map((p) => (
                          <div key={p.id} className="flex justify-between items-center p-2.5 rounded-lg hover:bg-slate-900/40 transition">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">{p.teamId}</span>
                              <span className="text-sm font-medium text-slate-300">{p.team.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-mono">
                              <span className="text-slate-500">Elo: {p.team.currentElo}</span>
                              <span className="font-bold text-emerald-400 text-right w-12">{formatPercent(p.champions)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
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
              Recent Match Results ({results.length})
            </h3>
            {results.length === 0 ? (
              <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/10 text-slate-500 text-sm">
                No completed match results found in database.
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {results.map((m) => (
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
              Upcoming Fixtures ({fixtures.length})
            </h3>
            {fixtures.length === 0 ? (
              <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/10 text-slate-500 text-sm">
                No upcoming fixtures scheduled.
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {fixtures.map((m) => (
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

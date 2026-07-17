'use client';

import React, { useState } from 'react';
import { getFlagUrl } from '../lib/simulator/config/confederations';

interface Team {
  id: string;
  name: string;
  currentElo: number;
  confederation: string | null;
  eloChange1Yr: number | null;
  rankChange1Yr: number | null;
}

interface Props {
  teams: Team[];
}

export default function RankingsClient({ teams }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConfederation, setSelectedConfederation] = useState<string>('ALL');

  const confederations = ['ALL', 'UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];

  // 1. Calculate overall global rank for each team (index + 1 of the sorted list)
  const teamsWithGlobalRank = teams.map((team, idx) => ({
    ...team,
    globalRank: idx + 1
  }));

  // 2. Filter teams based on search query and selected confederation
  const filteredTeams = teamsWithGlobalRank.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesConf = selectedConfederation === 'ALL' || t.confederation === selectedConfederation;
    return matchesSearch && matchesConf;
  });

  // 3. If a specific confederation is selected, calculate confederation-specific ranks
  const teamsWithConfRank = filteredTeams.map((team, idx) => ({
    ...team,
    confRank: idx + 1
  }));

  // Helper to render rating change indicators
  const renderChange = (value: number | null, isRank = false) => {
    if (value === null || value === 0) {
      return <span className="text-slate-500 font-mono text-[11px]">-</span>;
    }
    const isPositive = value > 0;
    
    // For rank change, positive is climbing (green ▲), negative is dropping (red ▼).
    const icon = isPositive ? '▲' : '▼';
    const absValue = Math.abs(value);
    const colorClass = isPositive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold';
    
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-mono ${colorClass}`}>
        <span>{icon}</span>
        <span>{absValue}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search country or code..."
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

        {/* Confederation Select Pills */}
        <div className="flex gap-1.5 items-center overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          {confederations.map((conf) => (
            <button
              key={conf}
              onClick={() => setSelectedConfederation(conf)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap border ${
                selectedConfederation === conf
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {conf === 'ALL' ? 'World' : conf}
            </button>
          ))}
        </div>
      </div>

      {/* Rankings Table */}
      <div className="overflow-hidden border border-slate-800 rounded-2xl bg-slate-900/10 backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                <th className="py-4 px-6 text-center w-20">Rank</th>
                <th className="py-4 px-6 text-center w-20">Change</th>
                {selectedConfederation !== 'ALL' && (
                  <th className="py-4 px-6 text-center w-28">{selectedConfederation} Rank</th>
                )}
                <th className="py-4 px-6 w-16">Flag</th>
                <th className="py-4 px-6">Country</th>
                <th className="py-4 px-6 w-32 text-right">Rating</th>
                <th className="py-4 px-6 w-24 text-center">1-Yr Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
              {teamsWithConfRank.length === 0 ? (
                <tr>
                  <td
                    colSpan={selectedConfederation !== 'ALL' ? 8 : 7}
                    className="py-12 text-center text-slate-500 font-medium"
                  >
                    No countries found matching your search.
                  </td>
                </tr>
              ) : (
                teamsWithConfRank.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/30 transition group">
                    {/* Rank */}
                    <td className="py-3.5 px-6 text-center font-bold text-slate-200 font-mono">
                      #{t.globalRank}
                    </td>
                    
                    {/* Rank Change */}
                    <td className="py-3.5 px-6 text-center">
                      {renderChange(t.rankChange1Yr, true)}
                    </td>

                    {/* Confederation Rank */}
                    {selectedConfederation !== 'ALL' && (
                      <td className="py-3.5 px-6 text-center font-bold text-indigo-400 font-mono">
                        #{t.confRank}
                      </td>
                    )}

                    {/* Flag */}
                    <td className="py-3.5 px-6">
                      <div className="h-6 w-8 rounded overflow-hidden border border-slate-800 relative bg-slate-950 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getFlagUrl(t.id)}
                          alt={`${t.name} flag`}
                          className="object-cover h-full w-full"
                          loading="lazy"
                        />
                      </div>
                    </td>

                    {/* Country Name */}
                    <td className="py-3.5 px-6 font-semibold text-slate-100 group-hover:text-indigo-400 transition">
                      {t.name}
                    </td>



                    {/* Rating */}
                    <td className="py-3.5 px-6 text-right font-bold text-slate-200 font-mono">
                      {t.currentElo}
                    </td>

                    {/* Rating Change */}
                    <td className="py-3.5 px-6 text-center">
                      {renderChange(t.eloChange1Yr)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

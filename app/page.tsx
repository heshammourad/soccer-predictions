import React from 'react';
import { prisma } from './lib/db';
import RankingsClient from './components/RankingsClient';

export const metadata = {
  title: 'World Football ELO Rankings | Live National Team Ratings',
  description: 'Real-time global national team ELO ratings, ranking positions, confederation filters, and 1-year performance deltas.',
};

export default async function Page() {
  // Query only confederation-affiliated teams ordered by current ELO descending
  const teams = await prisma.team.findMany({
    where: {
      confederation: {
        not: null,
      },
    },
    orderBy: {
      currentElo: 'desc',
    },
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative">
        {/* Header Block */}
        <div className="pb-8 border-b border-slate-900 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">
              FIFA Associations
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-slate-400 border border-slate-800 uppercase tracking-widest font-mono">
              {teams.length} Active Teams
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent">
            World Football ELO Rankings
          </h1>
          <p className="text-slate-400 mt-2 max-w-2xl text-sm sm:text-base leading-relaxed">
            Live national team ratings derived from international results, including friendly matches, confederation championships, and World Cup fixtures.
          </p>
        </div>

        {/* Client Interactive Table */}
        <RankingsClient teams={JSON.parse(JSON.stringify(teams))} />
      </div>
    </main>
  );
}

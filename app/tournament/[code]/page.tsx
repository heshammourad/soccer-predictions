import React from 'react';
import { prisma } from '../../lib/db';
import DashboardClient from '../../components/DashboardClient';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ code: string }>;
}

const tournamentNames: { [code: string]: string } = {
  WC: '2026 World Cup',
};

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params;
  const tourneyName = tournamentNames[resolvedParams.code.toUpperCase()] || resolvedParams.code.toUpperCase();
  return {
    title: `${tourneyName} Projections & Simulations`,
    description: `Monte Carlo cup predictions, group stage probabilities, and knockout bracket calculations for ${tourneyName}.`,
  };
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const activeCode = resolvedParams.code.toUpperCase();

  // Validate tournament code
  if (!tournamentNames[activeCode]) {
    return notFound();
  }

  // 1. Fetch simulation runs with predictions and team info from Neon DB
  const simulationRuns = await prisma.simulationRun.findMany({
    where: { tournament: activeCode },
    include: {
      predictions: {
        include: {
          team: true,
        },
        orderBy: {
          champions: 'desc',
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // 2. Fetch matches with team names
  const matches = await prisma.match.findMany({
    where: { tournament: activeCode },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // 3. Separate results and fixtures
  const results = matches.filter((m) => m.homeGoals !== null);
  const fixtures = matches.filter((m) => m.homeGoals === null);
  const tournamentName = tournamentNames[activeCode];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-emerald-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-900 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                Simulation Live
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent">
              {tournamentName} Projections
            </h1>
            <p className="text-slate-400 mt-2 max-w-xl text-sm sm:text-base leading-relaxed">
              Discover real-time probabilities for group qualification and championship outcomes calculated using historical Elo ratings and Monte Carlo match engines.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-slate-900/30 border border-slate-900 px-5 py-3 rounded-2xl">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 uppercase">
              {activeCode}
            </div>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase">Tournament</div>
              <div className="text-sm font-bold text-slate-200">{tournamentName}</div>
            </div>
          </div>
        </div>

        {/* Client Interactive Dashboard */}
        <div className="mt-8">
          <DashboardClient
            activeTournament={activeCode}
            simulationRuns={JSON.parse(JSON.stringify(simulationRuns))}
            results={JSON.parse(JSON.stringify(results))}
            fixtures={JSON.parse(JSON.stringify(fixtures))}
          />
        </div>
      </div>
    </main>
  );
}

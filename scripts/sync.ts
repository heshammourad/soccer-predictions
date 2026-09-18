import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { Session, ClientIdentifier, initTLS, destroyTLS } from 'node-tls-client';
import { SimulatorEngine } from '../app/lib/simulator/engine';
import { WorldCup48Config } from '../app/lib/simulator/config/worldCup';
import { NationsLeagueAConfig } from '../app/lib/simulator/config/nationsLeagueA';
import { TournamentConfig } from '../app/lib/simulator/types';
import * as fs from 'fs';
import * as path from 'path';
import { pool as dbPool, prisma as dbPrisma } from '../app/lib/db';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing');
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Every tournament results are synced from eloratings.net for, keyed by the
// filename prefix eloratings.net publishes it under (tried as
// `<prefix>_latest.tsv` -> `<prefix>_results.tsv` -> `<prefix>.tsv`).
const RESULTS_SOURCES: { code: string; urlPrefix: string }[] = [
  { code: 'WC', urlPrefix: 'https://eloratings.net/2026_World_Cup' },
  { code: 'ENA', urlPrefix: 'https://eloratings.net/2026-27_European_Nations_League_A' },
];
const activeTournaments = RESULTS_SOURCES.map((s) => s.code);

// Knockout stage start date per tournament, used to classify a synced match
// as a group/league-phase match vs. a knockout match.
const KNOCKOUT_CUTOFFS: { [tournament: string]: Date } = {
  WC: new Date('2026-06-28'),
  ENA: new Date('2026-11-18'), // league phase ends 2026-11-17; QFs are March 2027
};

function isKnockoutMatch(tourney: string, date: Date): boolean {
  const cutoff = KNOCKOUT_CUTOFFS[tourney];
  return cutoff !== undefined && date >= cutoff;
}

async function fetchWithFallback(session: Session, urlPrefix: string): Promise<string> {
  const urls = [`${urlPrefix}_latest.tsv`, `${urlPrefix}_results.tsv`, `${urlPrefix}.tsv`];
  let lastStatus: number | undefined;
  for (const url of urls) {
    const res = await session.get(url);
    if (res.status === 200) {
      return res.text();
    }
    console.log(`${url} returned HTTP ${res.status}, trying next fallback...`);
    lastStatus = res.status;
  }
  throw new Error(`Failed to fetch results from ${urlPrefix}*: HTTP ${lastStatus}`);
}

async function run() {
  console.log('Initializing TLS Client...');
  await initTLS();

  const ratingsUrl = 'https://eloratings.net/World.tsv';

  console.log('Fetching latest data from eloratings.net...');
  const session = new Session({
    clientIdentifier: ClientIdentifier.chrome_120,
    timeout: 15000,
  });

  try {
    const ratingsRes = await session.get(ratingsUrl);
    if (ratingsRes.status !== 200) throw new Error(`Failed to fetch ratings: ${ratingsRes.status}`);
    const ratingsData = await ratingsRes.text();

    console.log('Updating team ELO ratings in database...');

    const confederationsPath = path.resolve(__dirname, '../app/lib/simulator/config/confederations.json');
    const confederationsMap: { [code: string]: string } = fs.existsSync(confederationsPath)
      ? JSON.parse(fs.readFileSync(confederationsPath, 'utf8'))
      : {};

    let ratingsCount = 0;
    for (const line of ratingsData.split('\n')) {
      if (!line.trim()) continue;
      const fields = line.split('\t');
      if (fields.length >= 18) {
        const code = fields[2].trim();
        const rating = parseInt(fields[3].trim(), 10);
        const cleanRankChange = fields[14].replace(/[\x12−]/g, '-').trim();
        const cleanEloChange = fields[15].replace(/[\x12−]/g, '-').trim();

        const rankChange = parseInt(cleanRankChange, 10);
        const eloChange = parseInt(cleanEloChange, 10);

        if (code && !isNaN(rating)) {
          const confederation = confederationsMap[code] || null;
          await prisma.team.updateMany({
            where: { id: code },
            data: {
              currentElo: rating,
              confederation,
              eloChange1Yr: isNaN(eloChange) ? 0 : eloChange,
              rankChange1Yr: isNaN(rankChange) ? 0 : rankChange
            }
          });
          ratingsCount++;
        }
      } else if (fields.length >= 4) {
        const code = fields[2].trim();
        const rating = parseInt(fields[3].trim(), 10);
        if (code && !isNaN(rating)) {
          const confederation = confederationsMap[code] || null;
          await prisma.team.updateMany({
            where: { id: code },
            data: {
              currentElo: rating,
              confederation
            }
          });
          ratingsCount++;
        }
      }
    }
    console.log(`Updated ratings for ${ratingsCount} teams.`);

    for (const source of RESULTS_SOURCES) {
      console.log(`Fetching ${source.code} results from eloratings.net...`);
      let resultsData: string;
      try {
        resultsData = await fetchWithFallback(session, source.urlPrefix);
      } catch (err) {
        console.error(`Skipping ${source.code} results sync:`, err);
        continue;
      }

      console.log(`Updating ${source.code} match results in database...`);
      let resultsCount = 0;
      for (const line of resultsData.split('\n')) {
        if (!line.trim()) continue;
        const fields = line.split('\t');
        if (fields.length >= 8) {
          const matchTournament = fields[7].trim();
          if (!activeTournaments.includes(matchTournament)) continue;

          const year = fields[0].trim();
          const month = fields[1].trim();
          const day = fields[2].trim();
          const team1 = fields[3].trim();
          const team2 = fields[4].trim();
          const score1 = parseInt(fields[5].trim(), 10);
          const score2 = parseInt(fields[6].trim(), 10);

          if (!team1 || !team2 || isNaN(score1) || isNaN(score2)) continue;

          const m = month === '00' ? '06' : month;
          const d = day === '00' ? '15' : day;
          const date = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`);

          const location = fields[8] && fields[8].trim() ? fields[8].trim() : team1;
          const ratingChange = fields[9] ? parseInt(fields[9].trim(), 10) || 0 : 0;

          // Check if match already exists
          const existing = await prisma.match.findFirst({
            where: {
              homeTeamId: team1,
              awayTeamId: team2,
              tournament: matchTournament,
              date
            }
          });

          if (existing) {
            await prisma.match.update({
              where: { id: existing.id },
              data: { homeGoals: score1, awayGoals: score2, location, ratingChange }
            });
          } else {
            await prisma.match.create({
              data: {
                tournament: matchTournament,
                date,
                homeTeamId: team1,
                awayTeamId: team2,
                homeGoals: score1,
                awayGoals: score2,
                isKnockout: isKnockoutMatch(matchTournament, date),
                location,
                ratingChange
              }
            });
          }
          resultsCount++;
        }
      }
      console.log(`Synced ${resultsCount} ${source.code} match results.`);
    }

  } finally {
    console.log('Closing TLS session...');
    await session.close();
    await destroyTLS();
  }
}

// Runs (or skips, per the usual historical-milestone-already-exists rule)
// every milestone simulation for one tournament. Shared by every tournament
// so each one's milestone list and config stay independent of the others.
async function runMilestonesForConfig(
  config: TournamentConfig,
  milestones: { name: string; date: Date | undefined }[]
) {
  console.log(`Running ${config.name} simulations via TypeScript engine...`);
  const now = new Date();

  const historicalMilestones = milestones.filter((m): m is { name: string; date: Date } => m.date !== undefined);
  const allHistoricalDatesPassed = historicalMilestones.every((m) => m.date <= now);

  if (allHistoricalDatesPassed) {
    const existingRunsCount = await prisma.simulationRun.count({
      where: {
        tournament: config.code,
        description: { in: historicalMilestones.map((m) => m.name) }
      }
    });

    if (existingRunsCount === historicalMilestones.length) {
      console.log(`Tournament ${config.code} is complete and all historical milestones exist in DB. Skipping simulations.`);
      return;
    }
  }

  for (const milestone of milestones) {
    if (milestone.date && milestone.date > now) {
      console.log(`Skipping future milestone: ${milestone.name} (${milestone.date.toISOString()})`);
      continue;
    }

    if (milestone.date) {
      const existing = await prisma.simulationRun.findFirst({
        where: {
          tournament: config.code,
          description: milestone.name
        }
      });
      if (existing) {
        console.log(`Skipping historical milestone: ${milestone.name} (already exists in database)`);
        continue;
      }
    }

    console.log(`Running simulation for milestone: ${milestone.name}...`);
    const engine = new SimulatorEngine(config, 10000, milestone.date, milestone.name);
    await engine.runSimulation();
  }
  console.log(`All ${config.code} simulations completed successfully.`);
}

run()
  .then(async () => {
    console.log('Database sync completed successfully.');

    await runMilestonesForConfig(new WorldCup48Config(), [
      { name: 'Start (Pre-tournament)', date: new Date('2026-06-10T23:59:59Z') },
      { name: 'Matchday 1 Completed', date: new Date('2026-06-17T23:59:59Z') },
      { name: 'Matchday 2 Completed', date: new Date('2026-06-23T23:59:59Z') },
      { name: 'Matchday 3 Completed', date: new Date('2026-06-27T23:59:59Z') },
      { name: 'Round of 32 Completed', date: new Date('2026-07-03T23:59:59Z') },
      { name: 'Round of 16 Completed', date: new Date('2026-07-08T23:59:59Z') },
      { name: 'Quarterfinals Completed', date: new Date('2026-07-13T23:59:59Z') },
      { name: 'Semifinals Completed', date: new Date('2026-07-17T23:59:59Z') },
      { name: 'Tournament Completed', date: new Date('2026-07-19T23:59:59Z') },
      { name: 'Current Projections', date: undefined }
    ]);

    // Approximate matchday boundaries within the 24 Sep - 17 Nov 2026
    // league phase; reconcile against the actual synced ENA fixture dates
    // once the full schedule is loaded.
    await runMilestonesForConfig(new NationsLeagueAConfig(), [
      { name: 'Start (Pre-tournament)', date: new Date('2026-09-23T23:59:59Z') },
      { name: 'Matchday 1 Completed', date: new Date('2026-09-29T23:59:59Z') },
      { name: 'Matchday 2 Completed', date: new Date('2026-10-04T23:59:59Z') },
      { name: 'Matchday 3 Completed', date: new Date('2026-10-14T23:59:59Z') },
      { name: 'Matchday 4 Completed', date: new Date('2026-10-17T23:59:59Z') },
      { name: 'Matchday 5 Completed', date: new Date('2026-11-14T23:59:59Z') },
      { name: 'Matchday 6 Completed', date: new Date('2026-11-17T23:59:59Z') },
      { name: 'Quarterfinals Completed', date: new Date('2027-03-31T23:59:59Z') },
      { name: 'Tournament Completed', date: new Date('2027-06-08T23:59:59Z') },
      { name: 'Current Projections', date: undefined }
    ]);

    // Disconnect clients and end pools
    await prisma.$disconnect();
    await pool.end();
    await dbPrisma.$disconnect();
    if (dbPool) {
      await dbPool.end();
    }
  })
  .catch(async (err) => {
    console.error('Sync failed:', err);
    try {
      await prisma.$disconnect();
      await pool.end();
    } catch (e) {}
    try {
      await dbPrisma.$disconnect();
      if (dbPool) {
        await dbPool.end();
      }
    } catch (e) {}
    process.exit(1);
  });

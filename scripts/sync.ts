import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { Session, ClientIdentifier, initTLS, destroyTLS } from 'node-tls-client';
import { SimulatorEngine } from '../app/lib/simulator/engine';
import { WorldCup48Config } from '../app/lib/simulator/config/worldCup';
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

async function run() {
  console.log('Initializing TLS Client...');
  await initTLS();

  const ratingsUrl = 'https://eloratings.net/World.tsv';
  const latestResultsUrl = 'https://eloratings.net/2026_World_Cup_latest.tsv';
  const completedResultsUrl = 'https://eloratings.net/2026_World_Cup_results.tsv';
  const fallbackResultsUrl = 'https://eloratings.net/2026_World_Cup.tsv';

  console.log('Fetching latest data from eloratings.net...');
  const session = new Session({
    clientIdentifier: ClientIdentifier.chrome_120,
    timeout: 15000,
  });

  try {
    const ratingsRes = await session.get(ratingsUrl);
    if (ratingsRes.status !== 200) throw new Error(`Failed to fetch ratings: ${ratingsRes.status}`);

    let resultsRes = await session.get(latestResultsUrl);
    if (resultsRes.status !== 200) {
      console.log(`_latest.tsv returned HTTP ${resultsRes.status}, trying _results.tsv...`);
      resultsRes = await session.get(completedResultsUrl);
    }
    if (resultsRes.status !== 200) {
      console.log(`_results.tsv returned HTTP ${resultsRes.status}, trying fallback .tsv...`);
      resultsRes = await session.get(fallbackResultsUrl);
    }
    if (resultsRes.status !== 200) throw new Error(`Failed to fetch results: ${resultsRes.status}`);

    const ratingsData = await ratingsRes.text();
    const resultsData = await resultsRes.text();

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
        const cleanRankChange = fields[14].replace(/[\u0012\x12\u2212]/g, '-').trim();
        const cleanEloChange = fields[15].replace(/[\u0012\x12\u2212]/g, '-').trim();
        
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

    console.log('Updating match results in database...');
    let resultsCount = 0;
    for (const line of resultsData.split('\n')) {
      if (!line.trim()) continue;
      const fields = line.split('\t');
      if (fields.length >= 8) {
        const matchTournament = fields[7].trim();
        const activeTournaments = ['WC'];
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
              isKnockout: date >= new Date('2026-06-28'),
              location,
              ratingChange
            }
          });
        }
        resultsCount++;
      }
    }
    console.log(`Synced ${resultsCount} match results.`);

  } finally {
    console.log('Closing TLS session...');
    await session.close();
    await destroyTLS();
  }
}

run()
  .then(async () => {
    console.log('Database sync completed successfully.');
    
    console.log('Running 2026 World Cup simulations via TypeScript engine...');
    const config = new WorldCup48Config();

    const milestones = [
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
    ];

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
        await prisma.$disconnect();
        await pool.end();
        await dbPrisma.$disconnect();
        if (dbPool) {
          await dbPool.end();
        }
        return;
      }
    }

    for (const milestone of milestones) {
      if (milestone.date && milestone.date > now) {
        console.log(`Skipping future milestone: ${milestone.name} (${milestone.date.toISOString()})`);
        continue;
      }

      if (milestone.date) {
        // Check if the simulation run already exists in the database
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
    console.log('All simulations completed successfully.');

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

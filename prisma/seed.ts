import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing');
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DATA_DIR = path.join(__dirname, 'seed-data');

// Helper to read and unescape data files
function readDataFile(filePath: string): string {
  try {
    let raw = fs.readFileSync(filePath, 'latin1').trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = raw.slice(1, -1);
      raw = raw
        .replace(/\\r/g, '\r')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return raw;
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return '';
  }
}

// Knockout stage start date per tournament, used to classify a seeded match
// as a group/league-phase match vs. a knockout match. Add an entry here for
// each tournament with a knockout phase.
const KNOCKOUT_CUTOFFS: { [tournament: string]: Date } = {
  WC: new Date('2026-06-28'),
  ENA: new Date('2027-03-25'), // first League A quarterfinal leg
  ENB: new Date('2027-03-25'), // promotion/relegation playoffs (window assumed, as in scripts/sync.ts)
  ENC: new Date('2027-03-25'),
};

function isKnockoutMatch(tourney: string, date: Date): boolean {
  const cutoff = KNOCKOUT_CUTOFFS[tourney];
  return cutoff !== undefined && date >= cutoff;
}

async function main() {
  console.log('Clearing database tables...');
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Prediction", "Match", "Team", "SimulationRun", "TeamTournamentGroup" CASCADE;'
  );

  const confederationsPath = path.join(__dirname, '../app/lib/simulator/config/confederations.json');
  const confederationsMap: { [code: string]: string } = fs.existsSync(confederationsPath)
    ? JSON.parse(fs.readFileSync(confederationsPath, 'utf8'))
    : {};

  console.log('Reading teams list...');
  // 1. Read teams.csv
  const teamsCsvPath = path.join(DATA_DIR, 'teams.csv');
  if (!fs.existsSync(teamsCsvPath)) {
    throw new Error(`teams.csv not found at ${teamsCsvPath}`);
  }
  const teamsCsv = fs.readFileSync(teamsCsvPath, 'utf8');
  const teamNames: { [code: string]: string } = {};
  for (const line of teamsCsv.split('\n')) {
    if (!line.trim()) continue;
    const [code, name] = line.split(',');
    if (code && name) {
      teamNames[code.trim()] = name.trim();
    }
  }

  console.log('Reading team ratings...');
  // 2. Read team_ratings
  const ratingsPath = path.join(DATA_DIR, 'team_ratings');
  const ratingsRaw = readDataFile(ratingsPath);
  const teamRatings: { [code: string]: number } = {};
  const teamEloChange1Yr: { [code: string]: number } = {};
  const teamRankChange1Yr: { [code: string]: number } = {};
  
  for (const line of ratingsRaw.split('\n')) {
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
        teamRatings[code] = rating;
        teamRankChange1Yr[code] = isNaN(rankChange) ? 0 : rankChange;
        teamEloChange1Yr[code] = isNaN(eloChange) ? 0 : eloChange;
      }
    } else if (fields.length >= 4) {
      const code = fields[2].trim();
      const rating = parseInt(fields[3].trim(), 10);
      if (code && !isNaN(rating)) {
        teamRatings[code] = rating;
      }
    }
  }

  // 3. Create Teams in database
  console.log('Inserting teams...');
  const allCodes = Array.from(new Set([...Object.keys(teamNames), ...Object.keys(teamRatings)]));
  for (const code of allCodes) {
    const name = teamNames[code] || code;
    const currentElo = teamRatings[code] ?? 1000; // Default if not in ratings
    const confederation = confederationsMap[code] || null;
    const eloChange1Yr = teamEloChange1Yr[code] ?? 0;
    const rankChange1Yr = teamRankChange1Yr[code] ?? 0;

    await prisma.team.create({
      data: {
        id: code,
        name,
        currentElo,
        confederation,
        eloChange1Yr,
        rankChange1Yr
      }
    });
  }
  console.log(`Seeded ${allCodes.length} teams.`);

  // 4. Ingest Matches (results and fixtures), and per-tournament group
  // assignments, for all available tournaments
  const tournaments = ['WC', 'ENA', 'ENB', 'ENC'];
  for (const tourney of tournaments) {
    const tourneyDir = path.join(DATA_DIR, tourney);
    if (!fs.existsSync(tourneyDir)) continue;

    console.log(`Processing tournament ${tourney}...`);

    // Load results (completed matches)
    const resultsPath = path.join(tourneyDir, 'results');
    let resultsCount = 0;
    if (fs.existsSync(resultsPath)) {
      const resultsRaw = readDataFile(resultsPath);
      for (const line of resultsRaw.split('\n')) {
        if (!line.trim()) continue;
        const fields = line.split('\t');
        if (fields.length >= 8) {
          const matchTournament = fields[7].trim();
          if (matchTournament !== tourney) continue;

          const year = fields[0].trim();
          const month = fields[1].trim();
          const day = fields[2].trim();
          const team1 = fields[3].trim();
          const team2 = fields[4].trim();
          const score1 = parseInt(fields[5].trim(), 10);
          const score2 = parseInt(fields[6].trim(), 10);
          
          if (!team1 || !team2 || isNaN(score1) || isNaN(score2)) continue;

          // Build valid date: handle cases where day or month is 00
          const m = month === '00' ? '06' : month; // fallback to June
          const d = day === '00' ? '15' : day;     // fallback to 15th
          const dateStr = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`;
          const date = new Date(dateStr);

          // Verify that both teams exist in Team table
          const t1Exists = allCodes.includes(team1);
          const t2Exists = allCodes.includes(team2);
          if (!t1Exists) {
            await prisma.team.create({
              data: { id: team1, name: team1, currentElo: 1000 }
            });
            allCodes.push(team1);
          }
          if (!t2Exists) {
            await prisma.team.create({
              data: { id: team2, name: team2, currentElo: 1000 }
            });
            allCodes.push(team2);
          }

          // If date is after knockouts stage start
          const isKnockout = isKnockoutMatch(tourney, date);
          const location = fields[8] && fields[8].trim() ? fields[8].trim() : team1;
          const ratingChange = fields[9] ? parseInt(fields[9].trim(), 10) || 0 : 0;

          await prisma.match.create({
            data: {
              tournament: tourney,
              date,
              homeTeamId: team1,
              awayTeamId: team2,
              homeGoals: score1,
              awayGoals: score2,
              isKnockout,
              location,
              ratingChange
            }
          });
          resultsCount++;
        }
      }
    }
    console.log(`Seeded ${resultsCount} results for ${tourney}.`);

    // Load fixtures (upcoming matches)
    const fixturesPath = path.join(tourneyDir, 'fixtures');
    let fixturesCount = 0;
    if (fs.existsSync(fixturesPath)) {
      const fixturesRaw = readDataFile(fixturesPath);
      for (const line of fixturesRaw.split('\n')) {
        if (!line.trim()) continue;
        const fields = line.split('\t');
        if (fields.length >= 6) {
          const matchTournament = fields[5].trim();
          if (matchTournament !== tourney) continue;

          const year = fields[0].trim();
          const month = fields[1].trim();
          const day = fields[2].trim();
          const team1 = fields[3].trim();
          const team2 = fields[4].trim();

          if (!team1 || !team2) continue;

          const m = month === '00' ? '06' : month;
          const d = day === '00' ? '15' : day;
          const dateStr = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`;
          const date = new Date(dateStr);

          // Verify that both teams exist in Team table
          const t1Exists = allCodes.includes(team1);
          const t2Exists = allCodes.includes(team2);
          if (!t1Exists) {
            await prisma.team.create({
              data: { id: team1, name: team1, currentElo: 1000 }
            });
            allCodes.push(team1);
          }
          if (!t2Exists) {
            await prisma.team.create({
              data: { id: team2, name: team2, currentElo: 1000 }
            });
            allCodes.push(team2);
          }

          const isKnockout = isKnockoutMatch(tourney, date);
          const location = fields[6] ? fields[6].trim() : 'XX';

          await prisma.match.create({
            data: {
              tournament: tourney,
              date,
              homeTeamId: team1,
              awayTeamId: team2,
              homeGoals: null,
              awayGoals: null,
              isKnockout,
              location,
              ratingChange: 0
            }
          });
          fixturesCount++;
        }
      }
    }
    console.log(`Seeded ${fixturesCount} fixtures for ${tourney}.`);

    // Load this tournament's group assignments (per-tournament, so e.g. WC's
    // groups and ENA's groups never clobber each other for shared teams)
    const groupsPath = path.join(tourneyDir, 'groups');
    let groupsCount = 0;
    if (fs.existsSync(groupsPath)) {
      const groupsObj = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
      for (const [groupLetter, teamCodes] of Object.entries(groupsObj)) {
        if (!Array.isArray(teamCodes)) continue;
        for (const teamCode of teamCodes) {
          if (!allCodes.includes(teamCode)) continue;
          await prisma.teamTournamentGroup.create({
            data: { teamId: teamCode, tournament: tourney, group: groupLetter }
          });
          groupsCount++;
        }
      }
    }
    console.log(`Seeded ${groupsCount} group assignments for ${tourney}.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

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

const DATA_DIR = path.join(__dirname, '../nodejs/src/data');

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

async function main() {
  console.log('Clearing database tables...');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Prediction", "Match", "Team" CASCADE;');

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
  for (const line of ratingsRaw.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length >= 4) {
      const code = fields[2].trim();
      const rating = parseInt(fields[3].trim(), 10);
      if (code && !isNaN(rating)) {
        teamRatings[code] = rating;
      }
    }
  }

  console.log('Reading World Cup groups...');
  // 3. Read WC/groups to assign groups for World Cup (default tournament)
  const wcGroupsPath = path.join(DATA_DIR, 'WC/groups');
  const groupsInfo: { [teamCode: string]: string } = {};
  if (fs.existsSync(wcGroupsPath)) {
    const groupsObj = JSON.parse(fs.readFileSync(wcGroupsPath, 'utf8'));
    for (const [groupLetter, teams] of Object.entries(groupsObj)) {
      if (Array.isArray(teams)) {
        for (const t of teams) {
          groupsInfo[t] = groupLetter;
        }
      }
    }
  }

  // 4. Create Teams in database
  console.log('Inserting teams...');
  const allCodes = Array.from(new Set([...Object.keys(teamNames), ...Object.keys(teamRatings)]));
  for (const code of allCodes) {
    const name = teamNames[code] || code;
    const currentElo = teamRatings[code] ?? 1000; // Default if not in ratings
    const group = groupsInfo[code] || null;

    await prisma.team.create({
      data: {
        id: code,
        name,
        currentElo,
        group
      }
    });
  }
  console.log(`Seeded ${allCodes.length} teams.`);

  // 5. Ingest Matches (results and fixtures) for all available tournaments
  const tournaments = ['WC', 'EC', 'AC', 'CA', 'AR', 'ARC', 'CCH'];
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
          let t1Exists = allCodes.includes(team1);
          let t2Exists = allCodes.includes(team2);
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
          const isKnockout = tourney === 'WC' && date >= new Date('2026-06-28');

          await prisma.match.create({
            data: {
              tournament: tourney,
              date,
              homeTeamId: team1,
              awayTeamId: team2,
              homeGoals: score1,
              awayGoals: score2,
              isKnockout,
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
          let t1Exists = allCodes.includes(team1);
          let t2Exists = allCodes.includes(team2);
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

          const isKnockout = tourney === 'WC' && date >= new Date('2026-06-28');

          await prisma.match.create({
            data: {
              tournament: tourney,
              date,
              homeTeamId: team1,
              awayTeamId: team2,
              homeGoals: null,
              awayGoals: null,
              isKnockout,
            }
          });
          fixturesCount++;
        }
      }
    }
    console.log(`Seeded ${fixturesCount} fixtures for ${tourney}.`);
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

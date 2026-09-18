import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { Session, ClientIdentifier, initTLS, destroyTLS } from 'node-tls-client';
import { SimulatorEngine } from '../app/lib/simulator/engine';
import { WorldCup48Config } from '../app/lib/simulator/config/worldCup';
import { NationsLeagueConfig } from '../app/lib/simulator/config/nationsLeague';
import { AfricaCupQualifiersConfig } from '../app/lib/simulator/config/africaCupQualifiers';
import {
  ConcacafLeagueAConfig,
  ConcacafLeagueBConfig,
  ConcacafLeagueCConfig,
  CLA_MILESTONES,
  CLB_MILESTONES,
  CLC_MILESTONES,
  MilestoneSchedule,
} from '../app/lib/simulator/config/concacafNationsLeague';
import { TournamentConfig } from '../app/lib/simulator/types';
import { pickMatchForFeedRow } from '../app/lib/simulator/feedMatching';
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
];

// The UEFA and CONCACAF Nations League divisions and the Africa Cup of Nations qualifiers (FQ)
// aren't published under a per-tournament results file (a `<name>_latest.tsv`
// lookup for them returns unrelated data). Their played matches show up in the
// global recent-results feed and their upcoming matches (including drawn
// playoff pairings, once announced) in the global fixtures feed, both tagged
// with the tournament code.
const GLOBAL_FEED_CODES = ['ENA', 'ENB', 'ENC', 'FQ', 'CLA', 'CLB', 'CLC'];
const GLOBAL_RESULTS_URL = 'https://eloratings.net/latest.tsv';
const GLOBAL_FIXTURES_URL = 'https://eloratings.net/fixtures.tsv';

// Knockout stage start date per tournament, used to classify a synced match
// as a group/league-phase match vs. a knockout match.
const KNOCKOUT_CUTOFFS: { [tournament: string]: Date } = {
  WC: new Date('2026-06-28'),
  ENA: new Date('2027-03-25'), // first League A quarterfinal leg
  // Promotion/relegation playoffs: assumed to share the March 2027 window with
  // the League A quarterfinals (as in the previous edition); the playoff
  // fixtures aren't published yet, so confirm the dates once they are.
  ENB: new Date('2027-03-25'),
  ENC: new Date('2027-03-25'),
  CLA: new Date('2026-11-01'), // League A quarterfinals, 9-17 Nov (group stage ends 5 Oct)
  CLB: new Date('2027-03-01'), // League B Finals, March 2027 (group stage ends 17 Nov)
  CLC: new Date('2027-03-01'), // League C Finals, March 2027 (group stage ends 6 Oct)
};

// Some eloratings.net codes are reused by every edition of a recurring
// competition (FQ covers each Africa Cup qualifying cycle). Matches are keyed
// by (tournament, home, away), so a row from an earlier edition would
// overwrite this one's; ignore anything dated before the edition starts.
const EDITION_START: { [tournament: string]: Date } = {
  FQ: new Date('2026-09-01'),
  CLA: new Date('2026-09-01'),
  CLB: new Date('2026-09-01'),
  CLC: new Date('2026-09-01'),
};

function isBeforeEdition(tourney: string, date: Date): boolean {
  const start = EDITION_START[tourney];
  return start !== undefined && date < start;
}

function isKnockoutMatch(tourney: string, date: Date): boolean {
  const cutoff = KNOCKOUT_CUTOFFS[tourney];
  return cutoff !== undefined && date >= cutoff;
}

// eloratings.net dates some fixtures by month only (day "00"), which can't
// separate matchdays played in the same window (Africa Cup qualifiers: two
// matchdays in Nov 2026 and two in Mar 2027). prisma/seed-data/<code>/fixtures
// records a date per fixture derived from the feed's ordering; a month-only
// feed row takes the date of the seed row for the same pair and month.
const SEED_FIXTURE_DATES = new Map<string, Date>();
const seedFixtureKey = (tournament: string, home: string, away: string, year: string, month: string) =>
  `${tournament}|${home}|${away}|${year}-${month}`;

function loadSeedFixtureDates(codes: string[]) {
  for (const code of codes) {
    const file = path.resolve(__dirname, `../prisma/seed-data/${code}/fixtures`);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const fields = line.split('\t');
      if (fields.length < 6 || fields[5].trim() !== code || fields[2].trim() === '00') continue;
      const [year, month, day] = [fields[0].trim(), fields[1].trim().padStart(2, '0'), fields[2].trim().padStart(2, '0')];
      SEED_FIXTURE_DATES.set(
        seedFixtureKey(code, fields[3].trim(), fields[4].trim(), year, month),
        new Date(`${year}-${month}-${day}T12:00:00Z`)
      );
    }
  }
}
loadSeedFixtureDates(GLOBAL_FEED_CODES);

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

// Parses a results TSV (year, month, day, home, away, homeGoals, awayGoals,
// tournament, location, ratingChange, ...) and upserts the rows for `codes`.
// matchByPair: find the existing row by (tournament, home, away) rather than
// by exact date -- right for double round-robin league phases and two-legged
// ties, where an ordered home/away pair is unique within a tournament, and
// robust to a fixture having been rescheduled since it was synced.
async function syncResults(resultsData: string, codes: string[], matchByPair: boolean): Promise<number> {
  let resultsCount = 0;
  const claimedMatchIds = new Set<number>(); // see pickMatchForFeedRow
  for (const line of resultsData.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length >= 8) {
      const matchTournament = fields[7].trim();
      if (!codes.includes(matchTournament)) continue;

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
      if (isBeforeEdition(matchTournament, date)) continue;

      const location = fields[8] && fields[8].trim() ? fields[8].trim() : team1;
      const ratingChange = fields[9] ? parseInt(fields[9].trim(), 10) || 0 : 0;

      // Check if match already exists
      const existing = matchByPair
        ? pickMatchForFeedRow(
            await prisma.match.findMany({ where: { homeTeamId: team1, awayTeamId: team2, tournament: matchTournament } }),
            date,
            claimedMatchIds
          )
        : await prisma.match.findFirst({
            where: { homeTeamId: team1, awayTeamId: team2, tournament: matchTournament, date }
          });

      if (existing) {
        await prisma.match.update({
          where: { id: existing.id },
          data: { homeGoals: score1, awayGoals: score2, location, ratingChange, ...(matchByPair ? { date } : {}) }
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
  return resultsCount;
}

// Parses the global fixtures TSV (year, month, day, home, away, tournament,
// location, ...) and creates or refreshes the still-unplayed matches for
// `codes`, so late-published fixtures (e.g. a drawn playoff pairing) and
// venue/date changes reach the simulator without reseeding.
async function syncFixtures(fixturesData: string, codes: string[]): Promise<number> {
  const knownTeams = new Set((await prisma.team.findMany({ select: { id: true } })).map((t) => t.id));
  let count = 0;
  const claimedMatchIds = new Set<number>(); // see pickMatchForFeedRow
  for (const line of fixturesData.split('\n')) {
    if (!line.trim()) continue;
    const fields = line.split('\t');
    if (fields.length < 6) continue;
    const tournament = fields[5].trim();
    if (!codes.includes(tournament)) continue;

    const team1 = fields[3].trim();
    const team2 = fields[4].trim();
    if (!team1 || !team2) continue;
    if (!knownTeams.has(team1) || !knownTeams.has(team2)) {
      console.warn(`Skipping ${tournament} fixture ${team1}-${team2}: team not in database.`);
      continue;
    }

    const month = fields[1].trim() === '00' ? '06' : fields[1].trim();
    const day = fields[2].trim() === '00' ? '15' : fields[2].trim();
    let date = new Date(`${fields[0].trim()}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00Z`);
    // A feed date with no day is replaced by the matchday date recorded in the
    // seed data, if any (see SEED_FIXTURE_DATES).
    if (fields[2].trim() === '00') {
      date = SEED_FIXTURE_DATES.get(seedFixtureKey(tournament, team1, team2, fields[0].trim(), month.padStart(2, '0'))) ?? date;
    }
    if (isBeforeEdition(tournament, date)) continue;
    const location = fields[6] && fields[6].trim() ? fields[6].trim() : null;

    const existing = pickMatchForFeedRow(
      await prisma.match.findMany({ where: { homeTeamId: team1, awayTeamId: team2, tournament } }),
      date,
      claimedMatchIds
    );
    if (existing) {
      // A played match is owned by the results sync.
      if (existing.homeGoals === null) {
        await prisma.match.update({
          where: { id: existing.id },
          data: { date, location, isKnockout: isKnockoutMatch(tournament, date) }
        });
      }
    } else {
      await prisma.match.create({
        data: {
          tournament,
          date,
          homeTeamId: team1,
          awayTeamId: team2,
          homeGoals: null,
          awayGoals: null,
          isKnockout: isKnockoutMatch(tournament, date),
          location,
          ratingChange: 0
        }
      });
    }
    count++;
  }
  return count;
}

// Group assignments come from prisma/seed-data/<code>/groups, and are only
// ever added or corrected here (never truncated, unlike a full reseed), so
// a new tournament reaches a live database on the next sync.
async function ensureGroupAssignments(codes: string[]) {
  for (const code of codes) {
    const groupsPath = path.resolve(__dirname, `../prisma/seed-data/${code}/groups`);
    if (!fs.existsSync(groupsPath)) continue;
    const groups: { [group: string]: string[] } = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
    let count = 0;
    for (const [group, teamIds] of Object.entries(groups)) {
      for (const teamId of teamIds) {
        await prisma.teamTournamentGroup.upsert({
          where: { teamId_tournament: { teamId, tournament: code } },
          update: { group },
          create: { teamId, tournament: code, group }
        });
        count++;
      }
    }
    console.log(`Ensured ${count} ${code} group assignments.`);
  }
}

// A group must hold every match the seed data lists for it. A shortfall means
// fixtures went missing (e.g. two feed rows merged into one), which would
// silently skew every projection for the teams involved, so say so loudly. (The
// count comes from the seed file rather than n * (n - 1) because not every group
// is a full double round-robin: CONCACAF League A's groups are Swiss-style.)
async function warnOnIncompleteGroups(codes: string[]) {
  for (const code of codes) {
    const groupsPath = path.resolve(__dirname, `../prisma/seed-data/${code}/groups`);
    const fixturesPath = path.resolve(__dirname, `../prisma/seed-data/${code}/fixtures`);
    if (!fs.existsSync(groupsPath) || !fs.existsSync(fixturesPath)) continue;
    const groups: { [group: string]: string[] } = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
    const seedFixtures = fs
      .readFileSync(fixturesPath, 'utf8')
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((f) => f.length >= 6 && f[5].trim() === code);
    for (const [group, teamIds] of Object.entries(groups)) {
      const expected = seedFixtures.filter((f) => teamIds.includes(f[3].trim()) && teamIds.includes(f[4].trim())).length;
      const actual = await prisma.match.count({
        where: { tournament: code, homeTeamId: { in: teamIds }, awayTeamId: { in: teamIds } }
      });
      if (actual !== expected) {
        console.warn(`WARNING: ${code} group ${group} has ${actual} matches in the database, expected ${expected}.`);
      }
    }
  }
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
      const resultsCount = await syncResults(resultsData, [source.code], false);
      console.log(`Synced ${resultsCount} ${source.code} match results.`);
    }

    console.log('Fetching Nations League and Africa Cup qualifier results and fixtures from eloratings.net...');
    const nlResultsRes = await session.get(GLOBAL_RESULTS_URL);
    if (nlResultsRes.status === 200) {
      const count = await syncResults(await nlResultsRes.text(), GLOBAL_FEED_CODES, true);
      console.log(`Synced ${count} global-feed match results.`);
    } else {
      console.error(`Skipping global-feed results sync: HTTP ${nlResultsRes.status}`);
    }

    const nlFixturesRes = await session.get(GLOBAL_FIXTURES_URL);
    if (nlFixturesRes.status === 200) {
      const count = await syncFixtures(await nlFixturesRes.text(), GLOBAL_FEED_CODES);
      console.log(`Synced ${count} global-feed fixtures.`);
    } else {
      console.error(`Skipping global-feed fixtures sync: HTTP ${nlFixturesRes.status}`);
    }

    await ensureGroupAssignments(GLOBAL_FEED_CODES);
    await warnOnIncompleteGroups(GLOBAL_FEED_CODES);

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
  // A multi-league config writes one run per league for each milestone.
  const runCodes = (config.leagues ?? [{ code: config.code }]).map((l) => l.code);

  const historicalMilestones = milestones.filter((m): m is { name: string; date: Date } => m.date !== undefined);
  const allHistoricalDatesPassed = historicalMilestones.every((m) => m.date <= now);

  if (allHistoricalDatesPassed) {
    const existingRunsCount = await prisma.simulationRun.count({
      where: {
        tournament: { in: runCodes },
        description: { in: historicalMilestones.map((m) => m.name) }
      }
    });

    if (existingRunsCount === historicalMilestones.length * runCodes.length) {
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
      const existingCount = await prisma.simulationRun.count({
        where: {
          tournament: { in: runCodes },
          description: milestone.name
        }
      });
      if (existingCount === runCodes.length) {
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

    // Official UEFA schedule: league phase 24 Sep - 17 Nov 2026 (6
    // matchdays), promotion/relegation playoffs and League A quarterfinals
    // (two legs) in March 2027, League A Finals (semifinals + third-place
    // playoff/final) 9-13 June 2027. Leagues A-C are simulated together (one
    // run per league is written), so the milestone list is shared. Keep in
    // sync with app/lib/tournaments.ts's ENA/ENB/ENC milestoneDates.
    await runMilestonesForConfig(new NationsLeagueConfig(), [
      { name: 'Start (Pre-tournament)', date: new Date('2026-09-23T23:59:59Z') },
      { name: 'Matchday 1 Completed', date: new Date('2026-09-26T23:59:59Z') },
      { name: 'Matchday 2 Completed', date: new Date('2026-09-29T23:59:59Z') },
      { name: 'Matchday 3 Completed', date: new Date('2026-10-03T23:59:59Z') },
      { name: 'Matchday 4 Completed', date: new Date('2026-10-06T23:59:59Z') },
      { name: 'Matchday 5 Completed', date: new Date('2026-11-14T23:59:59Z') },
      { name: 'Matchday 6 Completed', date: new Date('2026-11-17T23:59:59Z') },
      { name: 'Playoffs & Quarterfinals Completed', date: new Date('2027-03-30T23:59:59Z') },
      { name: 'Semifinals Completed', date: new Date('2027-06-10T23:59:59Z') },
      { name: 'Tournament Completed', date: new Date('2027-06-13T23:59:59Z') },
      { name: 'Current Projections', date: undefined }
    ]);

    // Group stage 24 Sep 2026 - 30 Mar 2027 (6 matchdays). The feed dates
    // matchdays 3-6 by month only; their order comes from the feed's ordering
    // (see prisma/seed-data/FQ/fixtures), with placeholder days inside the
    // Nov 9-17 and Mar 22-30 windows. Revisit the cutoffs below once
    // eloratings.net publishes the real days. Keep in sync with
    // app/lib/tournaments.ts's FQ milestoneDates.
    await runMilestonesForConfig(new AfricaCupQualifiersConfig(), [
      { name: 'Start (Pre-tournament)', date: new Date('2026-09-23T23:59:59Z') },
      { name: 'Matchday 1 Completed', date: new Date('2026-09-27T23:59:59Z') },
      { name: 'Matchday 2 Completed', date: new Date('2026-10-07T23:59:59Z') },
      { name: 'Matchday 3 Completed', date: new Date('2026-11-13T23:59:59Z') },
      { name: 'Matchday 4 Completed', date: new Date('2026-11-17T23:59:59Z') },
      { name: 'Matchday 5 Completed', date: new Date('2027-03-27T23:59:59Z') },
      { name: 'Tournament Completed', date: new Date('2027-03-30T23:59:59Z') },
      { name: 'Current Projections', date: undefined }
    ]);

    // CONCACAF Nations League: each league is simulated on its own. The
    // schedules (and the dashboard's copy of them) live in
    // config/concacafNationsLeague.ts.
    const toMilestones = (schedule: MilestoneSchedule[]) =>
      schedule.map((m) => ({ name: m.name, date: m.date ? new Date(m.date) : undefined }));
    await runMilestonesForConfig(new ConcacafLeagueAConfig(), toMilestones(CLA_MILESTONES));
    await runMilestonesForConfig(new ConcacafLeagueBConfig(), toMilestones(CLB_MILESTONES));
    await runMilestonesForConfig(new ConcacafLeagueCConfig(), toMilestones(CLC_MILESTONES));

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
    } catch {
      // best-effort cleanup; the original error is already logged
    }
    try {
      await dbPrisma.$disconnect();
      if (dbPool) {
        await dbPool.end();
      }
    } catch {
      // best-effort cleanup; the original error is already logged
    }
    process.exit(1);
  });

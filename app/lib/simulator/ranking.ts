// Group ranking shared by the Monte Carlo simulation, which knows every score,
// and the certainty calculation (certainty.ts), which may know only a match's
// outcome (home win, draw or away win).
//
// Every stat is a range [lo, hi]. It is exact when all the matches it counts
// have a known score. An outcome-only match widens it: a win adds 1 or more to
// goal difference with no upper limit, a draw adds exactly 0, and goals scored
// have no upper limit. A criterion splits teams only where their ranges can't
// overlap. Teams whose ranges overlap stay together as an unresolved block and
// are not passed on to the next criterion, since this one might decide them.
// Teams level on every criterion (drawing of lots) are an unresolved block too.

export interface Range {
  lo: number;
  hi: number;
}

export type Outcome = 'H' | 'D' | 'A';

export interface RankingMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  // Set (with null goals) when only the result is known.
  outcome?: Outcome;
}

export type Stat = 'points' | 'goalDifference' | 'goalsFor' | 'awayGoals' | 'wins' | 'awayWins';

const STATS: Stat[] = ['points', 'goalDifference', 'goalsFor', 'awayGoals', 'wins', 'awayWins'];

type Tally = Record<Stat, Range>;

function emptyTally(): Tally {
  const tally = {} as Tally;
  STATS.forEach((s) => (tally[s] = { lo: 0, hi: 0 }));
  return tally;
}

function add(range: Range, lo: number, hi: number = lo) {
  range.lo += lo;
  range.hi += hi;
}

// Adds one match to a team's tally. Matches with neither a score nor an
// outcome (not played yet) count for nothing.
function addMatch(tally: Tally, m: RankingMatch, isHome: boolean) {
  if (m.homeGoals !== null && m.awayGoals !== null) {
    const scored = isHome ? m.homeGoals : m.awayGoals;
    const conceded = isHome ? m.awayGoals : m.homeGoals;
    const won = scored > conceded;
    add(tally.points, won ? 3 : scored === conceded ? 1 : 0);
    add(tally.goalDifference, scored - conceded);
    add(tally.goalsFor, scored);
    if (!isHome) add(tally.awayGoals, scored);
    if (won) add(tally.wins, 1);
    if (won && !isHome) add(tally.awayWins, 1);
    return;
  }
  if (!m.outcome) return;
  const result = m.outcome === 'D' ? 0 : (m.outcome === 'H') === isHome ? 1 : -1;
  add(tally.points, result === 1 ? 3 : result === 0 ? 1 : 0);
  if (result === 1) add(tally.goalDifference, 1, Infinity);
  if (result === -1) add(tally.goalDifference, -Infinity, -1);
  add(tally.goalsFor, result === 1 ? 1 : 0, Infinity);
  if (!isHome) add(tally.awayGoals, result === 1 ? 1 : 0, Infinity);
  if (result === 1) add(tally.wins, 1);
  if (result === 1 && !isHome) add(tally.awayWins, 1);
}

function tallyMatches(matches: RankingMatch[], include: (m: RankingMatch) => boolean): { [teamId: string]: Tally } {
  const tallies: { [teamId: string]: Tally } = {};
  matches.forEach((m) => {
    if (!include(m)) return;
    addMatch((tallies[m.homeTeamId] ??= emptyTally()), m, true);
    addMatch((tallies[m.awayTeamId] ??= emptyTally()), m, false);
  });
  return tallies;
}

const ZERO: Range = { lo: 0, hi: 0 };

export interface OverallRecord {
  points: number;
  goalDifference: number;
  goalsFor: number;
}

// A group's stats: each team's overall record (every match it played) and
// head-to-head records among any subset of teams. Tallies are built lazily,
// since most rankings never need anything past points.
export class MatchStats {
  private overallTallies?: { [teamId: string]: Tally };

  // `overall` supplies exact points, goal difference and goals scored instead
  // of counting them from `matches` (the simulation's running standings).
  constructor(
    private matches: RankingMatch[],
    private overallRecords?: { [teamId: string]: OverallRecord }
  ) {}

  overall(teamId: string, stat: Stat): Range {
    const record = this.overallRecords?.[teamId];
    if (record && (stat === 'points' || stat === 'goalDifference' || stat === 'goalsFor')) {
      return { lo: record[stat], hi: record[stat] };
    }
    this.overallTallies ??= tallyMatches(this.matches, () => true);
    return this.overallTallies[teamId]?.[stat] ?? ZERO;
  }

  // Stats over the matches between teams of `subset` only (every meeting of
  // a pair counts, e.g. both legs of a double round-robin).
  headToHead(subset: string[]): (teamId: string, stat: Stat) => Range {
    const members = new Set(subset);
    const tallies = tallyMatches(this.matches, (m) => members.has(m.homeTeamId) && members.has(m.awayTeamId));
    return (teamId, stat) => tallies[teamId]?.[stat] ?? ZERO;
  }
}

type Criterion = (teamId: string) => Range;

// Splits teams by a criterion, best first. Each block is either level on it
// (every member has the same exact value) or unresolved (overlapping ranges).
function split(teams: string[], criterion: Criterion): { teams: string[]; level: boolean }[] {
  const values = new Map(teams.map((id) => [id, criterion(id)]));
  const v = (id: string) => values.get(id)!;
  const sorted = [...teams].sort((a, b) => {
    if (v(a).hi !== v(b).hi) return v(a).hi < v(b).hi ? 1 : -1;
    if (v(a).lo !== v(b).lo) return v(a).lo < v(b).lo ? 1 : -1;
    return 0;
  });
  // Sorted by upper bound, a team overlaps the block above it exactly when
  // its upper bound reaches the block's lowest lower bound.
  const blocks: string[][] = [];
  let minLo = Infinity;
  sorted.forEach((id) => {
    if (blocks.length > 0 && v(id).hi >= minLo) {
      blocks[blocks.length - 1].push(id);
      minLo = Math.min(minLo, v(id).lo);
    } else {
      blocks.push([id]);
      minLo = v(id).lo;
    }
  });
  return blocks.map((block) => {
    const first = v(block[0]);
    const level = block.every((id) => v(id).lo === v(id).hi && v(id).lo === first.lo && first.lo === first.hi);
    return { teams: block, level };
  });
}

// Applies criteria in order. Teams level on one go on to the next; teams level
// on all of them are handed to `whenLevel`.
function ladder(teams: string[], criteria: Criterion[], whenLevel: (level: string[]) => string[][]): string[][] {
  if (teams.length <= 1) return [teams];
  if (criteria.length === 0) return whenLevel(teams);
  return split(teams, criteria[0]).flatMap((block) =>
    block.teams.length > 1 && block.level ? ladder(block.teams, criteria.slice(1), whenLevel) : [block.teams]
  );
}

const lots = (teams: string[]): string[][] => [teams];

// Overall criteria after goal difference and goals scored, higher first.
// 'awayGoals', 'wins' and 'awayWins' are counted from the group's matches; a
// function supplies any other criterion (e.g. an access-list position).
export type OverallTiebreaker = 'awayGoals' | 'wins' | 'awayWins' | ((teamId: string) => number);

export type GroupRules =
  // Points; then head-to-head points, goal difference and goals scored among
  // the tied teams (and head-to-head away goals if set), re-applied to any
  // smaller subset still tied; then overall goal difference, goals scored and
  // `overall`; then lots. FIFA, UEFA and CAF.
  | { order: 'headToHeadFirst'; headToHeadAwayGoals?: boolean; overall?: OverallTiebreaker[] }
  // Overall points, goal difference and goals scored; then, once, among the
  // tied teams: head-to-head points, then away goals when exactly two are
  // tied, otherwise head-to-head goal difference and goals scored; then lots.
  // Concacaf Nations League (regulations art. 12.6).
  | { order: 'overallFirst' };

// Ranks a group, best first. Each entry is a finishing position, or several
// teams whose order the rules (or, for outcome-only matches, the unknown
// scores) leave open.
export function rankGroup(rules: GroupRules, teams: string[], stats: MatchStats): string[][] {
  const overall = (stat: Stat): Criterion => (id) => stats.overall(id, stat);

  if (rules.order === 'overallFirst') {
    return ladder(teams, [overall('points'), overall('goalDifference'), overall('goalsFor')], (tied) => {
      const h2h = stats.headToHead(tied);
      const on = (stat: Stat): Criterion => (id) => h2h(id, stat);
      const criteria = tied.length === 2
        ? [on('points'), on('awayGoals')]
        : [on('points'), on('goalDifference'), on('goalsFor')];
      return ladder(tied, criteria, lots);
    });
  }

  const overallTiebreakers: Criterion[] = [
    overall('goalDifference'),
    overall('goalsFor'),
    ...(rules.overall ?? []).map((t): Criterion =>
      typeof t === 'function' ? (id) => ({ lo: t(id), hi: t(id) }) : overall(t)
    ),
  ];
  const resolve = (subset: string[]): string[][] => {
    const h2h = stats.headToHead(subset);
    const on = (stat: Stat): Criterion => (id) => h2h(id, stat);
    const criteria = [on('points'), on('goalDifference'), on('goalsFor')];
    if (rules.headToHeadAwayGoals) criteria.push(on('awayGoals'));
    return ladder(subset, criteria, (level) =>
      level.length < subset.length ? resolve(level) : ladder(level, overallTiebreakers, lots)
    );
  };
  return ladder(teams, [overall('points')], resolve);
}

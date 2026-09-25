import { GroupRules, MatchStats, Outcome, Range, RankingMatch, rankGroup } from './ranking';

// Proves milestones certain or impossible from real results, without
// simulation. A Monte Carlo probability of exactly 0 or 1 only says that
// nothing else came up in 10,000 runs; a Certainty is stored only when no
// possible set of results could change it.
//
// Group phase: every remaining group match is tried as a home win, draw or
// away win (3^k scenarios per group). Scores are left open, so goal-based
// tiebreakers are ranges (see ranking.ts): a tie they might decide either way
// leaves the teams' order open. A milestone is CERTAIN if its condition holds
// in every scenario, and IMPOSSIBLE if it fails in every one.
//
// Knockout phase: only finished real ties count. A team that won a stage's
// tie has certainly reached the next stage, and a team that lost one can't
// reach any later stage. A tie in progress (e.g. one leg of two played)
// decides nothing, however lopsided.

export type Certainty = 'CERTAIN' | 'IMPOSSIBLE';

// When a team achieves a milestone, in terms of its group finish and real
// knockout results.
export type Condition =
  // Finishes in positions lo..hi of its group.
  | { position: [number, number] }
  // Finishes in one of the group's first `top` places, where each `automatic`
  // team in the group (already qualified, e.g. a host) takes one of them and
  // the rest go to the other teams in finishing order. Always true for an
  // automatic team.
  | { top: number; automatic?: string[] }
  // Finishes `position` in its group and is among the best (or worst) N of the
  // teams finishing `position` in each of `groups`, compared on points, goal
  // difference and goals scored (then lots).
  | { acrossGroups: { position: number; groups: string[]; best?: number; worst?: number } }
  // Is one of these teams.
  | { team: string[] }
  // Won (or lost) its playoff: a two-legged tie against a team from another
  // league.
  | { playoff: 'won' | 'lost' }
  // Reached this knockout stage by winning the previous one, having entered
  // the knockout phase when `entry` holds. Added automatically for every
  // knockout stage after the first; see withKnockoutStages.
  | { reached: string; entry: Condition }
  | { any: Condition[] }
  | { all: Condition[] };

export type CertaintyRules = { [milestone: string]: Condition };

export interface KnockoutMatch {
  date: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  winnerOverride?: string | null;
}

export interface CertaintyInput {
  rules: CertaintyRules;
  // Milestones to report; those without a rule are left undecided.
  milestones: string[];
  groupRules: GroupRules;
  groups: { [group: string]: string[] };
  // Teams to report on: the group teams plus any that play no group match.
  teamIds: string[];
  // Group matches as of the cutoff; null goals means not played yet.
  groupMatches: RankingMatch[];
  // Every knockout match, with null goals for those not played as of the
  // cutoff. Fixtures after the cutoff still count as evidence of who won an
  // earlier shoot-out (only the winner plays on).
  knockoutMatches: KnockoutMatch[];
  knockoutStages: string[];
  twoLeggedStages?: string[];
  awayGoalsRule?: boolean;
  // Whether two teams play in the same league; a knockout tie between leagues
  // is a playoff. Default: always.
  sameLeague?: (a: string, b: string) => boolean;
}

export type CertaintyTable = { [teamId: string]: { [milestone: string]: Certainty | null } };

// Kleene three-valued logic: null is "could go either way".
type Tri = boolean | null;
const and = (a: Tri, b: Tri): Tri => (a === false || b === false ? false : a === null || b === null ? null : true);
const or = (a: Tri, b: Tri): Tri => (a === true || b === true ? true : a === null || b === null ? null : false);
const not = (a: Tri): Tri => (a === null ? null : !a);

interface Profile {
  points: number;
  goalDifference: Range;
  goalsFor: Range;
}

interface Scenario {
  // The group's ranking: positions, best first; a block of several teams is
  // an order left open.
  blocks: string[][];
  // Null when nothing has been played, so any record is still possible.
  profile: ((teamId: string) => Profile) | null;
}

const OUTCOMES: Outcome[] = ['H', 'D', 'A'];

// Visits every win/draw/loss combination of the group's remaining matches
// until `visit` returns false. A group with no match played yet is a single
// scenario in which every order is possible.
function forEachScenario(
  teams: string[],
  matches: RankingMatch[],
  rules: GroupRules,
  visit: (scenario: Scenario) => boolean
) {
  const played = matches.filter((m) => m.homeGoals !== null && m.awayGoals !== null);
  if (played.length === 0) {
    visit({ blocks: [teams], profile: null });
    return;
  }
  const remaining: RankingMatch[] = matches
    .filter((m) => m.homeGoals === null || m.awayGoals === null)
    .map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: null, awayGoals: null, outcome: 'H' }));
  const all = [...played, ...remaining];

  const step = (i: number): boolean => {
    if (i === remaining.length) {
      const stats = new MatchStats(all);
      return visit({
        blocks: rankGroup(rules, teams, stats),
        profile: (id) => ({
          points: stats.overall(id, 'points').lo,
          goalDifference: stats.overall(id, 'goalDifference'),
          goalsFor: stats.overall(id, 'goalsFor'),
        }),
      });
    }
    for (const outcome of OUTCOMES) {
      remaining[i].outcome = outcome;
      if (!step(i + 1)) return false;
    }
    return true;
  };
  step(0);
}

// A team's possible positions (best, worst) in a ranking, ignoring `excluding`.
function positionRange(blocks: string[][], teamId: string, excluding?: Set<string>): [number, number] | null {
  let position = 1;
  for (const block of blocks) {
    const members = excluding ? block.filter((id) => !excluding.has(id)) : block;
    if (members.includes(teamId)) return [position, position + members.length - 1];
    position += members.length;
  }
  return null;
}

function within(range: [number, number] | null, lo: number, hi: number): Tri {
  if (!range) return false;
  const [best, worst] = range;
  if (best >= lo && worst <= hi) return true;
  if (worst < lo || best > hi) return false;
  return null;
}

// Whether `a` certainly ranks above `b` across groups (points, goal
// difference, goals scored, then lots).
function certainlyAbove(a: Profile, b: Profile): boolean {
  if (a.points !== b.points) return a.points > b.points;
  if (a.goalDifference.lo > b.goalDifference.hi) return true;
  const levelOnGoalDifference =
    a.goalDifference.lo === a.goalDifference.hi &&
    b.goalDifference.lo === b.goalDifference.hi &&
    a.goalDifference.lo === b.goalDifference.lo;
  return levelOnGoalDifference && a.goalsFor.lo > b.goalsFor.hi;
}

const profileKey = (p: Profile) =>
  `${p.points}|${p.goalDifference.lo}|${p.goalDifference.hi}|${p.goalsFor.lo}|${p.goalsFor.hi}`;

// Every record a group's team finishing `position` could have, or 'any' when
// the group hasn't started.
type PositionProfiles = Map<number, Profile[]> | 'any';

interface KnockoutFacts {
  reached: Map<string, Map<string, boolean>>;
  playoff: Map<string, 'won' | 'lost'>;
}

function knockoutFacts(input: CertaintyInput): KnockoutFacts {
  const { knockoutStages, twoLeggedStages = [], awayGoalsRule = false } = input;
  const sameLeague = input.sameLeague ?? (() => true);
  const matches = [...input.knockoutMatches].sort((a, b) => a.date.getTime() - b.date.getTime());
  const involves = (m: KnockoutMatch, t: string) => m.homeTeamId === t || m.awayTeamId === t;
  const opponent = (m: KnockoutMatch, t: string) => (m.homeTeamId === t ? m.awayTeamId : m.homeTeamId);
  const playsAfter = (t: string, date: Date) => matches.some((m) => involves(m, t) && m.date > date);

  // The winner of a finished tie (one match, or both legs), or null if it
  // isn't over or its shoot-out winner can't be told.
  const winnerOf = (legs: KnockoutMatch[]): string | null => {
    if (legs.some((m) => m.homeGoals === null || m.awayGoals === null)) return null;
    const [a, b] = [legs[0].homeTeamId, legs[0].awayTeamId];
    const total = (t: string, awayOnly: boolean) =>
      legs.reduce((sum, m) => {
        if (m.homeTeamId === t && !awayOnly) return sum + m.homeGoals!;
        if (m.awayTeamId === t) return sum + m.awayGoals!;
        return sum;
      }, 0);
    if (total(a, false) !== total(b, false)) return total(a, false) > total(b, false) ? a : b;
    if (awayGoalsRule && legs.length === 2 && total(a, true) !== total(b, true)) {
      return total(a, true) > total(b, true) ? a : b;
    }
    const override = legs.map((m) => m.winnerOverride).find((w) => w === a || w === b);
    if (override) return override;
    // Decided on penalties: the winner is the one that plays on, if only one does.
    const last = legs[legs.length - 1].date;
    const aOn = playsAfter(a, last);
    const bOn = playsAfter(b, last);
    return aOn !== bOn ? (aOn ? a : b) : null;
  };

  const facts: KnockoutFacts = { reached: new Map(), playoff: new Map() };
  input.teamIds.forEach((t) => {
    const own = matches.filter((m) => involves(m, t));
    const reached = new Map<string, boolean>();
    facts.reached.set(t, reached);

    // The title ladder: a team's ties against its own league are its stages
    // in order, so its i-th finished tie is stage i. It stops at a loss (a
    // third-place match comes after one) or a tie that isn't over.
    const ladder = own.filter((m) => sameLeague(t, opponent(m, t)));
    let next = 0;
    for (let i = 0; i < knockoutStages.length - 1; i++) {
      const legCount = twoLeggedStages.includes(knockoutStages[i]) ? 2 : 1;
      const legs = ladder.slice(next, next + legCount);
      if (legs.length < legCount || legs.some((m) => opponent(m, t) !== opponent(legs[0], t))) break;
      const winner = winnerOf(legs);
      if (winner === null) break;
      next += legCount;
      if (winner === t) {
        reached.set(knockoutStages[i + 1], true);
      } else {
        knockoutStages.slice(i + 1).forEach((stage) => reached.set(stage, false));
        break;
      }
    }

    const playoff = own.filter((m) => !sameLeague(t, opponent(m, t))).slice(0, 2);
    if (playoff.length === 2 && opponent(playoff[0], t) === opponent(playoff[1], t)) {
      const winner = winnerOf(playoff);
      if (winner) facts.playoff.set(t, winner === t ? 'won' : 'lost');
    }
  });
  return facts;
}

// Each knockout stage after the first is reached by winning the one before,
// having entered through the first stage's condition.
export function withKnockoutStages(rules: CertaintyRules, knockoutStages: string[]): CertaintyRules {
  const entry = rules[knockoutStages[0]];
  if (!entry) return rules;
  const result = { ...rules };
  knockoutStages.slice(1).forEach((stage) => {
    result[stage] ??= { reached: stage, entry };
  });
  return result;
}

function walk(condition: Condition, visit: (c: Condition) => void) {
  visit(condition);
  if ('any' in condition) condition.any.forEach((c) => walk(c, visit));
  if ('all' in condition) condition.all.forEach((c) => walk(c, visit));
  if ('reached' in condition) walk(condition.entry, visit);
}

export function computeCertainty(input: CertaintyInput): CertaintyTable {
  const rules = withKnockoutStages(input.rules, input.knockoutStages);
  const milestones = input.milestones.filter((m) => rules[m]);
  const groupOf = new Map<string, string>();
  Object.entries(input.groups).forEach(([g, teams]) => teams.forEach((t) => groupOf.set(t, g)));
  const matchesOf = (g: string) => input.groupMatches.filter((m) => groupOf.get(m.homeTeamId) === g);
  const facts = knockoutFacts(input);

  // Pass 1: the records the teams finishing each position referenced by an
  // acrossGroups condition could have, per group.
  const referenced = new Map<string, Set<number>>();
  milestones.forEach((m) =>
    walk(rules[m], (c) => {
      if (!('acrossGroups' in c)) return;
      c.acrossGroups.groups.forEach((g) => {
        if (!referenced.has(g)) referenced.set(g, new Set());
        referenced.get(g)!.add(c.acrossGroups.position);
      });
    })
  );
  const profilesAt = new Map<string, PositionProfiles>();
  referenced.forEach((positions, g) => {
    const teams = input.groups[g] ?? [];
    const seen = new Map<number, Map<string, Profile>>();
    positions.forEach((p) => seen.set(p, new Map()));
    let started = true;
    forEachScenario(teams, matchesOf(g), input.groupRules, ({ blocks, profile }) => {
      if (!profile) {
        started = false;
        return false;
      }
      positions.forEach((p) => {
        teams.forEach((t) => {
          if (within(positionRange(blocks, t), p, p) === false) return;
          const record = profile(t);
          seen.get(p)!.set(profileKey(record), record);
        });
      });
      return true;
    });
    profilesAt.set(g, started ? new Map([...seen].map(([p, records]) => [p, [...records.values()]])) : 'any');
  });

  // Whether a team with `record`, finishing `position` in group `own`, is
  // among the best `count` such teams of `groups`.
  const amongBestMemo = new Map<string, Tri>();
  const amongBest = (groups: string[], own: string, position: number, record: Profile, count: number): Tri => {
    const key = `${groups.join(',')}|${own}|${position}|${count}|${profileKey(record)}`;
    if (amongBestMemo.has(key)) return amongBestMemo.get(key)!;
    let couldBeAhead = 0;
    let certainlyAhead = 0;
    groups.forEach((g) => {
      if (g === own) return;
      const records = profilesAt.get(g);
      if (records === 'any') {
        couldBeAhead++;
        return;
      }
      const options = records?.get(position) ?? [];
      if (options.length === 0) return;
      if (options.some((r) => !certainlyAbove(record, r))) couldBeAhead++;
      if (options.every((r) => certainlyAbove(r, record))) certainlyAhead++;
    });
    const result: Tri = couldBeAhead < count ? true : certainlyAhead >= count ? false : null;
    amongBestMemo.set(key, result);
    return result;
  };

  // A condition's value for a team finishing exactly `position` in its group
  // (null for a team outside the groups).
  const evaluate = (c: Condition, teamId: string, scenario: Scenario | null, position: number | null): Tri => {
    const group = groupOf.get(teamId);
    if ('team' in c) return c.team.includes(teamId);
    if ('position' in c) return position !== null && position >= c.position[0] && position <= c.position[1];
    if ('top' in c) {
      const automatic = new Set(c.automatic ?? []);
      if (automatic.has(teamId)) return true;
      if (!scenario || !group) return false;
      const places = c.top - input.groups[group].filter((id) => automatic.has(id)).length;
      if (places <= 0) return false;
      return within(positionRange(scenario.blocks, teamId, automatic), 1, places);
    }
    if ('acrossGroups' in c) {
      const { groups, best, worst } = c.acrossGroups;
      if (position !== c.acrossGroups.position || !scenario || !group || !groups.includes(group)) return false;
      if (!scenario.profile) return null;
      const record = scenario.profile(teamId);
      return best !== undefined
        ? amongBest(groups, group, position, record, best)
        : not(amongBest(groups, group, position, record, groups.length - (worst ?? 0)));
    }
    if ('playoff' in c) {
      const result = facts.playoff.get(teamId);
      return result === undefined ? null : result === c.playoff;
    }
    if ('reached' in c) {
      const reached = facts.reached.get(teamId)?.get(c.reached);
      return reached !== undefined ? reached : and(evaluate(c.entry, teamId, scenario, position), null);
    }
    if ('any' in c) return c.any.reduce<Tri>((acc, sub) => or(acc, evaluate(sub, teamId, scenario, position)), false);
    return c.all.reduce<Tri>((acc, sub) => and(acc, evaluate(sub, teamId, scenario, position)), true);
  };

  // A condition's value in a scenario: where the team's position is open,
  // it holds (or fails) only if it does in every position it could take.
  // Evaluating each position separately keeps "1st, or 2nd and among the best
  // runners-up" true for a team sure to be one of the two.
  const evaluateIn = (c: Condition, teamId: string, scenario: Scenario | null): Tri => {
    const range = scenario ? positionRange(scenario.blocks, teamId) : null;
    if (!range) return evaluate(c, teamId, scenario, null);
    let result: Tri | undefined;
    for (let p = range[0]; p <= range[1]; p++) {
      const value = evaluate(c, teamId, scenario, p);
      if (result !== undefined && value !== result) return null;
      result = value;
    }
    return result ?? null;
  };

  // Pass 2: each team's milestones over every scenario of its group, stopping
  // once each has been seen both not true and not false (undecided).
  const table: CertaintyTable = {};
  const decide = (teams: string[], scenarios: (visit: (s: Scenario | null) => boolean) => void) => {
    const notTrue = new Set<string>();
    const notFalse = new Set<string>();
    let open = teams.length * milestones.length;
    scenarios((scenario) => {
      teams.forEach((t) => {
        milestones.forEach((m) => {
          const key = `${t}|${m}`;
          if (notTrue.has(key) && notFalse.has(key)) return;
          const value = evaluateIn(rules[m], t, scenario);
          if (value !== true) notTrue.add(key);
          if (value !== false) notFalse.add(key);
          if (notTrue.has(key) && notFalse.has(key)) open--;
        });
      });
      return open > 0;
    });
    teams.forEach((t) => {
      table[t] = {};
      input.milestones.forEach((m) => {
        const key = `${t}|${m}`;
        table[t][m] = !milestones.includes(m) ? null : !notTrue.has(key) ? 'CERTAIN' : !notFalse.has(key) ? 'IMPOSSIBLE' : null;
      });
    });
  };

  Object.entries(input.groups).forEach(([g, teams]) => {
    const reported = teams.filter((t) => input.teamIds.includes(t));
    if (reported.length === 0) return;
    decide(reported, (visit) => forEachScenario(teams, matchesOf(g), input.groupRules, visit));
  });
  const groupless = input.teamIds.filter((t) => !groupOf.has(t));
  if (groupless.length > 0) decide(groupless, (visit) => visit(null));

  return table;
}

# Tournament Simulation Framework

This directory houses the TypeScript tournament simulation framework. It utilizes Monte Carlo analysis (10,000 runs) and ELO ratings to project group stage outcomes and recursively simulate knockout brackets.

---

## Directory Structure

* `types.ts`: Core type definitions for standings, match statistics, and the tournament config contract.
* `engine.ts`: Generic Monte Carlo simulation engine. Loads data, simulates unplayed group and knockout matches, and writes outcomes to Neon DB.
* `math.ts`: Core probability equations. Generates score margins, calculates rating updates, and manages ELO formulas.
* `ranking.ts`: Group ranking from tiebreaker rules given as data (`GroupRules`). Stats are ranges, so it can also rank a scenario where only match outcomes are known.
* `certainty.ts`: Proves milestones `CERTAIN` or `IMPOSSIBLE` from real results (no simulation); stored as `Prediction.certainty`. See "Certainty" below.
* `config/`: Configuration adapters for individual tournaments.
  * `base.ts`: Group sorting (`sortGroup`), the FIFA/CAF/Concacaf tiebreaker rule sets, and cross-group ranking.
  * `worldCup.ts`: 2026 World Cup adapter (12 groups, best 8 third-place qualifiers, 32-team knockout bracket).
  * `worldCupMatchupScenarios.ts`: Matrix index lookup for matching World Cup third-place teams.
  * `nationsLeagueA.ts`: 2026-27 UEFA Nations League A adapter (4 double round-robin groups, two-legged quarterfinals, Finals with a dynamically chosen host).
  * `africaCupQualifiers.ts`: 2027 Africa Cup of Nations qualifiers (12 double round-robin groups, top two qualify, hosts already qualified; `qualified` is the only milestone).
  * `concacafNationsLeague.ts`: 2026-27 CONCACAF Nations League Leagues A, B and C (one config each; League A has seeded teams, two-legged quarter-finals and a Finals).
  * `nationsLeague.ts`: Leagues A-C simulated together, with the cross-league promotion/relegation playoffs (see below).

---

## Simulating Several Leagues Together

When outcomes in one tournament depend on another's (Nations League promotion/relegation playoffs pair a League B runner-up with a League A third-place team from the *same* iteration), a single config can drive several source tournaments. The optional `TournamentConfig` hooks for this (all ignored by single-tournament configs like `WorldCup48Config`):

* `sourceTournaments` / `leagues`: load `Match` and `TeamTournamentGroup` rows for several tournament codes, and write one `SimulationRun` + `Prediction` set per league, each limited to that league's `milestones`. `groups` and `milestones` on the config are the union across leagues.
* `buildPlayoffTies` / `evaluatePlayoffMilestones`: cross-league two-legged ties after the group phase, resolved by the same machinery as knockout ties. Prefer real drawn fixtures (passed in as `knownFixtures`) over an invented draw.
* `hostsHomeMatch`: whether a home team actually gets the home-advantage boost (e.g. associations that cannot currently host). Applies to group fixtures and two-legged ties.

`NationsLeagueConfig` (`config/nationsLeague.ts`) is the worked example.

### Other opt-in `TournamentConfig` hooks

* `additionalTeamIds`: teams tracked (a milestone row each) although they play no group match, e.g. teams seeded straight into the knockout phase.
* `twoLeggedAwayGoals`: a two-legged tie level on aggregate is decided by away goals before the shoot-out (`ties.ts`).
* `orderStageWinners`: orders a round's winners before they are paired for the next round, for formats that seed the next round by results (each result carries both teams' records over the two legs) rather than bracket position. It must return the same winners, reordered.

Group sorting lives in `config/base.ts`: `sortGroup(teams, matches, rules)` with a `GroupRules` value (`FIFA_TIEBREAKERS`, `CAF_TIEBREAKERS`, `CONCACAF_NATIONS_LEAGUE_TIEBREAKERS`, or UEFA's in `nationsLeagueTiebreakers.ts`), and `rankAcrossGroups` (compare same-position teams across groups). `NationsLeagueConfig`'s `code` is `'EN'`, which is not a database tournament code; results land under `ENA`/`ENB`/`ENC`.

---

## Certainty

A simulated probability of exactly 0 or 1 only means nothing else came up in 10,000 runs. `certainty.ts` proves a milestone certain or impossible from the real results as of the run's cutoff, and the dashboard shows 100% / "—" only then.

* **Group phase**: every remaining group match is tried as a home win, draw or away win (3^k scenarios per group) and ranked with `ranking.ts`, leaving scores open: a win adds 1 or more to goal difference with no upper limit. Where a tiebreaker could fall either way the teams' order stays open, so a lead that only goal difference protects is never certain. A milestone is `CERTAIN` if its condition holds in every scenario, `IMPOSSIBLE` if it fails in every one.
* **Knockout phase**: only finished real ties count. A two-legged tie (`twoLeggedStages`) is decided only once both legs are played. The winner has certainly reached the next stage, the loser can't reach any later one. Shoot-out winners come from `Match.winnerOverride` or from who plays on.
* **Rules**: a config sets `groupRules` (the tiebreakers `sortGroupStandings` applies) and `certainty`, a `Condition` per milestone (per `League` for a multi-league config): a group `position` range, `top` N places with `automatic` qualifiers, `acrossGroups` (best/worst N of the teams finishing a position), `team`, a cross-league `playoff` result, combined with `any`/`all`. Rules cover the group-phase milestones and the first knockout stage; later knockout stages are derived. The engine warns when a proven milestone's simulated probability disagrees, which points at a rule that doesn't match the format.

---

## How to Add a New Tournament

Adding a new tournament to the simulation engine requires two steps:

### 1. Seed the Database
Ensure your teams, fixtures, and historical results for the new tournament are populated in the database. Use a unique code (e.g. `'EC28'` for Euro 2028).

### 2. Implement the `TournamentConfig` Adapter
Create a new file in `app/lib/simulator/config/` (e.g., `euro2028.ts`) that implements the `TournamentConfig` interface:

```typescript
import { TournamentConfig, TeamStats, GroupStandings, Matchup, Match } from '../types';
import { CertaintyRules } from '../certainty';
import { sortGroup, FIFA_TIEBREAKERS } from './base';

export class Euro2028Config implements TournamentConfig {
  code = 'EC28';
  name = 'Euro 2028';
  groups = ['A', 'B', 'C', 'D', 'E', 'F'];
  knockoutStages = ['roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'];
  groupStageDefaultLocation = 'DE'; // Default host nation ELO advantage

  getKnockoutMatchLocation(stageName: string, matchIndex: number): string | null {
    return 'DE'; // Host ELO boost mappings if applicable
  }

  groupRules = FIFA_TIEBREAKERS;

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    return sortGroup(teams, matches, this.groupRules);
  }

  // Optional, for Prediction.certainty: when each milestone is achieved
  // (the top two of each group and the best four third-placed teams).
  certainty: CertaintyRules = {
    roundOf16: { any: [{ position: [1, 2] }, { acrossGroups: { position: 3, groups: this.groups, best: 4 } }] },
  };

  buildKnockoutBracket(groupStandings: GroupStandings): Matchup[] {
    // 1. Extract qualified teams from groupStandings (e.g. groupStandings['A'][0] for A1)
    // 2. Map group standings rankings to initial roundOf16 pairings
    const matchups: Matchup[] = [];
    matchups.push({
      homeTeamId: groupStandings['A'][0].teamId, // A1
      awayTeamId: groupStandings['B'][1].teamId, // B2
      isKnockout: true,
      stageName: 'roundOf16'
    });
    // ... complete all pairings
    return matchups;
  }
}
```

---

## How to Run Simulations

### Script / Cron Automation Trigger
Instantiate and execute via `tsx` scripts (e.g. at the end of database sync runs):
```typescript
import { SimulatorEngine } from '../app/lib/simulator/engine';
import { WorldCup48Config } from '../app/lib/simulator/config/worldCup';

async function main() {
  const engine = new SimulatorEngine(new WorldCup48Config(), 10000);
  await engine.runSimulation();
}
main();
```

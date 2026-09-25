# Tournament Simulation Framework

This directory houses the TypeScript tournament simulation framework. It utilizes Monte Carlo analysis (10,000 runs) and ELO ratings to project group stage outcomes and recursively simulate knockout brackets.

---

## Directory Structure

* `types.ts`: Core type definitions for standings, match statistics, and the tournament config contract.
* `engine.ts`: Generic Monte Carlo simulation engine. Loads data, simulates unplayed group and knockout matches, and writes outcomes to Neon DB.
* `math.ts`: Core probability equations. Generates score margins, calculates rating updates, and manages ELO formulas.
* `config/`: Configuration adapters for individual tournaments.
  * `base.ts`: Standard tiebreakers and Head-to-Head (H2H) group sorting.
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

Group sorting helpers live in `config/base.ts`: `sortGroupTeamsWithH2H` / `sortDoubleRoundRobinGroup` (head-to-head first: FIFA, UEFA, CAF), `sortOverallThenH2H` (overall record first: Concacaf Nations League) and `rankAcrossGroups` (compare same-position teams across groups). Its `code` is `'EN'`, which is not a database tournament code; results land under `ENA`/`ENB`/`ENC`.

---

## How to Add a New Tournament

Adding a new tournament to the simulation engine requires two steps:

### 1. Seed the Database
Ensure your teams, fixtures, and historical results for the new tournament are populated in the database. Use a unique code (e.g. `'EC28'` for Euro 2028).

### 2. Implement the `TournamentConfig` Adapter
Create a new file in `app/lib/simulator/config/` (e.g., `euro2028.ts`) that implements the `TournamentConfig` interface:

```typescript
import { TournamentConfig, TeamStats, GroupStandings, Matchup, Match } from '../types';
import { sortGroupTeamsStandard, sortGroupTeamsWithH2H } from './base';

export class Euro2028Config implements TournamentConfig {
  code = 'EC28';
  name = 'Euro 2028';
  groups = ['A', 'B', 'C', 'D', 'E', 'F'];
  knockoutStages = ['roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'];
  groupStageDefaultLocation = 'DE'; // Default host nation ELO advantage

  getKnockoutMatchLocation(stageName: string, matchIndex: number): string | null {
    return 'DE'; // Host ELO boost mappings if applicable
  }

  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[] {
    const getMatchResult = (teamA: string, teamB: string) => {
      const match = matches.find(
        (m) =>
          ((m.homeTeamId === teamA && m.awayTeamId === teamB) ||
            (m.homeTeamId === teamB && m.awayTeamId === teamA))
      );
      if (match && match.homeGoals !== null && match.awayGoals !== null) {
        return {
          team1: match.homeTeamId,
          team2: match.awayTeamId,
          score1: match.homeGoals,
          score2: match.awayGoals,
        };
      }
      return null;
    };
    // Choose sortGroupTeamsWithH2H or sortGroupTeamsStandard
    return sortGroupTeamsWithH2H(teams, getMatchResult);
  }

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

# Tournament Simulation Framework

This directory houses the TypeScript tournament simulation framework. It utilizes Monte Carlo analysis (10,000 runs) and ELO ratings to project group stage outcomes and recursively simulate knockout brackets.

---

## Directory Structure

* `types.ts`: Core type definitions for standings, match statistics, and the tournament config contract.
* `engine.ts`: Generic Monte Carlo simulation engine. Loads data, simulates unplayed group and knockout matches, and writes outcomes to Neon DB.
* `math.ts`: Core probability equations. Generates score margins, calculates rating updates, and manages ELO formulas.
* `config/`: Configuration adapters for individual tournaments.
  * `base.ts`: Standard tiebreakers and Head-to-Head (H2H) group sorting.
  * `worldCup.ts`: World Cup 2026 adapter (12 groups, best 8 third-place qualifiers, 32-team knockout bracket).
  * `worldCupMatchupScenarios.ts`: Matrix index lookup for matching World Cup third-place teams.

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

### Web/Dashboard Trigger
Instantiate the `SimulatorEngine` inside a Next.js Server Action or API route:
```typescript
import { SimulatorEngine } from '@/app/lib/simulator/engine';
import { WorldCup48Config } from '@/app/lib/simulator/config/worldCup';

export async function runSimulationAction() {
  const engine = new SimulatorEngine(new WorldCup48Config(), 10000);
  await engine.runSimulation();
}
```

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

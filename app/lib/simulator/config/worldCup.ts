import { TournamentConfig, GroupStandings, Matchup, TeamStats, Match } from '../types';
import { sortGroupTeamsWithH2H, compareStats } from './base';
import { matchupIndices } from './worldCupMatchupScenarios';

export class WorldCup48Config implements TournamentConfig {
  code = 'WC';
  name = '2026 World Cup';
  groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  knockoutStages = ['roundOf32', 'roundOf16', 'quarterfinals', 'semifinals', 'final', 'champions'];
  groupStageDefaultLocation = 'US';

  private locationsWC = [
    "US", "US", "US", "MX", "CA", "US", "US", "US", "US", "US",
    "MX", "US", "US", "US", "CA", "US", "US", "US", "US", "US",
    "US", "MX", "US", "CA", "US", "US", "US", "US", "US", "US", "US"
  ];

  getKnockoutMatchLocation(stageName: string, matchIndex: number): string | null {
    let offset = 0;
    if (stageName === 'roundOf16') offset = 16;
    else if (stageName === 'quarterfinals') offset = 24;
    else if (stageName === 'semifinals') offset = 28;
    else if (stageName === 'final') offset = 30;
    
    const globalIndex = offset + matchIndex;
    return this.locationsWC[globalIndex % this.locationsWC.length];
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
    return sortGroupTeamsWithH2H(teams, getMatchResult);
  }

  buildKnockoutBracket(groupStandings: GroupStandings): Matchup[] {
    // 1. Collect all 3rd place teams
    const thirdPlaceTeams: TeamStats[] = [];
    for (const group of this.groups) {
      const standings = groupStandings[group];
      if (standings && standings.length >= 3) {
        thirdPlaceTeams.push(standings[2]);
      }
    }

    // 2. Find the best 8 third-place teams (sorted by stats, then randomly)
    const sortedThirdPlaces = [...thirdPlaceTeams].sort((a, b) => {
      const diff = compareStats(a, b);
      if (diff !== 0) return diff;
      return Math.random() - 0.5;
    });

    const best8ThirdPlaces = sortedThirdPlaces.slice(0, 8);

    // 3. Sort alphabetically by group letter
    best8ThirdPlaces.sort((a, b) => a.group.localeCompare(b.group));

    // 4. Construct scenario key (e.g. "ABCDEFGH")
    const scenarioKey = best8ThirdPlaces.map((t) => t.group).join('');
    const scenarioIndices = matchupIndices[scenarioKey];

    if (!scenarioIndices) {
      throw new Error(`Invalid World Cup third-place scenario combination: ${scenarioKey}`);
    }

    const getTeam = (group: string, rank: number): string => {
      const team = groupStandings[group]?.[rank - 1]?.teamId;
      if (!team) throw new Error(`Missing team at rank ${rank} in Group ${group}`);
      return team;
    };

    const getThirdPlaceTeam = (scenarioIndex: number): string => {
      const team = best8ThirdPlaces[scenarioIndex]?.teamId;
      if (!team) throw new Error(`Missing third-place team for scenario index ${scenarioIndex}`);
      return team;
    };

    const matchups: Matchup[] = [];
    
    // E1 vs 3rd Place [3]
    matchups.push({ homeTeamId: getTeam('E', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[3]), isKnockout: true, stageName: 'roundOf32' });
    
    // I1 vs 3rd Place [5]
    matchups.push({ homeTeamId: getTeam('I', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[5]), isKnockout: true, stageName: 'roundOf32' });
    
    // A2 vs B2
    matchups.push({ homeTeamId: getTeam('A', 2), awayTeamId: getTeam('B', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // F1 vs C2
    matchups.push({ homeTeamId: getTeam('F', 1), awayTeamId: getTeam('C', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // K2 vs L2
    matchups.push({ homeTeamId: getTeam('K', 2), awayTeamId: getTeam('L', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // H1 vs J2
    matchups.push({ homeTeamId: getTeam('H', 1), awayTeamId: getTeam('J', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // D1 vs 3rd Place [2]
    matchups.push({ homeTeamId: getTeam('D', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[2]), isKnockout: true, stageName: 'roundOf32' });
    
    // G1 vs 3rd Place [4]
    matchups.push({ homeTeamId: getTeam('G', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[4]), isKnockout: true, stageName: 'roundOf32' });
    
    // C1 vs F2
    matchups.push({ homeTeamId: getTeam('C', 1), awayTeamId: getTeam('F', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // E2 vs I2
    matchups.push({ homeTeamId: getTeam('E', 2), awayTeamId: getTeam('I', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // A1 vs 3rd Place [0]
    matchups.push({ homeTeamId: getTeam('A', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[0]), isKnockout: true, stageName: 'roundOf32' });
    
    // L1 vs 3rd Place [7]
    matchups.push({ homeTeamId: getTeam('L', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[7]), isKnockout: true, stageName: 'roundOf32' });
    
    // J1 vs H2
    matchups.push({ homeTeamId: getTeam('J', 1), awayTeamId: getTeam('H', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // D2 vs G2
    matchups.push({ homeTeamId: getTeam('D', 2), awayTeamId: getTeam('G', 2), isKnockout: true, stageName: 'roundOf32' });
    
    // B1 vs 3rd Place [1]
    matchups.push({ homeTeamId: getTeam('B', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[1]), isKnockout: true, stageName: 'roundOf32' });
    
    // K1 vs 3rd Place [6]
    matchups.push({ homeTeamId: getTeam('K', 1), awayTeamId: getThirdPlaceTeam(scenarioIndices[6]), isKnockout: true, stageName: 'roundOf32' });

    return matchups;
  }
}

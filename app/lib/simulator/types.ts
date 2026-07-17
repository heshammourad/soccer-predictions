export interface Team {
  id: string;
  name: string;
  currentElo: number;
  group: string | null;
}

export interface TeamStats {
  teamId: string;
  group: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
}

export type GroupStandings = { [groupLetter: string]: TeamStats[] };

export interface Match {
  id: number;
  tournament: string;
  date: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  isKnockout: boolean;
  location: string | null;
  ratingChange: number;
}

export interface Matchup {
  homeTeamId: string;
  awayTeamId: string;
  isKnockout: boolean;
  stageName: string;
}

export interface KnockoutStage {
  name: string;
  teamsCount: number;
}

export interface TournamentConfig {
  code: string;
  name: string;
  groups: string[];
  knockoutStages: string[];
  groupStageDefaultLocation: string | null;
  
  // Return the location code for a knockout match at index in the stage
  getKnockoutMatchLocation(stageName: string, matchIndex: number): string | null;
  
  // Custom sorting function for group standings
  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[];
  
  // Determine initial matches of the knockout phase
  buildKnockoutBracket(groupStandings: GroupStandings): Matchup[];
}

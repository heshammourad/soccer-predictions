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
  // Two-legged ties: matchups sharing a tieId are aggregated (summed goals,
  // penalties on aggregate deadlock) instead of decided on a single match.
  // tieLeg=1 is played at homeTeamId's ground, tieLeg=2 at awayTeamId's
  // ground (the away side of leg 1 hosts leg 2), matching the common
  // "away-goals-abolished" two-legged format.
  tieId?: string;
  tieLeg?: 1 | 2;
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

  // Every outcome this tournament tracks and persists as a Prediction row,
  // in display order (e.g. WC: ['winGroup','roundOf32',...,'champions']).
  // Each tournament declares its own shape independently, so one config's
  // milestones never affect another's — a qualifiers-style tournament with
  // no single "champion" can declare an entirely different set.
  milestones: string[];

  // Return the location code for a knockout match at index in the stage
  getKnockoutMatchLocation(stageName: string, matchIndex: number): string | null;

  // Custom sorting function for group standings
  sortGroupStandings(teams: TeamStats[], matches: Match[]): TeamStats[];

  // Determine initial matches of the knockout phase. knownKnockoutFixtures
  // are already-scheduled/played knockout Match rows for this tournament
  // (e.g. a real bracket pairing announced by a draw after the group
  // stage) — implementations should prefer them over an invented pairing
  // once they exist.
  buildKnockoutBracket(groupStandings: GroupStandings, knownKnockoutFixtures: Match[]): Matchup[];

  // Optional: award group-phase milestones (e.g. "winGroup") per team.
  // Called once per Monte Carlo iteration with that iteration's ranked
  // standings. Tournaments with no group-phase milestone can omit this.
  evaluateGroupPhaseMilestones?(rankedStandings: GroupStandings): { [teamId: string]: string[] };

  // Optional: stage names whose host isn't fixed by the bracket (e.g. a
  // Finals host chosen among the remaining teams, unlike a QF leg whose
  // host is structurally determined). selectDynamicHost is called once per
  // iteration the first time such a stage is reached; its result is reused
  // as that team's home venue for the rest of the iteration.
  dynamicHostStages?: string[];
  selectDynamicHost?(stageName: string, candidateTeamIds: string[]): string | null;
}

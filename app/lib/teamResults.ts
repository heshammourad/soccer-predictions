// A team's played matches in one tournament, from its own point of view, for
// the dashboard's per-team results tooltip.
import { isBigSwing, preMatchOdds, upsetWinner } from './matchOdds';

export interface ResultMatch {
  id: number;
  date: string | Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  isKnockout: boolean;
  location: string | null;
  resultSyncedAt?: string | Date | null;
  // Both needed for the rating change and pre-match odds.
  tournament?: string;
  ratingChange?: number;
  homeTeam?: { name: string };
  awayTeam?: { name: string };
}

export interface TeamResult {
  matchId: number;
  date: Date;
  stage: string;
  // 'v' at home, '@' away, 'n' at a neutral venue.
  venue: 'v' | '@' | 'n';
  opponentId: string;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
  outcome: 'W' | 'D' | 'L';
  isNew: boolean;
  // The team's rating gain and its pre-match chance of winning, when known.
  ratingChange: number | null;
  winChance: number | null;
  // The rating change is big for this tournament's K-factor.
  isBigSwing: boolean;
  // Won with less than UPSET_THRESHOLD chance beforehand.
  isUpset: boolean;
}

// Short labels for the knockout rounds, keyed by the milestone a round ends
// with (minus " Completed"). The last round ("Tournament Completed") is the
// final, or the third-place match for a team that lost its semifinal.
const KNOCKOUT_ROUND_LABELS: { [round: string]: string } = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  Quarterfinals: 'QF',
  Semifinals: 'SF',
  Tournament: 'F',
};

// Whether a result was first recorded by the latest sync.
export function isNewResult(match: ResultMatch, lastSyncStartedAt: string | Date | null): boolean {
  if (!match.resultSyncedAt || !lastSyncStartedAt) return false;
  return new Date(match.resultSyncedAt).getTime() >= new Date(lastSyncStartedAt).getTime();
}

// "GS" for a group/league-phase match; a knockout match is named after the
// first milestone dated on or after it (e.g. "Round of 16 Completed" -> R16),
// or "KO" when that milestone doesn't name a single round.
function knockoutRound(date: Date, milestoneDates: { [description: string]: string | undefined }): string {
  const next = Object.entries(milestoneDates)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, d]) => ({ name, time: new Date(d).getTime() }))
    .filter((m) => m.time >= date.getTime())
    .sort((a, b) => a.time - b.time)[0];
  const round = next?.name.replace(/ Completed$/, '');
  return (round && KNOCKOUT_ROUND_LABELS[round]) ?? 'KO';
}

export function teamResults(
  teamId: string,
  matches: ResultMatch[],
  milestoneDates: { [description: string]: string | undefined },
  lastSyncStartedAt: string | Date | null
): TeamResult[] {
  const rows: TeamResult[] = matches
    .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.homeGoals !== null && m.awayGoals !== null)
    .map((m): TeamResult => {
      const isHome = m.homeTeamId === teamId;
      const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
      const goalsFor = (isHome ? m.homeGoals : m.awayGoals) as number;
      const goalsAgainst = (isHome ? m.awayGoals : m.homeGoals) as number;
      const date = new Date(m.date);
      // The feed records every result's venue; a missing one means the home side's ground.
      const location = m.location ?? m.homeTeamId;
      const oddsMatch =
        m.tournament !== undefined && m.ratingChange !== undefined
          ? { tournament: m.tournament, homeGoals: m.homeGoals, awayGoals: m.awayGoals, ratingChange: m.ratingChange }
          : null;
      const odds = oddsMatch && preMatchOdds(oddsMatch);
      return {
        matchId: m.id,
        date,
        stage: m.isKnockout ? knockoutRound(date, milestoneDates) : 'GS',
        venue: location === teamId ? 'v' : location === opponentId ? '@' : 'n',
        opponentId,
        opponentName: (isHome ? m.awayTeam?.name : m.homeTeam?.name) ?? opponentId,
        goalsFor,
        goalsAgainst,
        outcome: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
        isNew: isNewResult(m, lastSyncStartedAt),
        ratingChange: oddsMatch ? (isHome ? oddsMatch.ratingChange : -oddsMatch.ratingChange) : null,
        winChance: odds ? (isHome ? odds.homeWin : odds.awayWin) : null,
        isBigSwing: oddsMatch !== null && isBigSwing(oddsMatch.ratingChange, oddsMatch.tournament),
        isUpset: oddsMatch !== null && upsetWinner(oddsMatch, odds) === (isHome ? 'home' : 'away'),
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Semifinal losers meet again in the last round: that's the third-place match.
  rows.forEach((row, i) => {
    const previous = rows[i - 1];
    if (row.stage === 'F' && previous?.stage === 'SF' && previous.outcome === 'L') row.stage = '3P';
  });
  return rows;
}

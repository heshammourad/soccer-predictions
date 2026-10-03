// Win/draw/loss chances of a match from the simulator's model. For a played
// match they're recovered from eloratings.net's own rating change: the change
// is K * goalDifferenceMultiplier * (result - expected), so the expected
// result (home advantage included) falls out exactly, up to the change's
// rounding, and with it the rating gap. A fixture's come from the ratings.
import { getProbabilities, getWeight, goalDifferenceMultiplier } from './simulator/math';

// A winner given less than this chance beforehand pulled off an upset.
export const UPSET_THRESHOLD = 0.2;

export interface OddsMatch {
  tournament: string;
  homeGoals: number | null;
  awayGoals: number | null;
  // Home team's gain, as published by eloratings.net.
  ratingChange: number;
}

export interface MatchOdds {
  homeWin: number;
  draw: number;
  awayWin: number;
}

export function preMatchOdds(match: OddsMatch): MatchOdds | null {
  if (match.homeGoals === null || match.awayGoals === null) return null;
  const goalDifference = match.homeGoals - match.awayGoals;
  const result = goalDifference > 0 ? 1 : goalDifference < 0 ? 0 : 0.5;
  const k = getWeight(match.tournament) * goalDifferenceMultiplier(goalDifference);
  // Clamped, since rounding can push a near-certain result's expectation past 0 or 1.
  const expected = Math.min(0.999, Math.max(0.001, result - match.ratingChange / k));
  return oddsFromRatingGap(400 * Math.log10(expected / (1 - expected)));
}

// An unplayed fixture's odds from both teams' ratings, with +100 for a team
// at its own ground, as in the simulation. A missing venue is the home side's
// ground, as in the feed.
export function fixtureOdds(
  homeElo: number,
  awayElo: number,
  fixture: { homeTeamId: string; awayTeamId: string; location: string | null }
): MatchOdds {
  const location = fixture.location ?? fixture.homeTeamId;
  const homeAdvantage = location === fixture.homeTeamId ? 100 : location === fixture.awayTeamId ? -100 : 0;
  return oddsFromRatingGap(homeElo - awayElo + homeAdvantage);
}

// Win/draw/win chances from the simulator's model, for a home-minus-away
// rating gap that includes any home advantage.
function oddsFromRatingGap(homeRatingGap: number): MatchOdds {
  const probabilities = getProbabilities(Math.abs(homeRatingGap));
  const favouriteWin = Object.entries(probabilities)
    .filter(([margin]) => Number(margin) > 0)
    .reduce((sum, [, p]) => sum + p, 0);
  const draw = probabilities[0];
  const underdogWin = 1 - favouriteWin - draw;
  return homeRatingGap >= 0
    ? { homeWin: favouriteWin, draw, awayWin: underdogWin }
    : { homeWin: underdogWin, draw, awayWin: favouriteWin };
}

// A rating swing of at least this share of the tournament's K-factor is a big
// one. Scaled by K so a World Cup match (K=60) isn't flagged half again as
// readily as a qualifier (K=40): 30 points at K=40, 45 at the World Cup.
export const BIG_SWING_SHARE = 0.75;

export function isBigSwing(ratingChange: number, tournament: string): boolean {
  return Math.abs(ratingChange) >= BIG_SWING_SHARE * getWeight(tournament);
}

// Compared as the whole percentage the dashboard shows, so a 19.6% chance
// (shown as 20%) isn't called an upset under a "less than 20%" rule.
const isUpsetChance = (winChance: number) => Math.round(winChance * 100) < UPSET_THRESHOLD * 100;

// Which side won against the odds, if either did. A shootout counts as a draw,
// as it does for the ratings.
export function upsetWinner(match: OddsMatch, odds: MatchOdds | null = preMatchOdds(match)): 'home' | 'away' | null {
  if (!odds || match.homeGoals === null || match.awayGoals === null) return null;
  if (match.homeGoals > match.awayGoals && isUpsetChance(odds.homeWin)) return 'home';
  if (match.awayGoals > match.homeGoals && isUpsetChance(odds.awayWin)) return 'away';
  return null;
}

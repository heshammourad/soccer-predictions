import { DoubleRoundRobinOptions } from './base';

// 2026/27 UEFA Nations League access list, positions 1-48 (Leagues A-C;
// League D isn't modelled): each team's rank from the previous edition (the
// 2024-25 final overall ranking, adjusted for promotion and relegation), which
// also seeded the league phase draw (pots of 4 per league). It is the last
// group tiebreaker. Keyed by eloratings.net team codes.
export const NATIONS_LEAGUE_ACCESS_LIST = [
  // League A
  'PT', 'ES', 'FR', 'DE', 'IT', 'NL', 'DK', 'HR', 'RS', 'BE', 'EN', 'NO', 'WA', 'CZ', 'GR', 'TR',
  // League B
  'SQ', 'HU', 'PL', 'IL', 'CH', 'BA', 'AT', 'UA', 'SI', 'GE', 'IE', 'RO', 'SE', 'NM', 'EI', 'KO',
  // League C
  'IS', 'AL', 'ME', 'KZ', 'FI', 'SK', 'BG', 'AM', 'BY', 'FO', 'CY', 'EE', 'LV', 'LU', 'MD', 'SM',
];

// 1-based position in the access list (lower is better).
export function accessListPosition(teamId: string): number {
  const index = NATIONS_LEAGUE_ACCESS_LIST.indexOf(teamId);
  return index === -1 ? Infinity : index + 1;
}

// UEFA group tiebreakers: points; then head-to-head points, GD and goals
// scored among the tied teams (re-applied to any still-tied subset); then
// overall GD, goals scored, away goals scored, wins, away wins; then the
// access list. Disciplinary points (between away wins and the access list)
// aren't tracked, so they're skipped.
export const UEFA_NATIONS_LEAGUE_TIEBREAKERS: DoubleRoundRobinOptions = {
  overall: ['awayGoals', 'wins', 'awayWins', (teamId) => -accessListPosition(teamId)],
};

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Next.js 16 (App Router) app that publishes world football ELO rankings and Monte Carlo tournament projections for the 2026 World Cup (`WC`). Data lives in Postgres (Neon) accessed via Prisma 7. A daily GitHub Actions job scrapes fresh data from `eloratings.net`, re-runs the simulation engine, and writes projections back to the database.

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml`, workspace with `.` and `nodejs`). `npm`/`package-lock.json` are not authoritative — `package-lock.json` is untracked.

```bash
pnpm install                      # install
pnpm dev                          # next dev (localhost:3000)
pnpm build                        # prisma generate && next build
pnpm lint                         # eslint (next core-web-vitals + typescript rules)
pnpm prisma generate              # regenerate Prisma client after schema.prisma changes
pnpm prisma migrate dev           # create/apply a migration locally
pnpm exec tsx scripts/sync.ts     # full pipeline: scrape eloratings.net -> DB -> run all milestone simulations
pnpm exec tsx scripts/fetch-confederations.ts   # rebuild app/lib/simulator/config/confederations.json
pnpm test                         # vitest run — covers app/lib/simulator/ (engine, math, config)
```

The Vitest suite only covers `app/lib/simulator/`. It characterizes simulation logic (group sorting, two-legged ties, dynamic hosts, rating math) but doesn't touch the DB, scraping, or UI — verify those changes by running `scripts/sync.ts` (or the Server Action) and inspecting the written `Prediction` rows.

`DATABASE_URL` (Postgres connection string) must be set — via `.env` (loaded by `dotenv` in scripts and `prisma.config.ts`) locally, and the `DATABASE_URL` GitHub secret in CI. `app/lib/db.ts` returns a non-null `prisma`/`pool` even when the env var is missing, so a missing URL surfaces as a runtime error on first query.

## Architecture

### Data flow

`eloratings.net` TSV feeds → `scripts/sync.ts` → Prisma models (`Team`, `Match`) → `SimulatorEngine` → `SimulationRun` + `Prediction` rows → server components (`app/page.tsx`, `app/tournament/[code]/page.tsx`) → client components.

- **`scripts/sync.ts`** is the scheduled entry point (`.github/workflows/daily-sync.yml`, 06:00 UTC daily + manual dispatch). It uses `node-tls-client` (not `fetch`) to defeat the site's bot filtering — this is why `next.config.ts` lists `node-tls-client` and `koffi` in `serverExternalPackages`. It updates ELO ratings and match results, then runs one simulation per milestone in a fixed list (`Start`, `Matchday 1..3`, `Round of 32/16`, `Quarterfinals`, `Semifinals`, `Tournament Completed`, plus `Current Projections`). Milestones with a future date, or whose `SimulationRun` already exists, are skipped; once every historical milestone exists it skips simulation entirely.
- Nations League (`ENA`/`ENB`/`ENC`) and Africa Cup of Nations qualifiers (`FQ`) data comes from the global feeds `https://eloratings.net/latest.tsv` (played matches) and `fixtures.tsv` (upcoming matches, incl. drawn playoff pairings once announced), filtered by tournament code — there is no working per-tournament results file for them. `FQ` is reused by every AFCON qualifying cycle, so `EDITION_START` in `scripts/sync.ts` drops matches dated before the 2026-27 cycle (rows are keyed by tournament + home + away). `sync.ts` also upserts `TeamTournamentGroup` rows from `prisma/seed-data/<code>/groups` (add-only, so a live DB needn't be reseeded).
- Results TSV URL has a fallback chain: `_latest.tsv` → `_results.tsv` → `.tsv`.
- `node-tls-client@2.1.0` is unmaintained and downloads its native `.so` from the `bogdanfinn/tls-client` **latest** GitHub release at runtime; asset renames upstream break it (they did on v1.16.0). The workflow works around this by pre-placing a pinned `tls-client-xgo-<v>-linux-amd64.so` at `os.tmpdir()/tls-client-x64.so`; local runs of `sync.ts` need the same file staged or a working download.
- `sync.ts` opens its own pg pool *and* imports the shared one from `app/lib/db.ts` (via the engine); both must be closed on exit.

### Simulation engine (`app/lib/simulator/`)

Monte Carlo, default 10,000 runs. Read `app/lib/simulator/README.md` before modifying — it documents the `TournamentConfig` contract and how to add a tournament.

- **`engine.ts`** — `SimulatorEngine(config, simulationsCount?, asOfDate?, description?)`. `asOfDate` produces historical milestone snapshots: it splits matches into results/fixtures at that date, and **reconstructs each team's ELO as of that date by reversing `Match.ratingChange` for every post-cutoff match**. Each MC iteration simulates remaining group fixtures, sorts groups via `config.sortGroupStandings`, builds the knockout bracket via `config.buildKnockoutBracket`, then recurses through knockout stages. Real completed knockout results (including penalty-shootout winners, derived by checking who appears in a later round) are used instead of simulation where available. Writes results by deleting the prior `SimulationRun` with the same `(tournament, description)` and creating a fresh one.
- **`math.ts`** — probability model. `simulateResult(eloDiff)` returns a signed goal margin from fitted probability curves; `getLowerScore(margin)` picks the loser's score from historical distributions; `calculateRatingChange(...)` is the ELO update with per-tournament K-weights (`weights` map, default 40) and goal-difference multipliers. Score-line reconstruction from a signed margin lives inline in `engine.ts`.
- **`config/base.ts`** — `sortGroupTeamsWithH2H` implements FIFA tiebreakers with recursive head-to-head mini-table resolution; `compareStats` is points → GD → GF.
- **`config/worldCup.ts`** — `WorldCup48Config`: 12 groups, 8 best third-place teams advance. The R32 bracket pairing depends on *which* group letters the 8 third-place teams come from; `worldCupMatchupScenarios.ts` (`matchupIndices`) maps the sorted scenario key (e.g. `"ABCDEFGH"`) to third-place slot assignments. Host-nation ELO boost is +100, applied when a match `location` equals a team's id; knockout locations come from `locationsWC`.
- **`config/nationsLeague.ts`** — 2026-27 UEFA Nations League Leagues A-C (`ENA`/`ENB`/`ENC`) simulated together as one `NationsLeagueConfig` (code `EN`), because the promotion/relegation playoffs pair teams across leagues within the same iteration; one `SimulationRun` per league is written. It reuses `nationsLeagueA.ts` for League A's group sorting and title ladder (double round-robin groups: both meetings count for head-to-head tiebreakers). League D is not modelled. Ukraine, Israel and Belarus never get home advantage, and Ireland v Israel is neutral (`hostsHomeMatch`). Group tiebreakers follow UEFA (`config/nationsLeagueTiebreakers.ts`: H2H points/GD/goals re-applied to tied subsets, then overall GD, goals, away goals, wins, away wins, then the 2026/27 access list; disciplinary points aren't tracked so that step is skipped). Playoff dates (`KNOCKOUT_CUTOFFS` in `scripts/sync.ts`/`seed.ts`) and the cross-group ranking tiebreak beyond points/GD/GF (random) are assumptions to confirm.
- **`config/africaCupQualifiers.ts`** — 2027 AFCON qualifiers (`FQ`): 12 double round-robin groups of 4 (letters A-L match the CAF draw), top two qualify, but hosts KE/TZ/UG are already through so their groups qualify only one non-host. Single milestone `qualified`, no knockout stages. Uses CAF tiebreakers (`sortDoubleRoundRobinGroup(..., CAF_TIEBREAKERS)`: H2H pts/GD/GF/away goals, re-applied to tied subsets, then overall GD/GF/away goals, then lots). `prisma/seed-data/FQ/` was generated from `fixtures.tsv`; the feed dates matchdays 3-6 by month only, so the seed file carries placeholder days per matchday (MD3 11 Nov, MD4 16 Nov, MD5 25 Mar, MD6 29 Mar) derived from the feed's row order, and `scripts/sync.ts` substitutes them for month-only feed rows. Revisit those days and the `Matchday N Completed` cutoffs once real dates are published. The feed is taken as accurate, including venues: a team gets home advantage only when a fixture's `location` is its own ground, so neutral venues favour neither side. Seven pairs are published twice with the same home/away order (one row per meeting); `pickMatchForFeedRow` keeps them as two matches (each feed row claims the closest unclaimed row for its pair). Nations League B/C have such pairs too (e.g. Albania v Belarus, 50 days apart), and `sync.ts` warns when a group's match count isn't n·(n-1).
- **`config/concacafNationsLeague.ts`** — 2026-27 CONCACAF Nations League, one config per league (`CLA`/`CLB`/`CLC`, each simulated on its own; the Play-In and Gold Cup preliminary round aren't modelled). Rules are from the Concacaf regulations (art. 12). League A: two Swiss-style groups of six (4 matches each), top two join the four pre-seeded teams (MX, US, CA, PA, tracked via `additionalTeamIds`) in two-legged quarter-finals (away goals count double, `twoLeggedAwayGoals`), the Finals semi-finals are paired 1 v 4 / 2 v 3 by quarter-final record (`orderStageWinners`) and played at a US venue; 5th/6th relegated. League B: four double round-robin groups, winner promoted, 4th relegated. League C: three groups, winners + best runner-up promoted. Groups use `sortOverallThenH2H` (overall points/GD/goals scored first, then head-to-head; fair play skipped, lots random). The League B/C Finals aren't modelled. Home advantage follows each fixture's venue, which matters here: League B rotates a host per pair of matchdays and League C uses one host per group, so a host gets the boost only in its own games. The milestone schedules are exported from this file and used by both `scripts/sync.ts` and the dashboard. `sync.ts` warns when a group's match count doesn't match its seed file (League A's groups aren't full round-robins).
- **`mathematicalStatus.ts`** — *separate, deterministic* logic (not simulation-based). `calculateMathematicalStatus` enumerates all `6^k` result permutations (`OUTCOMES` = extreme score lines) for remaining group matches to decide `guaranteedProgress` / `mathematicallyEliminated` / `guaranteedWinGroup` / `eliminatedWinGroup`, including cross-group comparison of third-place scenarios. See `calculation.md` for the design rationale. Runs client-side in `DashboardClient.tsx`. Has its own `sortGroup` — keep tiebreaker logic in sync with `config/base.ts`.

### Prisma models (`prisma/schema.prisma`)

Two generators: `prisma-client` → `app/generated/prisma` (gitignored, the one imported by `app/lib/db.ts` as `@/app/generated/prisma/client`) and `prisma-client-js`. `Match.homeGoals === null` means an unplayed fixture. `Match.winnerOverride` / `Match.ratingChange` support shootouts and ELO reconstruction. `Prediction` percentages are stored as 0.0–1.0 fractions.

### Frontend

- `app/layout.tsx` → `Sidebar` + content. `app/page.tsx` = ELO rankings table (`RankingsClient`). `app/tournament/[code]/page.tsx` = projections dashboard (`DashboardClient`); only `WC` is a valid code (`tournamentNames` map, else `notFound()`).
- Server components pass Prisma data to client components via `JSON.parse(JSON.stringify(...))` to strip non-serializable values.
- `DashboardClient` lets the user pick a `SimulationRun` (milestone); `MILESTONE_DATES` there must stay aligned with the milestone list in `scripts/sync.ts` and the `asOfDate` cutoffs. Once every dated milestone in a tournament's `milestoneDates` has passed and its last one has been simulated (`finalMilestoneIfOver` in `app/lib/tournaments.ts`), the dashboard hides `Current Projections` and the simulate button and defaults to that final run — so a tournament's final milestone must be listed there.
- `app/actions/simulate.ts` — `triggerSimulation` Server Action runs a single live `Current Projections` simulation from the UI button.
- Flags: `getFlagUrl` in `config/confederations.ts` maps eloratings.net 2-letter codes to `flagcdn.com` codes (many non-ISO special cases).
- Styling: Tailwind v4 (`@tailwindcss/postcss`), dark slate palette throughout.

### Database bootstrap (`prisma/seed.ts`)

One-shot bootstrap for an empty database: reads the TSV/CSV snapshots under `prisma/seed-data/` (`teams.csv`, `team_ratings`, `WC/{groups,results,fixtures}`) to create `Team` rows (incl. group assignments) and the full WC fixture list. `scripts/sync.ts` only *updates* existing teams/matches, so a fresh DB must be seeded before the first sync. Run with `pnpm prisma db seed`. Not part of the daily pipeline.

## Conventions

- Team/tournament codes are eloratings.net's (2-letter team codes like `QA`, `CI`; tournament codes like `WC`, `EC`, `AC`).
- To add a tournament: seed `Team`/`Match` rows, add a `TournamentConfig` in `config/`, wire it into `app/actions/simulate.ts` and `scripts/sync.ts`, add it to `tournamentNames` maps.
- ESLint uses the flat config (`eslint.config.mjs`); `scripts/` is outside the TS project.

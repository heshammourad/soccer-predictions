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
```

There is **no test suite**. Verify simulation changes by running `scripts/sync.ts` (or the Server Action) and inspecting the written `Prediction` rows.

`DATABASE_URL` (Postgres connection string) must be set — via `.env` (loaded by `dotenv` in scripts and `prisma.config.ts`) locally, and the `DATABASE_URL` GitHub secret in CI. `app/lib/db.ts` returns a non-null `prisma`/`pool` even when the env var is missing, so a missing URL surfaces as a runtime error on first query.

## Architecture

### Data flow

`eloratings.net` TSV feeds → `scripts/sync.ts` → Prisma models (`Team`, `Match`) → `SimulatorEngine` → `SimulationRun` + `Prediction` rows → server components (`app/page.tsx`, `app/tournament/[code]/page.tsx`) → client components.

- **`scripts/sync.ts`** is the scheduled entry point (`.github/workflows/daily-sync.yml`, 06:00 UTC daily + manual dispatch). It uses `node-tls-client` (not `fetch`) to defeat the site's bot filtering — this is why `next.config.ts` lists `node-tls-client` and `koffi` in `serverExternalPackages`. It updates ELO ratings and match results, then runs one simulation per milestone in a fixed list (`Start`, `Matchday 1..3`, `Round of 32/16`, `Quarterfinals`, `Semifinals`, `Tournament Completed`, plus `Current Projections`). Milestones with a future date, or whose `SimulationRun` already exists, are skipped; once every historical milestone exists it skips simulation entirely.
- Results TSV URL has a fallback chain: `_latest.tsv` → `_results.tsv` → `.tsv`.
- `node-tls-client@2.1.0` is unmaintained and downloads its native `.so` from the `bogdanfinn/tls-client` **latest** GitHub release at runtime; asset renames upstream break it (they did on v1.16.0). The workflow works around this by pre-placing a pinned `tls-client-xgo-<v>-linux-amd64.so` at `os.tmpdir()/tls-client-x64.so`; local runs of `sync.ts` need the same file staged or a working download.
- `sync.ts` opens its own pg pool *and* imports the shared one from `app/lib/db.ts` (via the engine); both must be closed on exit.

### Simulation engine (`app/lib/simulator/`)

Monte Carlo, default 10,000 runs. Read `app/lib/simulator/README.md` before modifying — it documents the `TournamentConfig` contract and how to add a tournament.

- **`engine.ts`** — `SimulatorEngine(config, simulationsCount?, asOfDate?, description?)`. `asOfDate` produces historical milestone snapshots: it splits matches into results/fixtures at that date, and **reconstructs each team's ELO as of that date by reversing `Match.ratingChange` for every post-cutoff match**. Each MC iteration simulates remaining group fixtures, sorts groups via `config.sortGroupStandings`, builds the knockout bracket via `config.buildKnockoutBracket`, then recurses through knockout stages. Real completed knockout results (including penalty-shootout winners, derived by checking who appears in a later round) are used instead of simulation where available. Writes results by deleting the prior `SimulationRun` with the same `(tournament, description)` and creating a fresh one.
- **`math.ts`** — probability model. `simulateResult(eloDiff)` returns a signed goal margin from fitted probability curves; `getLowerScore(margin)` picks the loser's score from historical distributions; `calculateRatingChange(...)` is the ELO update with per-tournament K-weights (`weights` map, default 40) and goal-difference multipliers. Score-line reconstruction from a signed margin lives inline in `engine.ts`.
- **`config/base.ts`** — `sortGroupTeamsWithH2H` implements FIFA tiebreakers with recursive head-to-head mini-table resolution; `compareStats` is points → GD → GF.
- **`config/worldCup.ts`** — `WorldCup48Config`: 12 groups, 8 best third-place teams advance. The R32 bracket pairing depends on *which* group letters the 8 third-place teams come from; `worldCupMatchupScenarios.ts` (`matchupIndices`) maps the sorted scenario key (e.g. `"ABCDEFGH"`) to third-place slot assignments. Host-nation ELO boost is +100, applied when a match `location` equals a team's id; knockout locations come from `locationsWC`.
- **`mathematicalStatus.ts`** — *separate, deterministic* logic (not simulation-based). `calculateMathematicalStatus` enumerates all `6^k` result permutations (`OUTCOMES` = extreme score lines) for remaining group matches to decide `guaranteedProgress` / `mathematicallyEliminated` / `guaranteedWinGroup` / `eliminatedWinGroup`, including cross-group comparison of third-place scenarios. See `calculation.md` for the design rationale. Runs client-side in `DashboardClient.tsx`. Has its own `sortGroup` — keep tiebreaker logic in sync with `config/base.ts`.

### Prisma models (`prisma/schema.prisma`)

Two generators: `prisma-client` → `app/generated/prisma` (gitignored, the one imported by `app/lib/db.ts` as `@/app/generated/prisma/client`) and `prisma-client-js`. `Match.homeGoals === null` means an unplayed fixture. `Match.winnerOverride` / `Match.ratingChange` support shootouts and ELO reconstruction. `Prediction` percentages are stored as 0.0–1.0 fractions.

### Frontend

- `app/layout.tsx` → `Sidebar` + content. `app/page.tsx` = ELO rankings table (`RankingsClient`). `app/tournament/[code]/page.tsx` = projections dashboard (`DashboardClient`); only `WC` is a valid code (`tournamentNames` map, else `notFound()`).
- Server components pass Prisma data to client components via `JSON.parse(JSON.stringify(...))` to strip non-serializable values.
- `DashboardClient` lets the user pick a `SimulationRun` (milestone); `MILESTONE_DATES` there must stay aligned with the milestone list in `scripts/sync.ts` and the `asOfDate` cutoffs.
- `app/actions/simulate.ts` — `triggerSimulation` Server Action runs a single live `Current Projections` simulation from the UI button.
- Flags: `getFlagUrl` in `config/confederations.ts` maps eloratings.net 2-letter codes to `flagcdn.com` codes (many non-ISO special cases).
- Styling: Tailwind v4 (`@tailwindcss/postcss`), dark slate palette throughout.

### Database bootstrap (`prisma/seed.ts`)

One-shot bootstrap for an empty database: reads the TSV/CSV snapshots under `prisma/seed-data/` (`teams.csv`, `team_ratings`, `WC/{groups,results,fixtures}`) to create `Team` rows (incl. group assignments) and the full WC fixture list. `scripts/sync.ts` only *updates* existing teams/matches, so a fresh DB must be seeded before the first sync. Run with `pnpm prisma db seed`. Not part of the daily pipeline.

## Conventions

- Team/tournament codes are eloratings.net's (2-letter team codes like `QA`, `CI`; tournament codes like `WC`, `EC`, `AC`).
- To add a tournament: seed `Team`/`Match` rows, add a `TournamentConfig` in `config/`, wire it into `app/actions/simulate.ts` and `scripts/sync.ts`, add it to `tournamentNames` maps.
- ESLint uses the flat config (`eslint.config.mjs`); `scripts/` is outside the TS project.

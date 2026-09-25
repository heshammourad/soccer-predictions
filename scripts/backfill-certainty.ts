import 'dotenv/config';
import { prisma, pool } from '../app/lib/db';
import { SimulatorEngine } from '../app/lib/simulator/engine';
import { WorldCup48Config } from '../app/lib/simulator/config/worldCup';
import { NationsLeagueConfig } from '../app/lib/simulator/config/nationsLeague';
import { AfricaCupQualifiersConfig } from '../app/lib/simulator/config/africaCupQualifiers';
import {
  ConcacafLeagueAConfig,
  ConcacafLeagueBConfig,
  ConcacafLeagueCConfig,
} from '../app/lib/simulator/config/concacafNationsLeague';
import { TournamentConfig } from '../app/lib/simulator/types';
import { Certainty } from '../app/lib/simulator/certainty';
import { getTournament } from '../app/lib/tournaments';

// Fills Prediction.certainty for every existing SimulationRun from the real
// results as of that run's milestone cutoff, without re-running the Monte
// Carlo (so the stored probabilities don't change). Safe to re-run: each run's
// certainty is cleared and rewritten. `scripts/sync.ts` writes it for new runs.
//
//   pnpm exec tsx scripts/backfill-certainty.ts             # write
//   pnpm exec tsx scripts/backfill-certainty.ts --dry-run   # only print what it would write
//   add --verbose to list every decided milestone
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const CONFIGS: TournamentConfig[] = [
  new WorldCup48Config(),
  new NationsLeagueConfig(),
  new AfricaCupQualifiersConfig(),
  new ConcacafLeagueAConfig(),
  new ConcacafLeagueBConfig(),
  new ConcacafLeagueCConfig(),
];

async function backfill(config: TournamentConfig) {
  const codes = (config.leagues ?? [{ code: config.code }]).map((l) => l.code);
  const runs = await prisma.simulationRun.findMany({
    where: { tournament: { in: codes } },
    select: { id: true, tournament: true, description: true },
  });
  // Leagues simulated together share one milestone schedule.
  const milestoneDates = getTournament(codes[0])?.milestoneDates ?? {};

  for (const description of Array.from(new Set(runs.map((r) => r.description)))) {
    if (!(description in milestoneDates)) {
      console.warn(`Skipping ${codes.join('/')} "${description}": not in the milestone schedule.`);
      continue;
    }
    const cutoff = milestoneDates[description];
    const byLeague = await new SimulatorEngine(config, 0, cutoff ? new Date(cutoff) : undefined, description).computeCertainty();

    for (const run of runs.filter((r) => r.description === description)) {
      // Teams per (milestone, certainty), so each becomes one update.
      const updates = new Map<string, { milestone: string; certainty: Certainty; teamIds: string[] }>();
      Object.entries(byLeague[run.tournament] ?? {}).forEach(([teamId, milestones]) => {
        Object.entries(milestones).forEach(([milestone, certainty]) => {
          if (!certainty) return;
          const key = `${milestone}|${certainty}`;
          if (!updates.has(key)) updates.set(key, { milestone, certainty, teamIds: [] });
          updates.get(key)!.teamIds.push(teamId);
        });
      });

      const counts = [...updates.values()].reduce(
        (acc, u) => ({ ...acc, [u.certainty]: acc[u.certainty] + u.teamIds.length }),
        { CERTAIN: 0, IMPOSSIBLE: 0 }
      );
      console.log(`${run.tournament} "${description}": ${counts.CERTAIN} certain, ${counts.IMPOSSIBLE} impossible`);
      if (VERBOSE) {
        [...updates.values()]
          .sort((a, b) => a.milestone.localeCompare(b.milestone) || a.certainty.localeCompare(b.certainty))
          .forEach((u) => console.log(`  ${u.milestone} ${u.certainty}: ${u.teamIds.sort().join(' ')}`));
      }

      if (DRY_RUN) continue;
      await prisma.$transaction([
        prisma.prediction.updateMany({ where: { simulationRunId: run.id }, data: { certainty: null } }),
        ...[...updates.values()].map((u) =>
          prisma.prediction.updateMany({
            where: { simulationRunId: run.id, milestone: u.milestone, teamId: { in: u.teamIds } },
            data: { certainty: u.certainty },
          })
        ),
      ]);
    }
  }
}

async function main() {
  for (const config of CONFIGS) await backfill(config);
  console.log(DRY_RUN ? 'Dry run: nothing written.' : 'Backfill complete.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

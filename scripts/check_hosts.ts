import 'dotenv/config';
import { prisma } from '../app/lib/db';

async function main() {
  const startRun = await prisma.simulationRun.findFirst({
    where: { description: 'Start (Pre-tournament)' },
    include: {
      predictions: {
        include: { team: true }
      }
    }
  });

  if (!startRun) {
    console.log('No Start run found');
    return;
  }

  const hosts = ['MX', 'CA', 'US'];
  for (const hostId of hosts) {
    const pred = startRun.predictions.find(p => p.teamId === hostId);
    console.log(`HOST ${hostId} prediction:`, pred);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

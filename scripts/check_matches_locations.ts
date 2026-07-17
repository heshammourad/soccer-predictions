import 'dotenv/config';
import { prisma } from '../app/lib/db';

async function main() {
  const matches = await prisma.match.findMany({
    where: { tournament: 'WC' },
    orderBy: { date: 'asc' }
  });

  console.log('TOTAL MATCHES:', matches.length);
  
  const sampleMatches = matches.slice(0, 10);
  console.log('SAMPLE MATCHES (first 10):');
  sampleMatches.forEach(m => {
    console.log(`Match ${m.id}: ${m.homeTeamId} vs ${m.awayTeamId} | goals: ${m.homeGoals}-${m.awayGoals} | loc: ${m.location} | change: ${m.ratingChange} | date: ${m.date.toISOString()}`);
  });

  const hostsMatches = matches.filter(m => m.homeTeamId === 'MX' || m.awayTeamId === 'MX' || m.homeTeamId === 'CA' || m.awayTeamId === 'CA' || m.homeTeamId === 'US' || m.awayTeamId === 'US');
  console.log('\nHOSTS MATCHES (first 10):');
  hostsMatches.slice(0, 10).forEach(m => {
    console.log(`Match ${m.id}: ${m.homeTeamId} vs ${m.awayTeamId} | goals: ${m.homeGoals}-${m.awayGoals} | loc: ${m.location} | change: ${m.ratingChange} | date: ${m.date.toISOString()}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);

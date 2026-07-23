import { Session, ClientIdentifier, initTLS, destroyTLS } from 'node-tls-client';
import * as fs from 'fs';
import * as path from 'path';

const confederations = ['UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];

async function run() {
  console.log('Initializing TLS Client for confederations fetch...');
  await initTLS();

  const session = new Session({
    clientIdentifier: ClientIdentifier.chrome_120
  });

  const mapping: { [teamCode: string]: string } = {};

  try {
    for (const conf of confederations) {
      const url = `https://eloratings.net/${conf}.tsv`;
      console.log(`Fetching ${conf} teams from ${url}...`);

      const response = await session.get(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'accept': 'text/tab-separated-values, */*',
          'accept-language': 'en-US,en;q=0.9'
        }
      });

      if (response.status !== 200) {
        console.warn(`Failed to fetch ${conf} teams: status ${response.status}`);
        continue;
      }

      const lines = response.body.split('\n');
      let count = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const fields = line.split('\t');
        if (fields.length >= 3) {
          const code = fields[2].trim();
          if (code && code.length === 2) {
            mapping[code] = conf;
            count++;
          }
        }
      }
      console.log(`Mapped ${count} teams to ${conf}.`);
    }

    const outputPath = path.resolve(__dirname, '../app/lib/simulator/config/confederations.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(mapping, null, 2), 'utf8');
    console.log(`Successfully wrote confederation mappings to ${outputPath}`);

  } finally {
    console.log('Closing TLS session...');
    await session.close();
    await destroyTLS();
  }
}

run()
  .then(() => {
    console.log('Confederation fetch completed successfully.');
  })
  .catch((err) => {
    console.error('Confederation fetch failed:', err);
    process.exit(1);
  });

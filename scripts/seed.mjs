// Creates a database seeded with the synthetic dataset on the legacy schema.
// Usage: node scripts/seed.mjs <dbName> <cities>
//   node scripts/seed.mjs weather_s_legacy 100    (~1.1M rows)
//   node scripts/seed.mjs weather_l_legacy 1000   (~11M rows)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [dbName, cities = '100'] = process.argv.slice(2);
if (!dbName || !/^[a-z0-9_]+$/.test(dbName)) {
  console.error('Usage: node scripts/seed.mjs <dbName> <cities>');
  process.exit(1);
}

const container = process.env.DB_CONTAINER ?? 'weather-db';
const psql = (args, input) =>
  execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'WeatherTrack', '-v', 'ON_ERROR_STOP=1', ...args],
    { input, stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] }
  );

psql(['-d', 'WeatherTrack', '-c', `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`]);
psql(['-d', 'WeatherTrack', '-c', `CREATE DATABASE ${dbName}`]);
psql(['-d', dbName, '-c', 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements']);

const start = Date.now();
psql(['-d', dbName, '-v', `cities=${Number(cities)}`, '-f', '-'], readFileSync(new URL('./seed-legacy.sql', import.meta.url)));
console.log(`Seeded ${dbName} (${cities} cities) in ${((Date.now() - start) / 1000).toFixed(1)}s`);

// Server-side (PostgreSQL) cost of the aggregate query, legacy vs migrated schema.
// Runs N random cities with EXPLAIN (ANALYZE, BUFFERS) and reports planning/execution time and buffers.
// Usage: node bench/db-compare.mjs <legacyDb> <newDb> <cities> [runs]
import pg from 'pg';

const [legacyDb, newDb, cities = '100', runs = '200'] = process.argv.slice(2);
const conn = (database) =>
  new pg.Client({ host: '127.0.0.1', port: 5432, user: 'WeatherTrack', password: 'mysecretpassword', database });

const queries = {
  legacy: {
    full: (c) => `SELECT count(*), avg(temperature), min(temperature), max(temperature) FROM weather WHERE location = '${c}'`,
    year: (c, y) =>
      `SELECT count(*), avg(temperature), min(temperature), max(temperature) FROM weather WHERE location = '${c}' AND date BETWEEN '${y}-01-01' AND '${y}-12-31'`,
  },
  migrated: {
    full: (c) =>
      `SELECT count(*), avg(temperature), min(temperature), max(temperature) FROM weather WHERE location_id = (SELECT id FROM locations WHERE name = '${c}') AND date BETWEEN '-infinity'::date AND 'infinity'::date`,
    year: (c, y) =>
      `SELECT count(*), avg(temperature), min(temperature), max(temperature) FROM weather WHERE location_id = (SELECT id FROM locations WHERE name = '${c}') AND date BETWEEN '${y}-01-01' AND '${y}-12-31'`,
  },
};

let seed = 7;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

async function measure(db, kind, scenario) {
  const client = conn(db);
  await client.connect();
  const plan = [], exec = [], buffers = [], reads = [];
  for (let i = 0; i < Number(runs); i++) {
    const c = `City-${String(1 + Math.floor(rand() * Number(cities))).padStart(4, '0')}`;
    const y = 1995 + Math.floor(rand() * 30);
    const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queries[kind][scenario](c, y)}`);
    const p = rows[0]['QUERY PLAN'][0];
    plan.push(p['Planning Time']);
    exec.push(p['Execution Time']);
    buffers.push(p.Plan['Shared Hit Blocks'] + p.Plan['Shared Read Blocks']);
    reads.push(p.Plan['Shared Read Blocks']);
  }
  await client.end();
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    db, scenario,
    planningMs: +med(plan).toFixed(3),
    executionMs: +med(exec).toFixed(3),
    executionMeanMs: +avg(exec).toFixed(3),
    buffersPerQuery: Math.round(med(buffers)),
    diskReadsPerQuery: +avg(reads).toFixed(1),
  };
}

const out = [];
for (const scenario of ['full', 'year']) {
  seed = 7;
  out.push(await measure(legacyDb, 'legacy', scenario));
  seed = 7;
  out.push(await measure(newDb, 'migrated', scenario));
}
console.table(out);

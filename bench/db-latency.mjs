// Measures the raw round-trip latency between Node and PostgreSQL.
// Usage: node bench/db-latency.mjs [host] [database]
import pg from 'pg';

const [host = 'localhost', database = 'weather_s_legacy'] = process.argv.slice(2);
const pool = new pg.Pool({ host, database, user: 'WeatherTrack', password: 'mysecretpassword', port: 5432, max: 1 });

async function measure(label, fn, n = 50) {
  await fn();
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(45)} p50=${times[n / 2].toFixed(2)}ms p99=${times[Math.floor(n * 0.99)].toFixed(2)}ms`);
}

console.log(`host=${host}`);
await measure('SELECT 1 (simple protocol)', () => pool.query('SELECT 1'));
await measure('SELECT $1 (extended protocol)', () => pool.query('SELECT $1::int', [1]));
await measure('stats 1 city full history', () =>
  pool.query(`SELECT count(*), avg(temperature) FROM weather WHERE location = $1`, ['City-0042'])
);
await pool.end();

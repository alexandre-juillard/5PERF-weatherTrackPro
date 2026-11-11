import pg from 'pg';
import config from 'config';
import logger from '../logger.js';

// DATE columns are returned as 'YYYY-MM-DD' strings: no timezone shift and no costly
// per-row Date allocation (postgres-date was ~17% of CPU in the original profile).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
// NUMERIC values (legacy DECIMAL columns, AVG results) are returned as JS numbers instead of strings.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));

const poolConfig = config.get<pg.PoolConfig>('database');

export const pool = new pg.Pool(poolConfig);

// An idle client error must not crash the process (default behaviour of pg.Pool).
pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected error on idle PostgreSQL client');
});

export default pool;

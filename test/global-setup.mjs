// Creates an empty test database and applies all the migrations (same path as production).
import pg from 'pg';
import config from 'config';
import { runner } from 'node-pg-migrate';

export default async function globalSetup() {
  const db = config.get('database');
  const admin = new pg.Client({ ...db, database: 'WeatherTrack' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${db.database} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${db.database}`);
  await admin.end();

  await runner({
    databaseUrl: { host: db.host, port: db.port, user: db.user, password: db.password, database: db.database },
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => undefined,
  });
}

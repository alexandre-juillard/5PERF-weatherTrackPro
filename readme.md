# WeatherTrack Pro Backend

This is the core backend of WeatherTrack Pro application.

This project is responsible for storing and exposing weather data as well as producing different data analysis.

> The performance audit, the optimizations and their measured impact are documented in
> [`docs/RAPPORT.md`](docs/RAPPORT.md) (PDF version: `docs/RAPPORT.pdf`, rebuilt with `npm run pdf`,
> which requires Microsoft Edge or Google Chrome).

## Usage

Configuration settings can be set per environment under the `/config` directory. See [`config` documentation](https://www.npmjs.com/package/config).
Every setting can also be overridden by an environment variable (see `config/custom-environment-variables.yaml`:
`PORT`, `WORKERS`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_MAX`, `REDIS_URL`, `LOG_LEVEL`...).

- Start the infrastructure (PostgreSQL 16 + Redis 7)

  ```sh
  docker compose up -d
  # optional: Prometheus (http://localhost:9090) + Grafana (http://localhost:3001)
  docker compose --profile monitoring up -d
  ```

- Apply the database migrations (schema is no longer created by the application)

  ```sh
  npm run migrate up
  ```

- Build and run the project (production mode, compiled JavaScript)

  ```sh
  npm run build
  npm start                 # WORKERS=0 npm start -> one worker per CPU core
  ```

- Run the project with ts-node, or in watch/inspect mode (development)

  ```sh
  npm run start:dev
  npm run start:watch
  ```

- Quality

  ```sh
  npm test           # Jest: unit + integration tests (needs docker compose up)
  npm run lint       # ESLint (typescript-eslint + sonarjs)
  npm run typecheck
  ```

Prometheus metrics are exposed on a separate, non public port: `http://localhost:9100/metrics`
(HTTP latency histogram per route, event loop lag, PostgreSQL pool, cache hit ratio, CPU, memory, GC).

## API Description

Dates are calendar days (`YYYY-MM-DD`, UTC). A full ISO timestamp is accepted as input and truncated to its UTC day.
`from` and `to` are both **inclusive**. An unknown location returns `404`, an invalid parameter returns `400`.

### Data management

This route is not publicly exposed and is used only by the internal robots responsible for retreiving and uploading weather data.

- `POST` `/weather/data`

  The body is one measure or an array of up to 5000 measures (one database round-trip per batch).
  The operation is idempotent: a measure sent again for the same location and day replaces the previous one.
  Unknown locations are created automatically.

  body example:

  ```json
  {
    "location": "Lyon",
    "date": "2023-12-24",
    "temperature": 25,
    "humidity": 40
  }
  ```

### Data retrieval

- `GET` `/weather/data/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)
  - limit: page size (optional, default 1000, max 5000)
  - cursor: value of the `X-Next-Cursor` header of the previous page (optional)

  The response is paginated. When another page exists, the response contains an `X-Next-Cursor` header
  and a `Link: <...>; rel="next"` header with the URL of the next page.

  example query:

  ```sh
  curl localhost:3000/weather/data/Lyon\?from=2023-12-22\&to=2023-12-25
  ```

  response example:

  ```json
  [
    {
      "location": "Lyon",
      "date": "2023-12-22",
      "temperature": 27,
      "humidity": 40
    },
    {
      "location": "Lyon",
      "date": "2023-12-24",
      "temperature": 25,
      "humidity": 40
    }
  ]
  ```

- `GET` `/weather/export/:location`

  query parameters: from, to (optional)

  Full history export, streamed as a JSON array (same format as above) with a constant memory footprint.

### Data analysis

All the analysis routes are computed by PostgreSQL and cached (Redis, invalidated on every write of the location).
When the range contains no measure, the value is `null`.

- `GET` `/weather/stats/:location`

  query parameters: from, to (optional)

  ```sh
  curl localhost:3000/weather/stats/Lyon?from=2023-12-22&to=2023-12-25
  ```

  ```json
  { "count": 3, "avg": 24.166666666666668, "min": 20.5, "max": 27 }
  ```

- `GET` `/weather/avg/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  example query:

  ```sh
  curl localhost:3000/weather/avg/Lyon?from=2023-12-22&to=2023-12-25
  ```

  response example:

  ```json
  { "avg": 24.166666666666668 }
  ```

- `GET` `/weather/max/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  example query:

  ```sh
  curl localhost:3000/weather/max/Lyon?from=2023-12-22
  ```

  response example:

  ```json
  { "max": 27 }
  ```

- `GET` `/weather/min/:location`

  query parameters:

  - from: Date (optional)
  - to: Date (optional)

  example query:

  ```sh
  curl localhost:3000/weather/min/Lyon\?to=2023-12-25
  ```

  response example:

  ```json
  { "min": 23 }
  ```

## Benchmarks and profiling

```sh
node scripts/seed.mjs weather_s_legacy 100 weather_s     # ~1.1M rows, original + migrated copies
node scripts/seed.mjs weather_l_legacy 1000 weather_l    # ~11M rows
node bench/load.mjs --label my-run --cities 100          # autocannon scenarios -> bench/results/my-run.json
node bench/campaign.mjs                                  # every version (git worktrees), both datasets
node bench/report.mjs                                    # tables and charts for the report
node bench/micro.bench.mjs                               # mitata micro-benchmarks
node bench/db-compare.mjs weather_l_legacy weather_l 1000  # EXPLAIN ANALYZE legacy vs migrated schema
node bench/compare-versions.mjs http://localhost:3000 http://localhost:3100  # functional non-regression
```

The server under test is started with `node --import ./bench/monitor.mjs ...`, which exposes event loop delay,
CPU, memory, CPU profiles (`/profile`) and heap snapshots (`/heap`) on `http://127.0.0.1:9464`
without modifying the application code. `bench/profile-report.mjs` turns a `.cpuprofile` into a summary and an SVG flamegraph.

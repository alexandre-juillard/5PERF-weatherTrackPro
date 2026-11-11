-- Synthetic dataset on the ORIGINAL (legacy) schema.
-- Usage: psql -v cities=100 -f seed-legacy.sql
-- Rows are inserted day by day for every city (like the ingestion robots do),
-- so the rows of a given city are scattered across the whole heap (realistic layout).
\timing on

DROP TABLE IF EXISTS weather;

CREATE TABLE weather (
    location VARCHAR(256),
    date DATE,
    temperature DECIMAL,
    humidity DECIMAL,
    PRIMARY KEY(location, date)
);

INSERT INTO weather (location, date, temperature, humidity)
SELECT
    'City-' || lpad(c::text, 4, '0'),
    d::date,
    round((12
        + 10 * sin(2 * pi() * (extract(doy FROM d) - 110) / 365.25)
        + (c % 20) - 5
        + (hashtext(c::text || d::text) % 1000) / 100.0)::numeric, 1),
    round((65 + (hashtext(d::text || c::text) % 3000) / 100.0)::numeric, 1)
FROM generate_series(DATE '1995-01-01', DATE '2024-12-31', INTERVAL '1 day') AS d,
     LATERAL generate_series(1, :cities) AS c;

VACUUM ANALYZE weather;

SELECT count(*) AS rows, count(DISTINCT location) AS cities,
       pg_size_pretty(pg_total_relation_size('weather')) AS total_size
FROM weather;

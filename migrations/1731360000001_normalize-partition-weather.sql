-- Up Migration
-- New storage model:
--   * locations: one row per city, weather rows reference it with a 4-byte integer
--     instead of repeating a VARCHAR(256) in every row and every index entry;
--   * weather: DOUBLE PRECISION instead of unbounded DECIMAL (fixed 8 bytes, native float
--     aggregation, returned as JS numbers by node-pg), partitioned by year;
--   * covering primary key (location_id, date) INCLUDE (temperature, humidity):
--     aggregates and range reads are answered by index-only scans;
--   * rows copied ordered by (location, date): the rows of one city are physically contiguous.

CREATE TABLE locations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(256) NOT NULL UNIQUE
);

CREATE TABLE weather_v2 (
    location_id INTEGER NOT NULL,
    date DATE NOT NULL,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION
) PARTITION BY RANGE (date);

-- Rows outside the yearly partitions (e.g. very old archives) are not rejected
CREATE TABLE weather_default PARTITION OF weather_v2 DEFAULT;

-- One partition per year, from the oldest measure to next year
DO $$
DECLARE
    first_year INTEGER := COALESCE(
        (SELECT extract(YEAR FROM min(date))::INTEGER FROM weather),
        extract(YEAR FROM now())::INTEGER);
    y INTEGER;
BEGIN
    FOR y IN first_year .. extract(YEAR FROM now())::INTEGER + 1 LOOP
        EXECUTE format('CREATE TABLE weather_y%s PARTITION OF weather_v2 FOR VALUES FROM (%L) TO (%L)',
                       y, make_date(y, 1, 1), make_date(y + 1, 1, 1));
    END LOOP;
END $$;

-- Data migration (indexes are built after the bulk load, which is much faster)
INSERT INTO locations (name)
SELECT DISTINCT location FROM weather WHERE location IS NOT NULL ORDER BY location;

INSERT INTO weather_v2 (location_id, date, temperature, humidity)
SELECT l.id, w.date, w.temperature::DOUBLE PRECISION, w.humidity::DOUBLE PRECISION
FROM weather w
JOIN locations l ON l.name = w.location
WHERE w.date IS NOT NULL
ORDER BY l.id, w.date;

ALTER TABLE weather_v2
    ADD CONSTRAINT weather_v2_pkey PRIMARY KEY (location_id, date) INCLUDE (temperature, humidity);
ALTER TABLE weather_v2
    ADD CONSTRAINT weather_v2_location_fkey FOREIGN KEY (location_id) REFERENCES locations (id);

-- Swap: the original table is kept (renamed) until the migration is validated
ALTER TABLE weather RENAME CONSTRAINT weather_pkey TO weather_legacy_pkey;
ALTER TABLE weather RENAME TO weather_legacy;
ALTER TABLE weather_v2 RENAME CONSTRAINT weather_v2_pkey TO weather_pkey;
ALTER TABLE weather_v2 RENAME CONSTRAINT weather_v2_location_fkey TO weather_location_fkey;
ALTER TABLE weather_v2 RENAME TO weather;

-- Read-only view with the original shape, for BI tools / SQL users of the old table
CREATE VIEW weather_by_location AS
SELECT l.name AS location, w.date, w.temperature, w.humidity
FROM weather w
JOIN locations l ON l.id = w.location_id;

-- Partition maintenance, called by the application at startup (or by a scheduler)
CREATE FUNCTION weather_ensure_partition(y INTEGER) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('CREATE TABLE IF NOT EXISTS weather_y%s PARTITION OF weather FOR VALUES FROM (%L) TO (%L)',
                   y, make_date(y, 1, 1), make_date(y + 1, 1, 1));
END $$;

ANALYZE locations;
ANALYZE weather;

-- Down Migration
-- Only valid while weather_legacy still exists (before the clean-up migration).
-- Measures written after the migration are copied back.
DROP FUNCTION weather_ensure_partition(INTEGER);
DROP VIEW weather_by_location;
INSERT INTO weather_legacy (location, date, temperature, humidity)
SELECT l.name, w.date, w.temperature, w.humidity
FROM weather w JOIN locations l ON l.id = w.location_id
ON CONFLICT (location, date) DO UPDATE
SET temperature = EXCLUDED.temperature, humidity = EXCLUDED.humidity;
DROP TABLE weather;
DROP TABLE locations;
ALTER TABLE weather_legacy RENAME TO weather;
ALTER TABLE weather RENAME CONSTRAINT weather_legacy_pkey TO weather_pkey;

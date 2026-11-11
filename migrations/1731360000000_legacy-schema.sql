-- Up Migration
-- Original schema, previously created by the application at startup (src/index.ts).
-- Kept as the first migration so that an empty database follows the same path as production.
CREATE TABLE IF NOT EXISTS weather (
    location VARCHAR(256),
    date DATE,
    temperature DECIMAL,
    humidity DECIMAL,
    PRIMARY KEY(location, date)
);

-- Down Migration
-- Nothing: the original table holds production data and is never dropped automatically.

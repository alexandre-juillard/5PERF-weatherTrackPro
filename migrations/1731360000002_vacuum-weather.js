// VACUUM cannot run inside a transaction block: separate migration without transaction.
// It fills the visibility map so that the covering index is used for index-only scans
// right after the migration (instead of waiting for autovacuum).
export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('VACUUM (ANALYZE) weather');
};

export const down = () => {};

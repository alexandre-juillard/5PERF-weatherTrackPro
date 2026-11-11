// Micro-benchmarks (mitata) isolating the per-row costs of the original implementation.
// Usage: node bench/micro.bench.mjs
import { bench, group, run, summary } from 'mitata';
import dayjs from 'dayjs';
import { z } from 'zod';

const WeatherDataSchema = z.object({
  location: z.string(),
  date: z.coerce.date(),
  temperature: z.coerce.number(),
  humidity: z.coerce.number(),
});

// ~30 years of daily rows for one city, shaped like the original pg output (DECIMAL -> string)
const N = 10958;
const rawRows = Array.from({ length: N }, (_, i) => ({
  location: 'City-0042',
  date: new Date(1995, 0, 1 + i),
  temperature: (Math.sin(i / 58) * 10 + 12).toFixed(1),
  humidity: (60 + (i % 30)).toFixed(1),
}));
const rows = rawRows.map((r) => WeatherDataSchema.parse(r));
const from = new Date('2010-01-01');
const to = new Date('2010-12-31');

summary(() => {
  group('Row mapping (10 958 rows from pg)', () => {
    bench('ORIGINAL  zod.parse() on every row', () => rawRows.map((r) => WeatherDataSchema.parse(r)));
    bench('OPTIMIZED plain mapping (Number())', () =>
      rawRows.map((r) => ({ location: r.location, date: r.date, temperature: Number(r.temperature), humidity: Number(r.humidity) }))
    );
  });
});

summary(() => {
  group('Date filtering (from/to)', () => {
    bench('ORIGINAL  dayjs (up to 3 objects / row)', () =>
      rows.filter((d) => {
        if (from && (dayjs(from).isAfter(d.date) || dayjs(from).isSame(d.date))) return false;
        if (to && dayjs(to).isBefore(d.date)) return false;
        return true;
      })
    );
    bench('OPTIMIZED numeric timestamps', () => {
      const f = from.getTime();
      const t = to.getTime();
      return rows.filter((d) => {
        const v = d.date.getTime();
        return v > f && v <= t;
      });
    });
  });
});

summary(() => {
  group('Aggregation (avg)', () => {
    bench('ORIGINAL  map() + reduce()', () => rows.map((d) => d.temperature).reduce((a, c) => a + c, 0) / rows.length);
    bench('OPTIMIZED single for loop', () => {
      let s = 0;
      for (let i = 0; i < rows.length; i++) s += rows[i].temperature;
      return s / rows.length;
    });
  });
});

summary(() => {
  group('Serialization of the full history', () => {
    bench('JSON.stringify(10 958 rows)', () => JSON.stringify(rows));
    bench('JSON.stringify({ avg })', () => JSON.stringify({ avg: 12.3 }));
  });
});

await run({ colors: false });

import { z } from 'zod';
import config from 'config';

const pagination = config.get<{ defaultLimit: number; maxLimit: number }>('api.pagination');
const maxBatchSize = config.get<number>('api.maxBatchSize');

// Weather data is daily: a date is a calendar day 'YYYY-MM-DD' (UTC), independent of the server timezone.
const day = z.coerce.date().transform((date) => date.toISOString().slice(0, 10));

export const WeatherDataSchema = z.object({
  location: z.string().min(1).max(256),
  date: day,
  temperature: z.coerce.number(),
  humidity: z.coerce.number(),
});

export type WeatherData = z.infer<typeof WeatherDataSchema>;

// The robots can push one measure or a batch of measures in a single request
export const WeatherDataInputSchema = z.union([
  WeatherDataSchema,
  z.array(WeatherDataSchema).min(1).max(maxBatchSize),
]);

export type WeatherDataInput = z.infer<typeof WeatherDataInputSchema>;

export const LocationParamsSchema = z.object({
  location: z.string().min(1).max(256),
});

export const WeatherFilterSchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, { message: '`from` must be before `to`' });

export type WeatherFilter = z.infer<typeof WeatherFilterSchema>;

export const WeatherPageSchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    limit: z.coerce.number().int().min(1).max(pagination.maxLimit).default(pagination.defaultLimit),
    // Keyset pagination: the date of the last row of the previous page (exclusive)
    cursor: day.optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, { message: '`from` must be before `to`' });

export type WeatherPage = z.infer<typeof WeatherPageSchema>;

export type WeatherRow = {
  location: string;
  date: string;
  temperature: number;
  humidity: number;
};

export type WeatherStats = {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
};

import { WeatherDataSchema, WeatherFilterSchema, WeatherPageSchema } from '../src/weather/dto.js';

describe('DTO validation', () => {
  it('normalizes dates to UTC calendar days', () => {
    expect(WeatherFilterSchema.parse({ from: '2023-12-22', to: '2023-12-25T10:00:00Z' })).toEqual({
      from: '2023-12-22',
      to: '2023-12-25',
    });
    expect(WeatherDataSchema.parse({ location: 'Lyon', date: '2023-12-24', temperature: '25', humidity: 40 })).toEqual({
      location: 'Lyon',
      date: '2023-12-24',
      temperature: 25,
      humidity: 40,
    });
  });

  it('rejects invalid dates and inverted ranges', () => {
    expect(WeatherFilterSchema.safeParse({ from: 'foo' }).success).toBe(false);
    expect(WeatherFilterSchema.safeParse({ from: '2024-01-02', to: '2024-01-01' }).success).toBe(false);
  });

  it('applies and bounds the page size', () => {
    expect(WeatherPageSchema.parse({}).limit).toBe(1000);
    expect(WeatherPageSchema.safeParse({ limit: '100000' }).success).toBe(false);
    expect(WeatherPageSchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});

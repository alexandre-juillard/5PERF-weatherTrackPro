import { RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';

type Schemas = { params?: ZodTypeAny; query?: ZodTypeAny; body?: ZodTypeAny };

const types = { params: 'Params', query: 'Query', body: 'Body' } as const;

// Validates the request and stores the PARSED values (coercions, defaults) in res.locals.
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    const errors = [];
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const parsed = schema.safeParse(req[key]);
      if (parsed.success) {
        res.locals[key] = parsed.data;
      } else {
        errors.push({ type: types[key], errors: parsed.error });
      }
    }
    if (errors.length > 0) {
      res.set('Cache-Control', 'no-store').status(400).json(errors);
      return;
    }
    next();
  };

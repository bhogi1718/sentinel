import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ApiError } from "../common/ApiError";

export function validateRequest(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({ body: req.body, query: req.query, params: req.params }) as {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) Object.assign(req.query, parsed.query);
      if (parsed.params !== undefined) Object.assign(req.params, parsed.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(ApiError.badRequest("Validation failed", err.flatten()));
        return;
      }
      next(err);
    }
  };
}

import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ApiError } from "../common/ApiError";

export function validateRequest(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // AnyZodObject.parse returns `any` - the `as` narrows it to the only
      // shape validateRequest's callers ever pass in (a schema wrapping
      // body/query/params), so this is a safe assignment despite the
      // linter treating the source as an opaque `any`.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = schema.parse({ body: req.body, query: req.query, params: req.params }) as {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      // req.body is typed `any` on Express's Request - parsed.body was just
      // validated against the caller's schema immediately above, so this
      // assignment is safe despite the linter being unable to prove it.
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

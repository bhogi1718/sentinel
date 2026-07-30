import { Response } from "express";

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response<ApiSuccessBody<T>> {
  return res.status(statusCode).json({ success: true, data });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Response<ApiErrorBody> {
  return res.status(statusCode).json({ success: false, error: { code, message, details } });
}

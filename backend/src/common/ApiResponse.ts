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
  const body: ApiSuccessBody<T> = { success: true, data };
  return res.status(statusCode).json(body) as Response<ApiSuccessBody<T>>;
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Response<ApiErrorBody> {
  const body: ApiErrorBody = { success: false, error: { code, message, details } };
  return res.status(statusCode).json(body) as Response<ApiErrorBody>;
}

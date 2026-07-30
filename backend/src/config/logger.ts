import path from "path";
import winston from "winston";
import { env } from "./env";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const logsDir = path.resolve(process.cwd(), "logs");

const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return stack ? `${ts} [${level}] ${message}\n${stack}` : `${ts} [${level}] ${message}`;
  }),
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: fileFormat,
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === "production" ? fileFormat : consoleFormat,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

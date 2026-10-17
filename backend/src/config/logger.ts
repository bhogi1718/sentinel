import path from "path";
import winston from "winston";
import { env } from "./env";

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const logsDir = path.resolve(process.cwd(), "logs");

const consoleFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  printf((info) => {
    const level = String(info.level);
    const message = String(info.message);
    const ts = String(info.timestamp);
    const stack = typeof info.stack === "string" ? info.stack : undefined;
    return stack ? `${ts} [${level}] ${message}\n${stack}` : `${ts} [${level}] ${message}`;
  }),
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

// Tests deliberately trigger errors (misconfigured routes, unreachable
// agents, forged replies); writing those to logs/ would mix fake failures
// into the real log files, so test runs log to the console only.
const fileTransports =
  env.NODE_ENV === "test"
    ? []
    : [
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
      ];

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: fileFormat,
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === "production" ? fileFormat : consoleFormat,
    }),
    ...fileTransports,
  ],
});

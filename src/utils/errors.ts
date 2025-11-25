import { Response } from "express";
import { ApiResponse } from "../types";

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AirtableError extends AppError {
  constructor(
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message, statusCode, "AIRTABLE_ERROR", details);
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message: string = "Authentication failed",
    details?: Record<string, unknown>
  ) {
    super(message, 401, "AUTH_ERROR", details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = "Resource not found",
    details?: Record<string, unknown>
  ) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string = "Rate limit exceeded",
    details?: Record<string, unknown>
  ) {
    super(message, 429, "RATE_LIMIT_ERROR", details);
  }
}

/**
 * Handles Airtable API errors
 */
export function handleAirtableError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const err = error as {
    response?: {
      status?: number;
      data?: { error?: { type?: string; message?: string } };
    };
    message?: string;
    code?: string;
  };

  // Check for network errors
  if (
    err.code === "ECONNREFUSED" ||
    err.code === "ENOTFOUND" ||
    err.code === "ETIMEDOUT"
  ) {
    return new AirtableError(
      `Network error: Unable to connect to Airtable API (${err.code})`,
      503,
      { type: "NETWORK_ERROR", code: err.code }
    );
  }

  const status = err.response?.status || 500;
  const errorType = err.response?.data?.error?.type || "UNKNOWN_ERROR";
  const message =
    err.response?.data?.error?.message ||
    err.message ||
    "An error occurred with Airtable API";

  if (status === 401) {
    return new AuthenticationError(message);
  }

  if (status === 429) {
    return new RateLimitError(message);
  }

  if (status === 404) {
    return new NotFoundError(message);
  }

  return new AirtableError(message, status, { type: errorType });
}

/**
 * Handles scraping errors
 */
export function handleScrapingError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const err = error as { message?: string };
  const message = err.message || "Scraping operation failed";

  return new AppError(message, 500, "SCRAPING_ERROR");
}

/**
 * Sends error response
 */
export function sendErrorResponse(res: Response, error: unknown): Response {
  if (error instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    };
    return res.status(error.statusCode).json(response);
  }

  const err = error as { message?: string };
  const response: ApiResponse = {
    success: false,
    error: err.message || "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  };

  return res.status(500).json(response);
}

/**
 * Sends success response
 */
export function sendSuccessResponse<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode: number = 200
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };
  return res.status(statusCode).json(response);
}

/**
 * Logger utility with colors
 */
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.log(
      `${colors.green}${colors.bright}[INFO]${colors.reset} ${
        colors.dim
      }${new Date().toISOString()}${colors.reset} - ${colors.green}${message}${
        colors.reset
      }`,
      meta
        ? `\n${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`
        : ""
    );
  },
  error: (
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>
  ): void => {
    // eslint-disable-next-line no-console
    console.error(
      `${colors.red}${colors.bright}[ERROR]${colors.reset} ${
        colors.dim
      }${new Date().toISOString()}${colors.reset} - ${colors.red}${message}${
        colors.reset
      }`
    );
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(`${colors.red}${error.stack}${colors.reset}`);
    } else if (error) {
      // eslint-disable-next-line no-console
      console.error(
        `${colors.red}${JSON.stringify(error, null, 2)}${colors.reset}`
      );
    }
    if (meta) {
      // eslint-disable-next-line no-console
      console.error(
        `${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`
      );
    }
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.warn(
      `${colors.yellow}${colors.bright}[WARN]${colors.reset} ${
        colors.dim
      }${new Date().toISOString()}${colors.reset} - ${colors.yellow}${message}${
        colors.reset
      }`,
      meta
        ? `\n${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`
        : ""
    );
  },
  debug: (message: string, meta?: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.debug(
      `${colors.cyan}${colors.bright}[DEBUG]${colors.reset} ${
        colors.dim
      }${new Date().toISOString()}${colors.reset} - ${colors.cyan}${message}${
        colors.reset
      }`,
      meta
        ? `\n${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`
        : ""
    );
  },
  success: (message: string, meta?: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.log(
      `${colors.green}${colors.bright}[SUCCESS]${colors.reset} ${
        colors.dim
      }${new Date().toISOString()}${colors.reset} - ${colors.green}${message}${
        colors.reset
      }`,
      meta
        ? `\n${colors.dim}${JSON.stringify(meta, null, 2)}${colors.reset}`
        : ""
    );
  },
};

export default {
  AppError,
  AirtableError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  handleAirtableError,
  handleScrapingError,
  sendErrorResponse,
  sendSuccessResponse,
  logger,
};

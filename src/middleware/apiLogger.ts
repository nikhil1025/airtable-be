import { NextFunction, Request, Response } from "express";
// Extracted for logging middleware
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Text colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return colors.green;
    case "POST":
      return colors.cyan;
    case "PUT":
    case "PATCH":
      return colors.yellow;
    case "DELETE":
      return colors.red;
    default:
      return colors.white;
  }
}

function getStatusColor(statusCode: number): string {
  if (statusCode >= 500) return colors.red;
  if (statusCode >= 400) return colors.yellow;
  if (statusCode >= 300) return colors.cyan;
  if (statusCode >= 200) return colors.green;
  return colors.white;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function sanitizeData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  const sensitiveKeys = [
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "secret",
    "apiKey",
    "authorization",
    "cookie",
    "mfaCode",
  ];

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const [key, value] of Object.entries(sanitized)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      (sanitized as Record<string, unknown>)[key] = "***REDACTED***";
    } else if (value && typeof value === "object") {
      (sanitized as Record<string, unknown>)[key] = sanitizeData(value);
    }
  }

  return sanitized;
}

export function apiLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Store original response methods
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Track response body
  let responseBody: unknown;

  // Override res.json to capture response
  res.json = function (body: unknown) {
    responseBody = body;
    return originalJson(body);
  };

  // Override res.send to capture response
  res.send = function (body: unknown) {
    if (!responseBody) {
      try {
        responseBody = typeof body === "string" ? JSON.parse(body) : body;
      } catch {
        responseBody = body;
      }
    }
    return originalSend(body);
  };

  // Log request details
  const methodColor = getMethodColor(req.method);
  console.log("\n" + "=".repeat(100));
  console.log(
    `${colors.bright}${methodColor}${req.method}${colors.reset} ${colors.bright}${req.originalUrl}${colors.reset}`
  );
  console.log(`${colors.dim}Request ID: ${requestId}${colors.reset}`);
  console.log(`${colors.dim}Time: ${new Date().toISOString()}${colors.reset}`);
  console.log(
    `${colors.dim}IP: ${req.ip || req.socket.remoteAddress}${colors.reset}`
  );

  if (req.headers["user-agent"]) {
    console.log(
      `${colors.dim}User-Agent: ${req.headers["user-agent"]}${colors.reset}`
    );
  }

  // Log request headers (sanitized)
  if (Object.keys(req.headers).length > 0) {
    console.log(
      `\n${colors.cyan}${colors.bright}Request Headers:${colors.reset}`
    );
    const sanitizedHeaders = sanitizeData(req.headers);
    console.log(JSON.stringify(sanitizedHeaders, null, 2));
  }

  // Log query parameters
  if (Object.keys(req.query).length > 0) {
    console.log(
      `\n${colors.cyan}${colors.bright}Query Parameters:${colors.reset}`
    );
    const sanitizedQuery = sanitizeData(req.query);
    console.log(JSON.stringify(sanitizedQuery, null, 2));
  }

  // Log request body (sanitized)
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`\n${colors.cyan}${colors.bright}Request Body:${colors.reset}`);
    const sanitizedBody = sanitizeData(req.body);
    console.log(JSON.stringify(sanitizedBody, null, 2));
  }

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusColor = getStatusColor(res.statusCode);

    console.log(`\n${colors.magenta}${colors.bright}Response:${colors.reset}`);
    console.log(
      `${colors.bright}Status:${colors.reset} ${statusColor}${res.statusCode}${colors.reset}`
    );
    console.log(
      `${colors.bright}Duration:${colors.reset} ${formatDuration(duration)}`
    );

    // Log response body (sanitized)
    if (responseBody) {
      console.log(
        `\n${colors.magenta}${colors.bright}Response Body:${colors.reset}`
      );
      const sanitizedResponse = sanitizeData(responseBody);

      // Pretty print JSON with size limit
      const responseString = JSON.stringify(sanitizedResponse, null, 2);
      if (responseString.length > 5000) {
        console.log(responseString.substring(0, 5000) + "\n... (truncated)");
      } else {
        console.log(responseString);
      }
    }

    // Log error details if present
    if (res.statusCode >= 400 && responseBody) {
      const errorData = responseBody as {
        error?: string;
        code?: string;
        details?: unknown;
      };
      if (errorData.error) {
        console.log(
          `\n${colors.red}${colors.bright}Error Details:${colors.reset}`
        );
        console.log(`${colors.red}Message: ${errorData.error}${colors.reset}`);
        if (errorData.code) {
          console.log(`${colors.red}Code: ${errorData.code}${colors.reset}`);
        }
        if (errorData.details) {
          console.log(
            `${colors.red}Details: ${JSON.stringify(
              errorData.details,
              null,
              2
            )}${colors.reset}`
          );
        }
      }
    }

    // Performance warning
    if (duration > 5000) {
      console.log(
        `\n${colors.bgYellow}${
          colors.black
        }   SLOW REQUEST - ${formatDuration(duration)} ${colors.reset}`
      );
    }

    // Success/Error indicator
    const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
    const indicator = isSuccess
      ? `${colors.bgGreen}${colors.black} ✓ SUCCESS ${colors.reset}`
      : `${colors.bgRed}${colors.white} ✗ FAILED ${colors.reset}`;

    console.log(
      `\n${indicator} ${statusColor}[${res.statusCode}]${
        colors.reset
      } ${methodColor}${req.method}${colors.reset} ${
        req.originalUrl
      } - ${formatDuration(duration)}`
    );
    console.log("=".repeat(100) + "\n");
  });

  next();
}

export function simpleLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusColor = getStatusColor(res.statusCode);
    const methodColor = getMethodColor(req.method);

    console.log(
      `${methodColor}${req.method}${colors.reset} ${
        req.originalUrl
      } ${statusColor}[${res.statusCode}]${colors.reset} ${formatDuration(
        duration
      )}`
    );
  });

  next();
}

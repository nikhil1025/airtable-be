import cors from "cors";
import express, { Application, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import config from "./config";
import { connectDatabase } from "./config/database";
import { apiLogger, simpleLogger } from "./middleware/apiLogger";
import routes from "./routes";
import { AppError, logger, sendErrorResponse } from "./utils/errors";

const app: Application = express();

// Middleware
app.use(helmet()); // Security headers

// CORS configuration
const corsOptions = {
  origin: ["http://localhost:4200", "http://localhost:3000"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions)); // Enable CORS with options
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", limiter);

// Simple logging for health check
app.get("/health", simpleLogger, (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed API logging for all API routes
app.use("/api/airtable", apiLogger);

// API routes
app.use("/api/airtable", routes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    code: "NOT_FOUND",
    path: req.path,
  });
});

// Global error handler
app.use(
  (
    error: Error | AppError,
    req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    logger.error("Unhandled error", error, {
      path: req.path,
      method: req.method,
      body: req.body,
    });

    return sendErrorResponse(res, error);
  }
);

// Start server
async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Start listening
    app.listen(config.port, () => {
      logger.info(`Server started successfully`, {
        port: config.port,
        env: config.nodeEnv,
      });
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM signal received: closing HTTP server");

  // Cleanup worker pools
  const { CookieScraperService } = await import(
    "./services/CookieScraperService"
  );
  await CookieScraperService.shutdownWorkerPool();

  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT signal received: closing HTTP server");

  // Cleanup worker pools
  const { CookieScraperService } = await import(
    "./services/CookieScraperService"
  );
  await CookieScraperService.shutdownWorkerPool();

  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    logger.error("Unhandled rejection", reason, { promise });
    process.exit(1);
  }
);

// Start the server
startServer();

export default app;

import { Browser, Page } from "puppeteer";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/errors";

export interface AuthSession {
  sessionId: string;
  browser: Browser;
  page: Page;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export class AuthSessionManager {
  private sessions: Map<string, AuthSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Start auto-cleanup timer
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Run every minute

    logger.info("AuthSessionManager initialized", {
      sessionTimeout: `${this.SESSION_TIMEOUT / 1000}s`,
      cleanupInterval: "60s",
    });
  }

  createSession(browser: Browser, page: Page, userId: string): string {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_TIMEOUT);

    const session: AuthSession = {
      sessionId,
      browser,
      page,
      userId,
      createdAt: now,
      expiresAt,
    };

    this.sessions.set(sessionId, session);

    logger.info("Auth session created", {
      sessionId,
      userId,
      expiresAt: expiresAt.toISOString(),
      activeSessions: this.sessions.size,
    });

    return sessionId;
  }

  getSession(sessionId: string): AuthSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn("Session not found", { sessionId });
      return null;
    }

    // Check if expired
    if (new Date() > session.expiresAt) {
      logger.warn("Session expired", { sessionId });
      this.closeSession(sessionId);
      return null;
    }

    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    try {
      // Close browser if still open
      if (session.browser && session.browser.isConnected()) {
        await session.browser.close();
      }
    } catch (error) {
      logger.error("Error closing browser", { sessionId, error });
    }

    this.sessions.delete(sessionId);

    logger.info("Auth session closed", {
      sessionId,
      activeSessions: this.sessions.size,
    });
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length > 0) {
      logger.info("Cleaning up expired sessions", {
        count: expiredSessions.length,
        sessionIds: expiredSessions,
      });

      for (const sessionId of expiredSessions) {
        await this.closeSession(sessionId);
      }
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down AuthSessionManager", {
      activeSessions: this.sessions.size,
    });

    clearInterval(this.cleanupInterval);

    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }

    logger.info("AuthSessionManager shutdown complete");
  }
}

// Singleton instance
export const authSessionManager = new AuthSessionManager();

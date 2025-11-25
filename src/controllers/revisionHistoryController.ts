import { Request, Response } from "express";
import RevisionHistoryService from "../services/RevisionHistoryService";
import {
  FetchRevisionHistoryRequest,
  RevisionHistoryResponse,
  SyncRevisionHistoryRequest,
} from "../types";
import {
  sendErrorResponse,
  sendSuccessResponse,
  ValidationError,
} from "../utils/errors";

/**
 * POST /api/airtable/revision-history/fetch
 * Fetches revision history for a single ticket
 */
export async function fetchRevisionHistory(
  req: Request<unknown, unknown, FetchRevisionHistoryRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, baseId, tableId, recordId, rowId } = req.body;

    if (!userId || !baseId || !tableId || !recordId || !rowId) {
      throw new ValidationError(
        "userId, baseId, tableId, recordId, and rowId are required"
      );
    }

    const result = await RevisionHistoryService.fetchRevisionHistory(
      userId,
      baseId,
      tableId,
      recordId,
      rowId
    );

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * POST /api/airtable/revision-history/sync
 * Syncs revision history for all tickets
 */
export async function syncRevisionHistory(
  req: Request<unknown, unknown, SyncRevisionHistoryRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, baseId, tableId } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    // Ensure cookies are valid before starting sync
    await RevisionHistoryService.ensureValidCookies(userId);

    const result = await RevisionHistoryService.syncRevisionHistory(
      userId,
      baseId,
      tableId
    );

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

/**
 * GET /api/airtable/revision-history/:ticketId
 * Gets stored revision history for a ticket
 */
export async function getRevisionHistory(
  req: Request<{ ticketId: string }, unknown, unknown, { userId: string }>,
  res: Response
): Promise<Response> {
  try {
    const { ticketId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      throw new ValidationError("userId query parameter is required");
    }

    if (!ticketId) {
      throw new ValidationError("ticketId is required");
    }

    const revisions = await RevisionHistoryService.getRevisionHistoryForTicket(
      ticketId,
      userId
    );

    const response: RevisionHistoryResponse = {
      success: true,
      revisions,
    };

    return sendSuccessResponse(res, response);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export default {
  fetchRevisionHistory,
  syncRevisionHistory,
  getRevisionHistory,
};

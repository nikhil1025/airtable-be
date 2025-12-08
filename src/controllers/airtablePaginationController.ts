import { Request, Response } from "express";
import AirtablePaginationService from "../services/AirtablePaginationService";
import {
  logger,
  sendErrorResponse,
  sendSuccessResponse,
  ValidationError,
} from "../utils/errors";

interface PaginatedBasesRequest {
  userId: string;
  offset?: string;
  pageSize?: number;
}

interface PaginatedTablesRequest {
  userId: string;
  baseId: string;
  offset?: string;
  pageSize?: number;
}

interface PaginatedRecordsRequest {
  userId: string;
  baseId: string;
  tableId: string;
  offset?: string;
  pageSize?: number;
}

export async function getPaginatedBases(
  req: Request<unknown, unknown, PaginatedBasesRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, offset, pageSize = 100 } = req.body;

    if (!userId) {
      throw new ValidationError("userId is required");
    }

    logger.info("Fetching paginated bases", { userId, offset, pageSize });

    const result = await AirtablePaginationService.fetchPaginatedBases(
      userId,
      offset,
      pageSize
    );

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export async function getPaginatedTables(
  req: Request<unknown, unknown, PaginatedTablesRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, baseId, offset, pageSize = 100 } = req.body;

    if (!userId || !baseId) {
      throw new ValidationError("userId and baseId are required");
    }

    logger.info("Fetching paginated tables", {
      userId,
      baseId,
      offset,
      pageSize,
    });

    const result = await AirtablePaginationService.fetchPaginatedTables(
      userId,
      baseId,
      offset,
      pageSize
    );

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

export async function getPaginatedRecords(
  req: Request<unknown, unknown, PaginatedRecordsRequest>,
  res: Response
): Promise<Response> {
  try {
    const { userId, baseId, tableId, offset, pageSize = 100 } = req.body;

    if (!userId || !baseId || !tableId) {
      throw new ValidationError("userId, baseId, and tableId are required");
    }

    logger.info("Fetching paginated records", {
      userId,
      baseId,
      tableId,
      offset,
      pageSize,
    });

    const result = await AirtablePaginationService.fetchPaginatedRecords(
      userId,
      baseId,
      tableId,
      offset,
      pageSize
    );

    return sendSuccessResponse(res, result);
  } catch (error) {
    return sendErrorResponse(res, error);
  }
}

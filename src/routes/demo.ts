import { Router } from "express";
import Project from "../models/Project";
import Table from "../models/Table";
import Ticket from "../models/Ticket";
import { sendErrorResponse, sendSuccessResponse } from "../utils/errors";

const router = Router();

router.get("/stats", async (_req, res) => {
  try {
    // Count all documents in the database
    const [projectsCount, tablesCount, ticketsCount] = await Promise.all([
      Project.countDocuments(),
      Table.countDocuments(),
      Ticket.countDocuments(),
    ]);

    const stats = {
      projects: projectsCount,
      tables: tablesCount,
      tickets: ticketsCount,
      revisions: 0, // Placeholder since we don't have revision history count
    };

    sendSuccessResponse(res, {
      stats,
      message: "Stats retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching stats:", error);
    sendErrorResponse(res, error);
  }
});

router.get("/projects", async (_req, res) => {
  try {
    const projects = await Project.find()
      .select("airtableBaseId name permissionLevel createdAt updatedAt")
      .limit(100)
      .sort({ updatedAt: -1 });

    // Map to match frontend expectations
    const formattedProjects = projects.map((p) => ({
      id: p.airtableBaseId,
      name: p.name,
      permissionLevel: p.permissionLevel,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    sendSuccessResponse(res, {
      bases: formattedProjects,
      count: formattedProjects.length,
      message: "Projects retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching projects:", error);
    sendErrorResponse(res, error);
  }
});

router.get("/tables/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const tables = await Table.find({ baseId: projectId })
      .select(
        "airtableTableId name description fields baseId createdAt updatedAt"
      )
      .limit(100)
      .sort({ updatedAt: -1 });

    // Map to match frontend expectations
    const formattedTables = tables.map((t) => ({
      id: t.airtableTableId,
      name: t.name,
      description: t.description,
      fields: t.fields,
      baseId: t.baseId,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    sendSuccessResponse(res, {
      tables: formattedTables,
      count: formattedTables.length,
      projectId,
      message: "Tables retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching tables:", error);
    sendErrorResponse(res, error);
  }
});

router.get("/tickets/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const tickets = await Ticket.find({ airtableTableId: tableId })
      .select(
        "airtableRecordId data airtableTableId baseId createdAt updatedAt"
      )
      .limit(limit)
      .sort({ updatedAt: -1 });

    sendSuccessResponse(res, {
      tickets,
      count: tickets.length,
      tableId,
      message: "Tickets retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error fetching tickets:", error);
    sendErrorResponse(res, error);
  }
});

export default router;

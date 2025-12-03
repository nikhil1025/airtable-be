import * as cheerio from "cheerio";
import { RevisionChange } from "../types";
import { logger } from "./errors";

export function parseRevisionHistoryHTML(html: string): RevisionChange[] {
  try {
    const $ = cheerio.load(html);
    const revisions: RevisionChange[] = [];

    $(".activity-item, .revision-item, [data-activity-id]").each(
      (index, element) => {
        try {
          const $element = $(element);

          // Extract activity ID (UUID)
          const uuid =
            $element.attr("data-activity-id") ||
            $element.find("[data-activity-id]").attr("data-activity-id") ||
            $element.attr("id") ||
            `activity_${Date.now()}_${index}`;

          // Extract issue/record ID
          const issueId =
            $element.attr("data-record-id") ||
            $element.find("[data-record-id]").attr("data-record-id") ||
            "";

          // Extract column type (field name)
          const columnTypeText = $element
            .find(".field-name, .column-name")
            .text()
            .trim();

          // Only process if it's a Status or Assignee change
          if (
            !columnTypeText.includes("Status") &&
            !columnTypeText.includes("Assignee")
          ) {
            return; // Continue to next item
          }

          const columnType = columnTypeText.includes("Status")
            ? "Status"
            : "Assignee";

          // Extract old and new values
          const oldValue =
            $element.find(".old-value, .previous-value").text().trim() ||
            $element.find("del, .strikethrough").text().trim() ||
            "";

          const newValue =
            $element.find(".new-value, .current-value").text().trim() ||
            $element.find("ins, .highlight").text().trim() ||
            "";

          // Extract created date
          const createdDateText =
            $element.find(".timestamp, .date, time").attr("datetime") ||
            $element.find(".timestamp, .date, time").text().trim();

          const createdDate = createdDateText
            ? new Date(createdDateText)
            : new Date();

          // Extract author
          const authoredBy =
            $element.find(".author, .user").attr("data-user-id") ||
            $element.find(".author, .user").text().trim() ||
            "unknown";

          // Only add if we have the required fields
          if (uuid && (columnType === "Status" || columnType === "Assignee")) {
            revisions.push({
              uuid,
              issueId,
              columnType,
              oldValue,
              newValue,
              createdDate,
              authoredBy,
            });
          }
        } catch (error) {
          logger.error("Error parsing individual activity item", error, {
            index,
          });
        }
      }
    );

    logger.info("Parsed revision history", { count: revisions.length });

    return revisions;
  } catch (error) {
    logger.error("Failed to parse revision history HTML", error);
    return [];
  }
}

export function filterStatusAndAssigneeChanges(
  revisions: RevisionChange[]
): RevisionChange[] {
  return revisions.filter((revision) => {
    return (
      revision.columnType === "Status" || revision.columnType === "Assignee"
    );
  });
}

export function parseRevisionJSON(jsonData: unknown): RevisionChange[] {
  try {
    const data = jsonData as {
      activities?: Array<{
        id?: string;
        recordId?: string;
        fieldName?: string;
        oldValue?: string;
        newValue?: string;
        createdTime?: string;
        userId?: string;
      }>;
    };

    if (!data.activities || !Array.isArray(data.activities)) {
      return [];
    }

    const revisions: RevisionChange[] = [];

    for (const activity of data.activities) {
      const fieldName = activity.fieldName || "";

      // Only process Status and Assignee changes
      if (!fieldName.includes("Status") && !fieldName.includes("Assignee")) {
        continue;
      }

      const columnType = fieldName.includes("Status") ? "Status" : "Assignee";

      revisions.push({
        uuid: activity.id || `activity_${Date.now()}`,
        issueId: activity.recordId || "",
        columnType,
        oldValue: activity.oldValue || "",
        newValue: activity.newValue || "",
        createdDate: activity.createdTime
          ? new Date(activity.createdTime)
          : new Date(),
        authoredBy: activity.userId || "unknown",
      });
    }

    return revisions;
  } catch (error) {
    logger.error("Failed to parse revision JSON", error);
    return [];
  }
}

export default {
  parseRevisionHistoryHTML,
  filterStatusAndAssigneeChanges,
  parseRevisionJSON,
};

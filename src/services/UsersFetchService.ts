import axios from "axios";
import { AirtableConnection, WorkspaceUser } from "../models";
import { decrypt, isEncrypted } from "../utils/encryption";

/**
 * USERS FETCH SERVICE
 *
 * This service fetches workspace users using cookie-based authentication
 * and stores them in MongoDB WorkspaceUser collection.
 *
 * Similar pattern to RevisionHistoryFetchService but for workspace users.
 */

interface AirtableWorkspaceUser {
  id: string;
  email: string;
  name: string;
  state: string;
  createdTime?: string;
  lastActivityTime?: string;
  invitedToAirtableByUserId?: string;
  permissionLevel?: string;
  workspaceId?: string;
  workspaceName?: string;
}

interface WorkspaceResult {
  workspaceId: string;
  workspaceName: string;
  users: AirtableWorkspaceUser[];
  error?: string;
}

export class UsersFetchService {
  private userId: string;
  private cookies: string = "";

  constructor(userId: string) {
    this.userId = userId;
    console.log(`[UsersFetchService] Initialized for user: ${userId}`);
  }

  /**
   * Fetch and store workspace users
   */
  async fetchAndStoreWorkspaceUsers(): Promise<AirtableWorkspaceUser[]> {
    try {
      console.log(
        `[UsersFetchService] [STEP 1] Starting fetch for userId: ${this.userId}`
      );

      // Fetch cookies and access token from DB
      const credentialsFetched = await this.fetchCredentialsFromDB();
      if (!credentialsFetched) {
        throw new Error("Could not fetch credentials");
      }

      console.log(`[UsersFetchService] [STEP 2] Fetching workspace users...`);

      // Fetch users from Airtable
      const users = await this.fetchUsersFromAirtable();

      console.log(
        `[UsersFetchService] [STEP 3] Storing ${users.length} users in database...`
      );

      // Store users in MongoDB
      await this.storeUsersInDB(users);

      console.log(
        `[UsersFetchService] ✓ Successfully fetched and stored ${users.length} users`
      );

      return users;
    } catch (error) {
      console.error(`[UsersFetchService] ✗ Error fetching users:`, error);
      throw error;
    }
  }

  /**
   * Fetch cookies and access token from MongoDB
   */
  private async fetchCredentialsFromDB(): Promise<boolean> {
    try {
      console.log(
        `[UsersFetchService] Fetching credentials for user: ${this.userId}`
      );

      const connection = await AirtableConnection.findOne({
        userId: this.userId,
      });

      if (!connection) {
        console.error(
          `[UsersFetchService] ✗ No connection found for userId: ${this.userId}`
        );
        return false;
      }

      console.log(`[UsersFetchService] ✓ Found AirtableConnection document`);

      // Get cookies
      if (connection.cookies) {
        let cookieString = connection.cookies;
        if (isEncrypted(cookieString)) {
          console.log(
            "[UsersFetchService] Cookies are encrypted, decrypting..."
          );
          try {
            cookieString = decrypt(cookieString);
            console.log("[UsersFetchService] ✓ Cookies decrypted successfully");
          } catch (error) {
            console.error(
              "[UsersFetchService] ✗ Failed to decrypt cookies:",
              error
            );
            return false;
          }
        }
        this.cookies = cookieString;
        console.log(
          `[UsersFetchService] ✓ Cookies retrieved (${cookieString.length} chars)`
        );
      }

      console.log("[UsersFetchService] ✓ Credentials loaded successfully");

      return true;
    } catch (error) {
      console.error(`[UsersFetchService] ✗ Error fetching credentials:`, error);
      return false;
    }
  }

  /**
   * Get common headers for Airtable API requests
   */
  private getAirtableHeaders(workspaceId?: string): Record<string, string> {
    // CRITICAL: Convert cookies from JSON array to HTTP Cookie header format
    // Cookies are stored as JSON string: "[{name: 'x', value: 'y'}, ...]"
    // But HTTP Cookie header needs: "x=y; a=b; ..."
    let cookieHeader = "";
    if (this.cookies) {
      try {
        const cookiesArray = JSON.parse(this.cookies);
        cookieHeader = cookiesArray
          .map(
            (cookie: { name: string; value: string }) =>
              `${cookie.name}=${cookie.value}`
          )
          .join("; ");
      } catch (error) {
        console.error(
          "[UsersFetchService] Failed to parse cookies, using as-is:",
          error
        );
        cookieHeader = this.cookies; // Fallback to raw string if not JSON
      }
    }

    const headers: Record<string, string> = {
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      cookie: cookieHeader,
      pragma: "no-cache",
      "sec-ch-ua":
        '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "x-airtable-inter-service-client": "webClient",
      "x-requested-with": "XMLHttpRequest",
      "x-user-locale": "en",
    };

    if (workspaceId) {
      headers[
        "referer"
      ] = `https://airtable.com/${workspaceId}/workspace/billing`;
    } else {
      headers["referer"] = "https://airtable.com/";
    }

    return headers;
  }

  /**
   * Discover all workspaces the user has access to
   */
  private async discoverWorkspaces(): Promise<string[]> {
    console.log("[UsersFetchService] Discovering workspaces...");

    const workspaceIds: string[] = [];

    try {
      // Method 1: Try HTML scraping from home page
      console.log(
        "[UsersFetchService] Scraping home page for workspace IDs..."
      );
      const response = await axios.get("https://airtable.com/", {
        headers: this.getAirtableHeaders(),
        timeout: 30000,
      });

      const html = String(response.data);
      const wspMatches = html.match(/wsp[a-zA-Z0-9]{14}/g) || [];
      const uniqueWsps = [...new Set(wspMatches)];

      if (uniqueWsps.length > 0) {
        console.log(
          `[UsersFetchService] Found ${uniqueWsps.length} workspace IDs in HTML`
        );
        uniqueWsps.forEach((wsId) => {
          if (typeof wsId === "string" && !workspaceIds.includes(wsId)) {
            // Filter out the shared workspace placeholder
            if (!wsId.includes("SHARED")) {
              workspaceIds.push(wsId);
              console.log(`[UsersFetchService]   - ${wsId}`);
            }
          }
        });
      }
    } catch (error: any) {
      console.error(
        `[UsersFetchService] Workspace discovery failed: ${error.message}`
      );
    }

    if (workspaceIds.length === 0) {
      throw new Error(
        "Could not discover any workspaces. Please check credentials."
      );
    }

    console.log(
      `[UsersFetchService] Total workspaces discovered: ${workspaceIds.length}`
    );
    return workspaceIds;
  }

  /**
   * Fetch users for a specific workspace
   */
  private async fetchWorkspaceUsers(
    workspaceId: string
  ): Promise<WorkspaceResult> {
    console.log(
      `[UsersFetchService] Fetching users for workspace: ${workspaceId}`
    );

    try {
      const response = await axios.get(
        `https://airtable.com/v0.3/${workspaceId}/workspace/workspaceSettings`,
        {
          headers: this.getAirtableHeaders(workspaceId),
          timeout: 30000,
        }
      );

      const workspaceData = response.data.workspaceData;
      const workspaceName = workspaceData?.workspaceName || "Unnamed Workspace";
      const billableUserBreakdown = workspaceData?.billableUserBreakdown;

      console.log(`[UsersFetchService]   Workspace: ${workspaceName}`);

      if (!billableUserBreakdown) {
        console.log(
          `[UsersFetchService]   ⚠ No user data available for this workspace`
        );
        return {
          workspaceId,
          workspaceName,
          users: [],
        };
      }

      const userProfiles =
        billableUserBreakdown.billableUserProfileInfoById || {};
      const collaborators = billableUserBreakdown.workspaceCollaborators || [];

      console.log(
        `[UsersFetchService]   Found ${
          Object.keys(userProfiles).length
        } user profiles, ${collaborators.length} collaborators`
      );

      // Combine profile and collaborator data
      const users: AirtableWorkspaceUser[] = [];
      for (const collaborator of collaborators) {
        const profile = userProfiles[collaborator.userId];
        if (profile) {
          users.push({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            state: "active",
            createdTime: collaborator.createdTime,
            lastActivityTime: collaborator.createdTime,
            invitedToAirtableByUserId: collaborator.grantedByUserId,
            permissionLevel: collaborator.permissionLevel,
          });
        }
      }

      return {
        workspaceId,
        workspaceName,
        users,
      };
    } catch (error: any) {
      console.error(
        `[UsersFetchService]   ✗ Failed to fetch users: ${
          error.response?.status || error.message
        }`
      );
      return {
        workspaceId,
        workspaceName: "Unknown",
        users: [],
        error: error.message,
      };
    }
  }

  /**
   * Fetch users from all workspaces (combines all workspace users)
   */
  private async fetchUsersFromAirtable(): Promise<AirtableWorkspaceUser[]> {
    try {
      const allUsers: AirtableWorkspaceUser[] = [];

      // Discover all workspaces
      const workspaceIds = await this.discoverWorkspaces();

      // Fetch users from each workspace
      for (const workspaceId of workspaceIds) {
        const result = await this.fetchWorkspaceUsers(workspaceId);
        if (result.users.length > 0) {
          // Tag each user with workspace info
          const taggedUsers = result.users.map((user) => ({
            ...user,
            workspaceId: result.workspaceId,
            workspaceName: result.workspaceName,
          }));
          console.log(
            `[UsersFetchService] ✓ Added ${result.users.length} users from ${result.workspaceName}`
          );
          allUsers.push(...taggedUsers);
        }
      }

      console.log(
        `[UsersFetchService] ✓ Successfully fetched ${allUsers.length} total users from ${workspaceIds.length} workspaces`
      );

      return allUsers;
    } catch (error) {
      console.error(`[UsersFetchService] ✗ Error fetching users:`, error);
      throw error;
    }
  }

  /**
   * Store users in MongoDB
   */
  private async storeUsersInDB(users: AirtableWorkspaceUser[]): Promise<void> {
    try {
      if (users.length === 0) {
        console.log("[UsersFetchService] No users to store");
        return;
      }

      // Clear existing users for this user
      const deleteResult = await WorkspaceUser.deleteMany({
        userId: this.userId,
      });
      console.log(
        `[UsersFetchService] Cleared ${deleteResult.deletedCount} existing users`
      );

      // Bulk upsert users
      const bulkOps = users.map((user) => ({
        updateOne: {
          filter: { airtableUserId: user.id, userId: this.userId },
          update: {
            $set: {
              airtableUserId: user.id,
              email: user.email,
              name: user.name,
              state: user.state,
              createdTime: user.createdTime,
              lastActivityTime: user.lastActivityTime,
              invitedToAirtableByUserId: user.invitedToAirtableByUserId,
              workspaceId: (user as any).workspaceId,
              workspaceName: (user as any).workspaceName,
              permissionLevel: user.permissionLevel,
              userId: this.userId,
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        await WorkspaceUser.bulkWrite(bulkOps);
        console.log(
          `[UsersFetchService] ✓ Stored ${bulkOps.length} users in database`
        );
      }
    } catch (error) {
      console.error(`[UsersFetchService] ✗ Error storing users:`, error);
      throw error;
    }
  }

  /**
   * PUBLIC: Get all workspaces for the user
   */
  async getWorkspaces(): Promise<
    { workspaceId: string; workspaceName: string }[]
  > {
    try {
      // Fetch credentials first
      const credentialsLoaded = await this.fetchCredentialsFromDB();
      if (!credentialsLoaded) {
        throw new Error("Failed to load credentials from database");
      }

      // Discover workspaces
      const workspaceIds = await this.discoverWorkspaces();

      // Fetch basic info for each workspace
      const workspaces: { workspaceId: string; workspaceName: string }[] = [];
      for (const workspaceId of workspaceIds) {
        const result = await this.fetchWorkspaceUsers(workspaceId);
        workspaces.push({
          workspaceId: result.workspaceId,
          workspaceName: result.workspaceName,
        });
      }

      return workspaces;
    } catch (error) {
      console.error(`[UsersFetchService] ✗ Error getting workspaces:`, error);
      throw error;
    }
  }

  /**
   * PUBLIC: Fetch users from a specific workspace
   */
  async fetchUsersForWorkspace(workspaceId: string): Promise<WorkspaceResult> {
    try {
      // Fetch credentials first
      const credentialsLoaded = await this.fetchCredentialsFromDB();
      if (!credentialsLoaded) {
        throw new Error("Failed to load credentials from database");
      }

      // Fetch users for the specific workspace
      return await this.fetchWorkspaceUsers(workspaceId);
    } catch (error) {
      console.error(
        `[UsersFetchService] ✗ Error fetching workspace users:`,
        error
      );
      throw error;
    }
  }

  /**
   * PUBLIC: Fetch users from all workspaces and return detailed results
   */
  async fetchUsersFromAllWorkspaces(): Promise<WorkspaceResult[]> {
    try {
      // Fetch credentials first
      const credentialsLoaded = await this.fetchCredentialsFromDB();
      if (!credentialsLoaded) {
        throw new Error("Failed to load credentials from database");
      }

      // Discover all workspaces
      const workspaceIds = await this.discoverWorkspaces();

      // Fetch users from each workspace
      const results: WorkspaceResult[] = [];
      for (const workspaceId of workspaceIds) {
        const result = await this.fetchWorkspaceUsers(workspaceId);
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error(
        `[UsersFetchService] ✗ Error fetching all workspace users:`,
        error
      );
      throw error;
    }
  }
}

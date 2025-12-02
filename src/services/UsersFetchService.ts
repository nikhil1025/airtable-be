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
   * Fetch users from Airtable API
   */
  private async fetchUsersFromAirtable(): Promise<AirtableWorkspaceUser[]> {
    try {
      const allUsers: AirtableWorkspaceUser[] = [];

      // Hardcoded workspace ID (can be made dynamic later)
      const workspaceId = "wspFSDypvIF8fNgP3";
      console.log(`[UsersFetchService] Using workspace ID: ${workspaceId}`);

      // Fetch workspace settings using exact headers from successful dd file request
      console.log("[UsersFetchService] Fetching workspace settings...");
      const response = await axios.get(
        `https://airtable.com/v0.3/${workspaceId}/workspace/workspaceSettings`,
        {
          headers: {
            accept: "*/*",
            "accept-encoding": "gzip, deflate, br, zstd",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            "cache-control": "no-cache",
            cookie: this.cookies || "",
            pragma: "no-cache",
            referer: `https://airtable.com/${workspaceId}/workspace/billing`,
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
          },
          timeout: 30000,
        }
      );

      const billableUserBreakdown =
        response.data.workspaceData?.billableUserBreakdown;

      if (!billableUserBreakdown) {
        console.warn(
          "[UsersFetchService] ⚠ No billableUserBreakdown found in response"
        );
        return [];
      }

      const userProfiles =
        billableUserBreakdown.billableUserProfileInfoById || {};
      const collaborators = billableUserBreakdown.workspaceCollaborators || [];

      console.log(
        `[UsersFetchService] Found ${
          Object.keys(userProfiles).length
        } user profiles and ${collaborators.length} collaborators`
      );

      // Combine profile and collaborator data
      for (const collaborator of collaborators) {
        const profile = userProfiles[collaborator.userId];
        if (profile) {
          const user: AirtableWorkspaceUser = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            state: "active",
            createdTime: collaborator.createdTime,
            lastActivityTime: collaborator.createdTime,
            invitedToAirtableByUserId: collaborator.grantedByUserId,
          };

          allUsers.push(user);
        }
      }

      console.log(
        `[UsersFetchService] ✓ Successfully fetched ${allUsers.length} users`
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
}

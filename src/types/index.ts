// Airtable API Response Types
export interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

export interface AirtableTable {
  id: string;
  name: string;
  description?: string;
  fields: AirtableField[];
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
  rowId?: string; // Added for internal tracking
}

export interface AirtableUser {
  id: string;
  email: string;
  name?: string;
}

export interface AirtableWorkspaceUser {
  id: string;
  email: string;
  name?: string;
  state?: string;
  createdTime?: string;
  lastActivityTime?: string;
  invitedToAirtableByUserId?: string;
}

export interface BillableUserProfile {
  id: string;
  name: string;
  profilePicUrl: string;
  email: string;
  isServiceAccount: boolean;
}

export interface WorkspaceCollaborator {
  userId: string;
  permissionLevel: string;
  grantedByUserId: string;
  createdTime: string;
}

export interface BillableUserBreakdown {
  numWorkspaceLevelBillableCollaborators: number;
  numTotalBillableCollaborators: number;
  numTotalEditorOrAbovePermissionCollaborators: number;
  billableUserProfileInfoById: Record<string, BillableUserProfile>;
  workspaceCollaborators: WorkspaceCollaborator[];
  editorOrAbovePermissionCollaboratorsUserIds: string[];
  allCollaboratorUserIds: string[];
}

export interface WorkspaceSettingsResponse {
  workspaceData: {
    workspaceId: string;
    workspaceName: string;
    billableUserBreakdown: BillableUserBreakdown;
  };
}

export interface AirtablePaginatedResponse<T> {
  records?: T[];
  bases?: AirtableBase[];
  tables?: AirtableTable[];
  users?: AirtableUser[];
  workspaceUsers?: AirtableWorkspaceUser[];
  offset?: string;
}

// OAuth Types
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface OAuthRefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// API Request Types
export interface AuthorizeRequest {
  userId: string;
}

export interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export interface OAuthCallbackQueryOld {
  code: string;
  state: string;
}

export interface RefreshTokenRequest {
  userId: string;
}

export interface SyncBasesRequest {
  userId: string;
  forceSync?: boolean; // When true, fetches from Airtable; when false, fetches from MongoDB
}

export interface SyncTablesRequest {
  userId: string;
  baseId: string;
  forceSync?: boolean;
}

export interface SyncTicketsRequest {
  userId: string;
  baseId: string;
  tableId: string;
  forceSync?: boolean;
}

export interface SyncUsersRequest {
  userId: string;
  forceSync?: boolean;
}

export interface SyncAllRequest {
  userId: string;
}

export interface SetCookiesRequest {
  userId: string;
  cookieString: string;
}

export interface ValidateCookiesRequest {
  userId: string;
}

export interface RefreshCookiesRequest {
  userId: string;
  cookieString: string;
}

export interface FetchRevisionHistoryRequest {
  userId: string;
  baseId: string;
  tableId: string;
  recordId: string;
  rowId: string;
}

export interface SyncRevisionHistoryRequest {
  userId: string;
  baseId?: string;
  tableId?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface AuthorizeResponse {
  authUrl: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  accessToken: string;
}

export interface BasesResponse {
  bases: AirtableBase[];
  offset?: string;
  hasMore: boolean;
}

export interface TablesResponse {
  tables: AirtableTable[];
  offset?: string;
  hasMore: boolean;
}

export interface TicketsResponse {
  records: Array<{
    id: string;
    fields: Record<string, unknown>;
    createdTime: string;
    rowId?: string; // Made optional to match AirtableRecord
  }>;
  offset?: string;
  hasMore: boolean;
}

export interface UsersResponse {
  users: AirtableUser[];
  offset?: string;
  hasMore: boolean;
}

export interface WorkspaceUsersResponse {
  workspaceUsers: AirtableWorkspaceUser[];
}

export interface SyncAllResponse {
  success: boolean;
  synced: {
    bases: number;
    tables: number;
    tickets: number;
    users: number;
  };
}

export interface CookiesSetResponse {
  success: boolean;
  message: string;
  validUntil: Date;
}

export interface CookiesValidateResponse {
  valid: boolean;
  validUntil?: Date;
  message: string;
}

// Revision History Types
export interface RevisionChange {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: string;
  newValue: string;
  createdDate: Date;
  authoredBy: string;
}

export interface RevisionHistoryResponse {
  success: boolean;
  revisions: RevisionChange[];
  message?: string; // Optional message for errors or warnings
}

export interface SyncRevisionHistoryResponse {
  success: boolean;
  processed: number;
  synced: number;
  failed: number;
  errors: Array<{
    recordId: string;
    error: string;
  }>;
}

// Database Document Types
export interface AirtableConnectionDocument {
  userId: string;
  accessToken: string;
  refreshToken: string;
  scrapedAccessToken?: string; // Tokens from cookie scraping (separate from OAuth)
  cookies?: string;
  localStorage?: string;
  cookiesValidUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDocument {
  airtableBaseId: string;
  name: string;
  permissionLevel: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TableDocument {
  airtableTableId: string;
  baseId: string;
  name: string;
  description?: string;
  fields: AirtableField[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketDocument {
  airtableRecordId: string;
  baseId: string;
  tableId: string;
  fields: Record<string, unknown>;
  rowId: string;
  createdTime: Date;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument {
  airtableUserId: string;
  email: string;
  name?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RevisionHistoryDocument {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: string;
  newValue: string;
  createdDate: Date;
  authoredBy: string;
  authorName?: string;
  baseId: string;
  tableId: string;
  userId: string;
  rawData?: any;
  createdAt: Date;
  updatedAt: Date;
}

// Utility Types
export interface PaginationMetadata {
  offset?: string;
  hasMore: boolean;
}

export interface BatchProcessResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

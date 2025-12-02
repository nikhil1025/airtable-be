# Users Fetch Test Scripts

This directory contains test scripts to verify the workspace users fetch functionality using cookie-based authentication.

## Test Scripts

### 1. `test-users-fetch.ts` - Direct Service Test

Tests the `UsersFetchService` directly by connecting to MongoDB and running the service.

**Prerequisites:**

- MongoDB connection available
- Valid cookies set in AirtableConnection for the test user

**Usage:**

```bash
# Set the test user ID
export TEST_USER_ID=your_actual_user_id

# Run the test
npx ts-node src/scripts/test-users-fetch.ts
```

**What it tests:**

- MongoDB connection
- AirtableConnection credentials validation
- UsersFetchService functionality
- Workspace users fetch from Airtable API
- Database storage of users
- Detailed user information display

---

### 2. `test-users-fetch-api.ts` - API Endpoint Test

Tests the GET `/api/users/fetch/:userId` endpoint by making HTTP requests to the running server.

**Prerequisites:**

- Backend server must be running (`npm run dev`)
- Valid cookies set in AirtableConnection for the test user

**Usage:**

```bash
# Set the test user ID (and optionally API base URL)
export TEST_USER_ID=your_actual_user_id
export API_BASE_URL=http://localhost:3000  # Optional, defaults to localhost:3000

# Run the test
npx ts-node src/scripts/test-users-fetch-api.ts
```

**What it tests:**

- API endpoint availability
- HTTP request/response handling
- Cookie-based authentication through API
- Response format and data structure
- Response time measurement

---

## Setting Up Test User

Before running tests, ensure you have:

1. **Valid cookies** set for your test user:

   ```bash
   # Use the cookie setter endpoint
   curl -X POST http://localhost:3000/api/airtable/cookies/set-cookies \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "your_user_id",
       "cookies": "your_browser_cookies_here",
       "accessToken": "your_access_token_here"
     }'
   ```

2. **Environment variables** configured:
   ```bash
   export TEST_USER_ID=your_actual_user_id
   ```

---

## Expected Output

### Successful Test Output:

```
================================================================================
USERS FETCH API ENDPOINT TEST
================================================================================
API Base URL: http://localhost:3000
Test User ID: test_user_123
Endpoint: GET /api/users/fetch/test_user_123
Started at: 2025-12-02T12:00:00.000Z
================================================================================

[STEP 1] Sending request to fetch users endpoint...
✓ Request completed in 2456ms

[STEP 2] Analyzing response...
Status Code: 200
Success: true

================================================================================
RESULTS
================================================================================
Total Users Fetched: 5
Message: Successfully fetched 5 workspace users

================================================================================
USER DETAILS
================================================================================

1. John Doe
   Email: john@example.com
   ID: usrXXXXXXXXXXXXXX
   State: active
   Created: 2024-01-15T10:30:00.000Z
   Last Activity: 2024-01-15T10:30:00.000Z
   Invited By: usrYYYYYYYYYYYYYY

...

================================================================================
TEST SUMMARY
================================================================================
✓ API Endpoint: Working
✓ Authentication: Successful
✓ Users Fetched: 5
✓ Response Time: 2456ms
✓ Status: TEST PASSED
Completed at: 2025-12-02T12:00:05.000Z
================================================================================
```

### Failed Test Output:

```
================================================================================
TEST FAILED
================================================================================
Status Code: 500
Error Message: Request failed with status code 500

Response Data:
{
  "success": false,
  "message": "Failed to fetch workspace users",
  "error": "No access token found. Please set a valid token."
}
================================================================================
```

---

## Troubleshooting

### Error: "No connection found for user"

- Ensure cookies are set via `/api/airtable/cookies/set-cookies` endpoint
- Verify `TEST_USER_ID` matches the userId used when setting cookies

### Error: "No access token found"

- Set either `scrapedAccessToken` or `accessToken` in AirtableConnection
- Use the cookie setter endpoint to provide access token

### Error: "Connection refused"

- Start the backend server: `npm run dev`
- Verify the server is running on the correct port (default: 3000)

### Error: "No users found"

- Workspace might be empty
- Check if credentials have proper permissions
- Verify workspace ID is correctly detected

---

## Comparison with Revision History

This follows the same pattern as revision history testing:

- Similar service architecture (`UsersFetchService` vs `RevisionHistoryFetchService`)
- Cookie-based authentication
- GET endpoint with userId parameter
- MongoDB storage
- Detailed logging and progress tracking

---

## Next Steps

After successful tests:

1. Integrate with frontend to display workspace users
2. Add user filtering and search capabilities
3. Implement user role management
4. Add pagination for large user lists

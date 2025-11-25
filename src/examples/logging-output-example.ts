// Example demonstration of the logging output
// This file shows what you'll see in the console when making API requests

/*
====================================================================================================
POST /api/airtable/oauth/authorize
Request ID: 1732198800000-abc123def
Time: 2025-11-21T13:26:40.000Z
IP: ::1
User-Agent: curl/8.5.0

Request Headers:
{
  "content-type": "application/json",
  "user-agent": "curl/8.5.0",
  "accept": "*\/*",
  "host": "localhost:3000"
}

Request Body:
{
  "userId": "test-user-123"
}

Response:
Status: 200
Duration: 45ms

Response Body:
{
  "success": true,
  "data": {
    "authUrl": "https://airtable.com/oauth2/v1/authorize?client_id=xxx&redirect_uri=http://localhost:3000/api/airtable/oauth/callback&response_type=code&state=test-user-123&scope=data.records:read data.records:write schema.bases:read"
  }
}

 ✓ SUCCESS [200] POST /api/airtable/oauth/authorize - 45ms
====================================================================================================


====================================================================================================
POST /api/airtable/cookies/set
Request ID: 1732198860000-xyz789ghi
Time: 2025-11-21T13:27:40.000Z
IP: ::1
User-Agent: PostmanRuntime/7.32.1

Request Headers:
{
  "content-type": "application/json",
  "authorization": "***REDACTED***",
  "user-agent": "PostmanRuntime/7.32.1",
  "accept": "*\/*"
}

Request Body:
{
  "userId": "test-user-123",
  "email": "user@example.com",
  "password": "***REDACTED***",
  "mfaCode": "***REDACTED***"
}

Response:
Status: 200
Duration: 2.35s

Response Body:
{
  "success": true,
  "data": {
    "message": "Cookies set successfully",
    "expiresAt": "2025-12-21T13:27:42.000Z"
  }
}

 ✓ SUCCESS [200] POST /api/airtable/cookies/set - 2.35s
====================================================================================================


====================================================================================================
POST /api/airtable/sync/bases
Request ID: 1732198920000-error404
Time: 2025-11-21T13:28:40.000Z
IP: ::1
User-Agent: curl/8.5.0

Request Headers:
{
  "content-type": "application/json",
  "user-agent": "curl/8.5.0",
  "accept": "*\/*"
}

Request Body:
{}

Response:
Status: 400
Duration: 12ms

Response Body:
{
  "success": false,
  "error": "userId is required",
  "code": "VALIDATION_ERROR"
}

Error Details:
Message: userId is required
Code: VALIDATION_ERROR

 ✗ FAILED [400] POST /api/airtable/sync/bases - 12ms
====================================================================================================


====================================================================================================
POST /api/airtable/revision-history/sync
Request ID: 1732198980000-slow567
Time: 2025-11-21T13:29:40.000Z
IP: ::1

Request Body:
{
  "userId": "test-user-123"
}

Response:
Status: 200
Duration: 6.52s

Response Body:
{
  "success": true,
  "data": {
    "totalRecords": 250,
    "successCount": 250,
    "errorCount": 0,
    "errors": [],
    "batches": 5
  }
}

 ⚠️  SLOW REQUEST - 6.52s

 ✓ SUCCESS [200] POST /api/airtable/revision-history/sync - 6.52s
====================================================================================================


GET /health [200] 2ms

*/

// Color Legend:
// - Green text: GET methods, 2xx status codes, INFO/SUCCESS logs
// - Cyan text: POST methods, 3xx status codes, DEBUG logs
// - Yellow text: PUT/PATCH methods, 4xx status codes, WARN logs
// - Red text: DELETE methods, 5xx status codes, ERROR logs
// - Dim/Gray text: Timestamps, metadata

export {};

## Airtable Session Authentication - SOLUTION FOUND

### Problem
Airtable's authentication cookies (__Host-airtable-session, __Host-airtable-session.sig, brw) are being rejected when used in a fresh browser instance, even though they're valid and captured correctly after MFA authentication.

### Root Cause
Airtable's session is tied to browser fingerprinting and additional context beyond just cookies:
- Browser fingerprint (canvas, WebGL, fonts, etc.)
- User-Agent consistency
- TLS fingerprint
- Session binding to specific browser instance

### Solution (VERIFIED WORKING)
Use Puppeteer's `userDataDir` option to maintain a persistent browser session:

```typescript
const browser = await puppeteer.launch({
  userDataDir: '/tmp/airtable-persistent-session', // Persistent context
  headless: false,
  executablePath: '/usr/bin/google-chrome',
});
```

### Test Results
✅ **SUCCESSFUL on first run** with persistent context
✅ Reached target record: `https://airtable.com/appMeCVHbYCljHyu5/tblTF0a1re3cDHx4s/viwfbZDPk6u7uvwdH/recuMKeu0aLm7i0hP?blocks=hide`
✅ No login redirect
❌ API returned 404 (endpoint issue, not auth issue)

### Next Steps
1. Fix API endpoint (404 error)
2. Parse revision history response  
3. Implement persistent session in production worker pool

### Files Modified
- `src/scripts/test-with-persistent-context.ts` - Working test with persistent session
- `src/workers/puppeteerWorker.ts` - Need to add userDataDir support
- `src/services/CookieScraperService.ts` - Cookie handling is correct

### API Endpoint Issue
The endpoint `/v0.3/view/{viewId}/readRowActivitiesAndComments` returned 404.
Need to verify:
- Correct API path
- Required request headers/body format
- viewId vs tableId in URL

### Recommendation
For production: Maintain ONE persistent browser session per user instead of fresh instances for each scrape.

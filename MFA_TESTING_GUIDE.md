# MFA FLOW TESTING GUIDE

## Quick Start

### 1. Build the Project

```bash
cd airtable-be
npm run build
```

### 2. Run the Test Script

```bash
node dist/scripts/test-mfa-flow-complete.js
```

### 3. Follow the Interactive Prompts

The script will guide you through:

1. **Enter Credentials**
   - Airtable email
   - Airtable password
2. **Step 1: Login Initiation**
   - Puppeteer browser opens (visible)
   - Email and password are filled automatically
   - Browser pauses at MFA page
3. **Step 2: Enter MFA Code**
   - Script prompts you to enter MFA code
   - Enter the 6-digit code from your authenticator app
   - Puppeteer submits the code
   - Browser navigates to multiple pages
   - Cookies, localStorage, and tokens are extracted
   - Browser closes automatically
4. **Step 3: Validation**
   - Cookies are validated against Airtable
   - Ensures authentication works
5. **Step 4: Database Verification**
   - Shows what was saved to MongoDB
   - Cookie count
   - localStorage count
   - Access token status
6. **Cleanup**
   - Option to delete test data
   - Or keep it for further testing

---

## What Gets Extracted

### Cookies (Full Objects)

- ✅ name, value
- ✅ domain, path
- ✅ expires
- ✅ httpOnly, secure
- ✅ sameSite

### localStorage

- ✅ All localStorage items from authenticated session
- ✅ Includes session state and preferences

### Access Token

- ✅ Extracted from localStorage (Method 1)
- ✅ Extracted from page context (Method 2)
- ✅ Stored separately as `scrapedAccessToken`

---

## Expected Output

```
╔═══════════════════════════════════════════════════════════╗
║       COMPREHENSIVE MFA FLOW TEST SCRIPT                  ║
║                                                           ║
║  This script tests the complete end-to-end MFA flow      ║
║  with real-time Puppeteer browser interaction            ║
╚═══════════════════════════════════════════════════════════╝

🔧 Setting up test environment...

✓ Connected to MongoDB
Enter Airtable email: user@example.com
Enter Airtable password: ********
✓ Test project created/updated in MongoDB

📋 Test Configuration:
   User ID: test-user-1733234567890
   Email: user@example.com
   Base ID: appMeCVHbYCljHyu5

============================================================
📝 STEP 1: INITIATE LOGIN
============================================================

Starting login initiation...
This will:
  1. Open Puppeteer browser (non-headless)
  2. Navigate to Airtable login
  3. Fill email and password
  4. Pause at MFA page

📊 Initiate Login Result:
{
  "success": true,
  "sessionId": "session-123-456",
  "requiresMFA": true,
  "message": "MFA code required. Please enter the code from your authenticator app."
}

✓ Login initiated successfully
✓ Session ID: session-123-456

🔐 MFA REQUIRED - Browser should be paused at MFA page

============================================================
📝 STEP 2: SUBMIT MFA CODE
============================================================

Please check the Puppeteer browser window.
You should see the MFA code input page.

Enter your MFA code from authenticator app: 123456

⏳ Submitting MFA code...
This will:
  1. Fill MFA code in Puppeteer
  2. Submit the form
  3. Navigate to multiple pages (home, workspace, base)
  4. Extract all cookies from all domains
  5. Extract localStorage data
  6. Attempt to extract access token
  7. Save everything to MongoDB

📊 Submit MFA Result:
{
  "success": true,
  "cookies": [...25 cookies...],
  "localStorage": {...8 items...},
  "message": "Login successful - cookies saved"
}

✓ MFA submitted successfully
✓ Cookies extracted: 25
✓ localStorage items: 8

🎉 Browser window should now be closed

============================================================
📝 STEP 3: VALIDATE COOKIES
============================================================

⏳ Validating extracted cookies...
This will:
  1. Retrieve cookies from MongoDB
  2. Check cookie format and structure
  3. Test cookies against Airtable workspace
  4. Verify authentication works

📊 Validation Result:
{
  "isValid": true,
  "cookies": "...",
  "message": "Cookies are valid"
}

✓ Cookies are valid and working!
✓ Authentication successful

============================================================
📝 STEP 4: VERIFY DATABASE STORAGE
============================================================

✓ Connection found in MongoDB
✓ Has cookies: true
✓ Has localStorage: true
✓ Has scraped access token: true
✓ Cookies valid until: 2026-01-02T12:00:00.000Z
✓ Last updated: 2025-12-03T12:00:00.000Z
✓ Total cookies stored: 25
✓ Cookie names: login-status, mbpg, userSignature, ...
✓ Total localStorage items: 8
✓ localStorage keys: airtable_session, user_preferences, ...
✓ Access token (first 20 chars): patXXXXXXXXXXXXXXXXX...

============================================================
🧹 CLEANUP
============================================================

Do you want to cleanup test data? (yes/no): no
⚠️  Test data preserved in MongoDB
   User ID: test-user-1733234567890
✓ Disconnected from MongoDB

╔═══════════════════════════════════════════════════════════╗
║                   🎉 ALL TESTS PASSED! 🎉                 ║
╚═══════════════════════════════════════════════════════════╝
```

---

## Troubleshooting

### Browser Doesn't Open

- Check if Chrome/Chromium is installed
- Check Puppeteer installation: `npm install puppeteer`

### MFA Page Not Detected

- Check browser console for navigation errors
- Try manual navigation to verify credentials

### Cookie Validation Fails

- Check MongoDB connection
- Verify encryption key is set
- Check cookie expiration

### Access Token Not Found

- Normal - relies on cookie-based auth if not found
- Token extraction is optional enhancement

---

## Manual Testing Alternative

If you prefer to test manually without the script:

1. **Start Backend Server**

   ```bash
   npm run dev
   ```

2. **Use Postman/cURL**

   **Step 1: Initiate Login**

   ```bash
   curl -X POST http://localhost:3000/api/auth/mfa/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "password": "password123",
       "baseId": "appMeCVHbYCljHyu5",
       "userId": "test-user-123"
     }'
   ```

   **Step 2: Submit MFA (after entering code in browser)**

   ```bash
   curl -X POST http://localhost:3000/api/auth/mfa/submit \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "session-xxx-from-step1",
       "mfaCode": "123456"
     }'
   ```

---

## Notes

- ✅ Browser runs in non-headless mode for visibility
- ✅ MongoDB Project model is used for base navigation
- ✅ All cookies include full properties for restoration
- ✅ localStorage is fully captured
- ✅ Access token extraction attempted (optional)
- ✅ Comprehensive error handling
- ✅ Interactive and informative

---

## Next Steps After Testing

Once testing is successful:

1. **Integrate with Frontend**

   - Add MFA modal in settings page
   - Wire up API endpoints
   - Handle session state

2. **Production Considerations**

   - Set headless: true for production
   - Add retry logic
   - Implement session timeout
   - Add rate limiting

3. **Monitoring**
   - Log cookie counts
   - Track validation success rate
   - Monitor token extraction rate
   - Alert on failures

---

Happy Testing! 🚀

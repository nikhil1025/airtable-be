# 🧪 Airtable Revision History Scraping Test

This test script demonstrates how to scrape revision history from Airtable using cookies stored in MongoDB with a real Chrome browser.

## 📋 Prerequisites

### 1. Install Google Chrome (Required)

The script uses a **real Chrome browser** (not Chromium) for debugging and proper cookie handling.

```bash
# Download Google Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

# Install Chrome
sudo dpkg -i google-chrome-stable_current_amd64.deb

# Fix any dependency issues
sudo apt-get install -f

# Verify installation
google-chrome --version
```

### 2. Verify Chrome Path

The script expects Chrome at `/usr/bin/google-chrome`. Verify:

```bash
which google-chrome
# Should output: /usr/bin/google-chrome
```

If Chrome is installed elsewhere, update the `executablePath` in the script.

### 3. Install Puppeteer Dependencies

```bash
# Install required system libraries
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils
```

## 🚀 Setup Steps

### Step 1: Ensure MongoDB is Running

```bash
# Check MongoDB status
sudo systemctl status mongod

# If not running, start it
sudo systemctl start mongod
```

### Step 2: Ensure You Have Valid Cookies

The test user `user_1764525443009` must have valid cookies in the database.

**Check if cookies exist:**

```bash
# Connect to MongoDB
mongosh

# Switch to your database
use airtable_integration

# Check for cookies
db.airtableconnections.findOne({ userId: "user_1764525443009" })
```

**If no cookies found, authenticate first:**

```bash
# Option 1: Use the auto-retrieve endpoint
curl -X POST http://localhost:3000/api/airtable/cookies/auto-retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1764525443009",
    "email": "your-airtable-email@example.com",
    "password": "your-password"
  }'

# Option 2: Manual OAuth flow
# Visit: http://localhost:3000/api/airtable/oauth/authorize?userId=user_1764525443009
```

### Step 3: Ensure You Have Tickets Data

The script needs at least one ticket in the database for the test user.

**Check if tickets exist:**

```bash
# In mongosh
db.tickets.findOne({ userId: "user_1764525443009" })
```

**If no tickets found, sync data:**

```bash
curl -X POST http://localhost:3000/api/airtable/data/sync-fresh?userId=user_1764525443009 \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "your-access-token",
    "refreshToken": "your-refresh-token"
  }'
```

## ▶️ Running the Test

### Method 1: Using npm script (Recommended)

```bash
cd /home/lucifer/Desktop/SREDWorkspace/airtable-test-app/airtable-be
npm run test:revision-scraping
```

### Method 2: Direct execution

```bash
cd /home/lucifer/Desktop/SREDWorkspace/airtable-test-app/airtable-be
npx ts-node src/scripts/test-revision-scraping.ts
```

## 📊 What the Test Does

The script performs the following steps:

### Step 1: Fetch Cookies from MongoDB ✅

- Connects to MongoDB
- Retrieves cookies for `user_1764525443009`
- Validates cookie expiration

### Step 2: Validate Cookies ✅

- Checks for required cookies:
  - `__Host-airtable-session`
  - `__Host-airtable-session.sig`
  - `brw`
- Ensures all authentication cookies are present

### Step 3: Launch Chrome Browser ✅

- Opens a real Chrome browser (visible window)
- Auto-opens DevTools for debugging
- Sets proper headers matching the Airtable request
- Injects cookies into browser

### Step 4: Get Ticket Data ✅

- Fetches a ticket from MongoDB
- Extracts:
  - `airtableRecordId`
  - `rowId`
  - `baseId`
  - `tableId`

### Step 5: Scrape Revision History ✅

- Navigates to Airtable page (sets referer)
- Makes API request to:
  ```
  https://airtable.com/v0.3/row/{recordId}/readRowActivitiesAndComments
  ```
- Uses proper query parameters:
  - `stringifiedObjectParams`
  - `requestId`
  - `secretSocketId`
- Parses response and extracts revision history

## 🔍 Expected Output

```
======================================================================
🚀 AIRTABLE REVISION HISTORY SCRAPING TEST
======================================================================
📋 Test User ID: user_1764525443009
⏰ Started at: 2025-12-01T...

======================================================================
📦 STEP 1: FETCHING COOKIES FROM MONGODB
======================================================================
✅ Connected to MongoDB
✅ Connection found in database
   User ID: user_1764525443009
   Has Cookies: YES
   Valid Until: 2025-12-02T...
✅ Cookies retrieved (2847 chars)

======================================================================
🔍 STEP 2: VALIDATING COOKIES
======================================================================
📊 Total cookies found: 35
   ✅ __Host-airtable-session: Present
   ✅ __Host-airtable-session.sig: Present
   ✅ brw: Present

✅ All required cookies are present

======================================================================
🌐 STEP 3: LAUNCHING CHROME BROWSER
======================================================================
🔧 Browser Configuration:
   - OS: Ubuntu
   - Browser: Real Chrome (not Chromium)
   - Headless: No (for debugging)
   - DevTools: Auto-open for inspection
✅ Browser launched successfully
✅ New page created
✅ Headers configured
✅ 35 cookies set in browser

======================================================================
🎫 STEP 4: FETCHING TICKET DATA FROM MONGODB
======================================================================
✅ Ticket found:
   Record ID: recueOznCWwppKtIi
   Row ID: row_1764216544000_1_0
   Base ID: appMeCVHbYCljHyu5
   Table ID: tblTF0a1re3cDHx4s

======================================================================
🔄 STEP 5: SCRAPING REVISION HISTORY
======================================================================
🌐 API Request Details:
   Record ID: recueOznCWwppKtIi
   Request ID: reqXYZ123...
   Socket ID: socABC456...
⏳ Making request to Airtable API...
✅ Navigated to Airtable page (for referer)

📡 Response Status: 200
✅ API request successful!

🔍 Parsing X activities...
✅ Parsed Y revision items

📊 RESULTS:
   Total revisions found: Y

📝 Sample revision (first item):
{
  "uuid": "act_...",
  "recordId": "recueOznCWwppKtIi",
  "columnType": "Status",
  "oldValue": "To Do",
  "newValue": "In Progress",
  "createdDate": "2025-11-28T...",
  "userEmail": "user@example.com",
  "userName": "John Doe"
}

======================================================================
🎉 TEST COMPLETED
======================================================================
✅ Total revisions scraped: Y
⏰ Completed at: 2025-12-01T...

⏸️  Browser kept open for inspection.
   Press Ctrl+C to close and exit.
```

## 🐛 Debugging

### Browser Window

- The script keeps Chrome open for inspection
- DevTools auto-opens for network debugging
- You can manually inspect cookies, network requests, etc.

### Check Network Requests

1. In DevTools, go to **Network** tab
2. Look for request to `readRowActivitiesAndComments`
3. Inspect headers, cookies, response

### Common Issues

#### ❌ Chrome not found

```
Error: Failed to launch the browser process!
/usr/bin/google-chrome: No such file or directory
```

**Solution:** Install Google Chrome (see Prerequisites)

#### ❌ No cookies found

```
❌ No cookies found in database
```

**Solution:** Authenticate first using the cookie extraction endpoint

#### ❌ 401 Unauthorized

```
📡 Response Status: 401
⚠️  AUTHENTICATION FAILED!
```

**Solution:** Cookies expired. Re-authenticate to get fresh cookies.

#### ❌ No tickets found

```
❌ No tickets found for userId: user_1764525443009
```

**Solution:** Sync data first using `/api/airtable/data/sync-fresh`

## 🔧 Customization

### Change Test User ID

Edit the script at line ~565:

```typescript
const TEST_USER_ID = "user_1764525443009"; // Change this
```

### Change Chrome Path

If Chrome is installed elsewhere, edit line ~189:

```typescript
executablePath: "/usr/bin/google-chrome", // Update path
```

### Run Headless

To run without browser window, edit line ~187:

```typescript
headless: true, // Change to true
devtools: false, // Disable DevTools
```

### Increase Revision Limit

Edit line ~319 to fetch more revisions:

```typescript
limit: 100, // Increase this number
```

## 📝 Notes

- **Browser stays open** after test completes for manual inspection
- Press **Ctrl+C** to close browser and exit
- All cookies are validated before making requests
- The script uses the exact same headers as the real Airtable website
- Random `requestId` and `secretSocketId` are generated for each request

## 🆘 Need Help?

If you encounter issues:

1. Check MongoDB connection
2. Verify cookies exist and are valid
3. Ensure Chrome is properly installed
4. Check the browser DevTools for network errors
5. Review the console output for specific error messages

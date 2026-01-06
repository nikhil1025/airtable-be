# Airtable Backend Integration

> Backend service for Airtable integration with OAuth authentication, data synchronization, and revision history scraping

## Description

Airtable Backend Integration is a robust Node.js/Express service that provides seamless integration with Airtable's API. It features OAuth 2.0 authentication, automated data synchronization, revision history tracking through web scraping with Puppeteer, and comprehensive API endpoints for managing Airtable data programmatically.

**Who it's for:**
- Teams building Airtable integrations and automation workflows
- Developers needing programmatic access to Airtable with OAuth
- Applications requiring historical data tracking and audit trails
- Projects needing bulk data operations and synchronization

**Key Benefits:**
- Secure OAuth 2.0 authentication flow with Airtable
- Real-time data synchronization with Airtable bases
- Revision history scraping and tracking capabilities
- Rate limiting and security best practices built-in
- MongoDB for persistent storage and caching
- Docker-ready with embedded MongoDB

## Tech Stack

**Backend:**
- **Runtime:** Node.js 22.x
- **Framework:** Express.js 4.18
- **Language:** TypeScript 5.3
- **Database:** MongoDB 8.0 (Mongoose ODM)
- **Web Scraping:** Puppeteer 24.31 with Chromium
- **HTTP Client:** Axios 1.6

**Security & Middleware:**
- **Security Headers:** Helmet 7.1
- **CORS:** CORS 2.8
- **Rate Limiting:** Express Rate Limit 7. 1
- **Authentication:** OAuth 2.0

**DevOps / Tools:**
- Docker & Docker Compose
- Nodemon (Development)
- TypeScript Compiler
- ts-node (Script execution)

## Features

- 🔐 **OAuth 2.0 Authentication:** Secure Airtable OAuth flow with token management
- 🔄 **Data Synchronization:** Automated sync between Airtable and local MongoDB
- 📜 **Revision History Tracking:** Web scraping-based revision history capture using Puppeteer
- 🚀 **Bulk Operations:** Parallel processing for large-scale data operations
- 🛡️ **Security Hardened:** Helmet security headers, CORS, and rate limiting
- 📊 **Data Management:** Full CRUD operations for Airtable bases and records
- 🔍 **Pagination Support:** Efficient handling of large datasets
- 👥 **Multi-User Support:** User management and authentication
- 🍪 **Session Management:** Cookie-based session handling
- 🐳 **Containerized:** Docker with embedded MongoDB for easy deployment
- ⚡ **Performance Optimized:** Worker-based parallel processing for scraping tasks
- 🧪 **Testing Scripts:** Pre-built scripts for testing various functionalities

## Project Structure

```
airtable-be/
├── src/
│   ├── config/           # Configuration files and environment setup
│   ├── controllers/      # Request handlers and business logic
│   ├── middleware/       # Express middleware (auth, validation, etc.)
│   ├── models/          # Mongoose schemas and models
│   ├── routes/          # API route definitions
│   │   ├── auth.ts              # Authentication routes
│   │   ├── oauth.ts             # OAuth flow endpoints
│   │   ├── mfaAuth.ts           # Multi-factor authentication
│   │   ├── data.ts              # Data CRUD operations
│   │   ├── sync.ts              # Data synchronization
│   │   ├── revisionHistory.ts   # Revision tracking
│   │   ├── bulkRevision.ts      # Bulk revision operations
│   │   ├── users.ts             # User management
│   │   ├── cookies.ts           # Cookie management
│   │   ├── pagination.ts        # Pagination utilities
│   │   └── demo.ts              # Demo/testing endpoints
│   ├── services/        # Business logic and external API integrations
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions and helpers
│   ├── workers/         # Background workers for parallel processing
│   └── server.ts        # Application entry point
├── scripts/             # Utility and testing scripts
├── Dockerfile           # Docker configuration with MongoDB
├── docker-compose.yml   # Docker Compose orchestration
├── nodemon.json         # Nodemon configuration
├── tsconfig.json        # TypeScript compiler configuration
└── package.json         # NPM dependencies and scripts
```

## Installation

### Prerequisites

- **Node.js** 22.x or higher
- **npm** (comes with Node.js)
- **MongoDB** 7.0+ (or use Docker - recommended)
- **Docker** (optional but recommended)
- **Airtable Account** with OAuth application credentials

### Step-by-Step Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nikhil1025/airtable-be. git
   cd airtable-be
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory (see Environment Variables section below)

4. **Set up Airtable OAuth:**
   - Go to [Airtable Developer Hub](https://airtable.com/create/oauth)
   - Create a new OAuth integration
   - Copy your Client ID and Client Secret
   - Set redirect URI to `http://localhost:3000/oauth/callback` (or your production URL)

5. **Verify installation:**
   ```bash
   npm run build
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/airtable-integration
# Or for Docker:  mongodb://127.0.0.1:27017/airtable-integration

# Airtable OAuth Configuration
AIRTABLE_CLIENT_ID=your_airtable_client_id
AIRTABLE_CLIENT_SECRET=your_airtable_client_secret
AIRTABLE_REDIRECT_URI=http://localhost:3000/oauth/callback

# Session Configuration
SESSION_SECRET=your_secure_random_session_secret

# Puppeteer Configuration (for Docker)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Security
CORS_ORIGIN=http://localhost:4200
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional: Logging
LOG_LEVEL=info
```

### Required Variables: 
- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `AIRTABLE_CLIENT_ID` - OAuth client ID from Airtable
- `AIRTABLE_CLIENT_SECRET` - OAuth client secret from Airtable
- `AIRTABLE_REDIRECT_URI` - OAuth callback URL
- `SESSION_SECRET` - Secret for session encryption
- `CORS_ORIGIN` - Allowed origin for CORS (frontend URL)

## Running the Project

### Development Mode

**Using npm (with hot reload):**
```bash
npm run dev
```
Server will start at `http://localhost:3000` with auto-restart on file changes. 

**Using Docker Compose (recommended):**
```bash
docker-compose up --build
```

### Production Build

**Build TypeScript:**
```bash
npm run build
```

**Start production server:**
```bash
npm start
```

### Utility Scripts

**Clear OAuth tokens:**
```bash
npm run clear-oauth-tokens
```

**Setup test data:**
```bash
npm run setup-test-data
```

**Test revision scraping:**
```bash
npm run test: revision-scraping
```

**Test revision API fetch:**
```bash
npm run test:fetch-revision-api
```

**Test worker performance:**
```bash
npm run test:worker-performance
```

**Bulk revision scraping (sequential):**
```bash
npm run bulk: revision-scraping
```

**Bulk revision scraping (parallel):**
```bash
npm run bulk:revision-scraping: parallel
```

### Docker Deployment

**Using Docker Compose (includes MongoDB):**
```bash
docker-compose up -d
```

**Using Docker directly:**
```bash
# Build the image
docker build -t airtable-backend: latest .

# Run with volume for MongoDB data
docker run -d \
  -p 3000:3000 \
  -v mongodb-data:/data/db \
  --env-file .env \
  airtable-backend:latest
```

Access the API at `http://localhost:3000`

## API Documentation

**Base URL:** `http://localhost:3000` (development)

### Authentication

#### OAuth Flow
- **GET** `/oauth/authorize` - Initiate OAuth flow
- **GET** `/oauth/callback` - OAuth callback handler
- **POST** `/oauth/token` - Exchange code for access token

#### Standard Auth
- **POST** `/auth/login` - User login
- **POST** `/auth/logout` - User logout
- **GET** `/auth/status` - Check authentication status

#### MFA
- **POST** `/mfa/enable` - Enable multi-factor authentication
- **POST** `/mfa/verify` - Verify MFA code

### Data Operations

#### Airtable Data
- **GET** `/data/bases` - List all bases
- **GET** `/data/bases/:baseId/tables` - List tables in a base
- **GET** `/data/tables/:tableId/records` - Get records from a table
- **POST** `/data/records` - Create new records
- **PATCH** `/data/records/:recordId` - Update record
- **DELETE** `/data/records/:recordId` - Delete record

#### Synchronization
- **POST** `/sync/start` - Start data synchronization
- **GET** `/sync/status/:syncId` - Get sync status
- **POST** `/sync/stop/: syncId` - Stop synchronization

#### Revision History
- **GET** `/revisions/: recordId` - Get revision history for a record
- **POST** `/revisions/scrape` - Trigger revision scraping
- **POST** `/bulk-revisions/scrape` - Bulk revision scraping

### User Management
- **GET** `/users` - List users
- **GET** `/users/:userId` - Get user details
- **PUT** `/users/:userId` - Update user
- **DELETE** `/users/:userId` - Delete user

### Utilities
- **GET** `/pagination/: tableId` - Paginated records
- **GET** `/cookies` - Get cookies
- **POST** `/cookies` - Set cookies

### Demo/Testing
- **GET** `/demo/test` - Test endpoints
- **GET** `/health` - Health check

### Response Format

**Success Response:**
```json
{
  "success": true,
  "data": { ...  },
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Deployment

### Hosting Suggestions

**Recommended Platforms:**
- **AWS ECS/Fargate** - Container orchestration with RDS/DocumentDB for MongoDB
- **Google Cloud Run** - Serverless containers with MongoDB Atlas
- **DigitalOcean App Platform** - Easy container deployment
- **Railway** - Simple deployment with built-in MongoDB
- **Heroku** - Container registry with MongoDB add-on
- **Self-hosted VPS** - Ubuntu server with Docker Compose

### Deployment Steps

**For Cloud Platforms (AWS, GCP, Azure):**

1. **Build and push Docker image:**
   ```bash
   docker build -t your-registry/airtable-backend:latest .
   docker push your-registry/airtable-backend:latest
   ```

2. **Set environment variables in your cloud console**

3. **Deploy container with MongoDB connection:**
   - Use managed MongoDB (MongoDB Atlas, AWS DocumentDB, etc.)
   - Or deploy MongoDB as a separate container/service

**For DigitalOcean/Railway/Heroku:**

1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Deploy automatically from main branch

**For Self-hosted (VPS):**

1. **Install Docker and Docker Compose on your server**

2. **Clone repository and configure:**
   ```bash
   git clone https://github.com/nikhil1025/airtable-be.git
   cd airtable-be
   cp . env.example .env
   # Edit .env with production values
   ```

3. **Deploy with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **Set up reverse proxy (Nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

5. **Enable SSL with Let's Encrypt:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

### Production Considerations

- Use a managed MongoDB service (MongoDB Atlas recommended)
- Enable MongoDB authentication and SSL
- Set `NODE_ENV=production`
- Use strong `SESSION_SECRET`
- Configure rate limiting appropriately
- Set up monitoring and logging (PM2, CloudWatch, etc.)
- Enable HTTPS/SSL
- Regular backup of MongoDB data
- Configure CORS_ORIGIN to your frontend domain

## Screenshots / Demo

<!-- Add screenshots or API documentation here -->
*Coming soon*

<!-- Example: 
![OAuth Flow](docs/images/oauth-flow.png)
![API Response](docs/images/api-response.png)
-->

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Commit your changes:**
   ```bash
   git commit -m "Add:  description of your changes"
   ```

4. **Push to your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**

### Coding Standards

- Follow Node.js best practices and Express. js conventions
- Use TypeScript with strict mode enabled
- Write meaningful commit messages (conventional commits preferred)
- Document all API endpoints and functions
- Test thoroughly before submitting PR
- Ensure code passes TypeScript compilation:  `npm run build`
- Follow existing code structure and patterns
- Add JSDoc comments for complex functions

## License

This project is private and does not currently have a specified license.  Please contact the repository owner for usage permissions.

---

**Author:** [nikhil1025](https://github.com/nikhil1025)

**Repository:** [github.com/nikhil1025/airtable-be](https://github.com/nikhil1025/airtable-be)

**Related Projects:** 
- Frontend: [nikhil1025/airtable-fe](https://github.com/nikhil1025/airtable-fe)

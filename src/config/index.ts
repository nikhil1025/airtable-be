import dotenv from "dotenv";

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  mongodb: {
    uri: string;
  };
  airtable: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    baseUrl: string;
    webUrl: string;
  };
  encryption: {
    key: string;
  };
}

const config: Config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  mongodb: {
    uri:
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/airtable-integration",
  },
  airtable: {
    clientId: process.env.AIRTABLE_CLIENT_ID || "",
    clientSecret: process.env.AIRTABLE_CLIENT_SECRET || "",
    redirectUri:
      process.env.AIRTABLE_REDIRECT_URI ||
      "http://localhost:3000/api/airtable/oauth/callback",
    baseUrl: process.env.AIRTABLE_BASE_URL || "https://api.airtable.com/v0",
    webUrl: process.env.AIRTABLE_WEB_URL || "https://airtable.com",
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || "",
  },
};

// Validate required environment variables
const validateConfig = () => {
  const required = [
    "MONGODB_URI",
    "AIRTABLE_CLIENT_ID",
    "AIRTABLE_CLIENT_SECRET",
    "ENCRYPTION_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missing.join(", ")}`
    );
  }

  if (config.encryption.key.length < 32) {
    console.warn(
      "Warning: ENCRYPTION_KEY should be at least 32 characters long"
    );
  }
};

validateConfig();

export default config;

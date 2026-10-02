import { defineConfig } from "drizzle-kit";

const DIRECT_DATABASE_URL = "mysql://426Z9KBUqRumUkQ.root:GdEOEZstbT2tQmJy@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/test";

const connectionString = DIRECT_DATABASE_URL || process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("CUSTOM_DATABASE_URL or DATABASE_URL is required to run drizzle commands");
}

// Parse connection URL for TiDB SSL support
const url = new URL(connectionString);
const sslEnabled = url.hostname.includes("tidbcloud.com");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
    ...(sslEnabled ? {
      connection: {
        ssl: { rejectUnauthorized: true },
      },
    } : {}),
  },
});

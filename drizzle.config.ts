import { defineConfig } from "drizzle-kit";

const connectionString = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;

let credentials: any = { url: connectionString || "" };

if (connectionString) {
  try {
    const parsed = new URL(connectionString);
    const isSsl = /tidbcloud\.com|aivencloud\.com/i.test(parsed.hostname);
    if (isSsl) {
      credentials = {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 4000,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, "").split("?")[0],
        ssl: { rejectUnauthorized: true },
      };
    } else {
      credentials = { url: connectionString };
    }
  } catch {
    credentials = { url: connectionString };
  }
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: credentials,
});


#!/usr/bin/env node
/**
 * Apply the client-telemetry schema without touching anything else.
 *
 * Why not `drizzle-kit migrate`?
 *
 * The production database was built with `drizzle-kit push`, so its migration
 * ledger and the real schema are out of step: `drizzle/0003_*.sql` would try to
 * CREATE the discord and notification tables again and abort before reaching
 * the tables we need. `drizzle-kit push` diffs the live database instead, but it
 * can ask questions no CI job can answer.
 *
 * So this script does the three additive changes by hand, and skips whatever is
 * already there. Running it twice is safe. Running it on an old database is
 * safe. It never drops or alters an existing column.
 *
 *   node scripts/ensure-client-telemetry.mjs
 *
 * Connection details come from DATABASE_URL, exactly like server/db.ts.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL || process.env.CUSTOM_DATABASE_URL;
if (!url) {
  console.error("[telemetry] DATABASE_URL is not set; nothing to do");
  process.exit(1);
}

const parsed = new URL(url);
const config = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 3306,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, "").split("?")[0],
  connectTimeout: 15000,
  multipleStatements: false,
};
if (/tidbcloud\.com|aivencloud\.com/i.test(parsed.hostname)) config.ssl = { rejectUnauthorized: true };

const SESSIONS = `CREATE TABLE IF NOT EXISTS \`client_sessions\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`userId\` int NOT NULL,
  \`device\` varchar(64) NOT NULL,
  \`client\` varchar(8) NOT NULL,
  \`version\` varchar(32),
  \`os\` varchar(16),
  \`arch\` varchar(16),
  \`editorVersion\` varchar(32),
  \`mode\` varchar(8),
  \`modelId\` varchar(128),
  \`provider\` varchar(64),
  \`workspaces\` int,
  \`firstSeen\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`lastSeen\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`client_sessions_user_device_idx\` (\`userId\`,\`device\`),
  KEY \`client_sessions_client_last_seen_idx\` (\`client\`,\`lastSeen\`),
  CONSTRAINT \`client_sessions_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
)`;

const BYOK = `CREATE TABLE IF NOT EXISTS \`client_byok_configs\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`userId\` int NOT NULL,
  \`device\` varchar(64) NOT NULL,
  \`client\` varchar(8) NOT NULL,
  \`providerId\` varchar(64) NOT NULL,
  \`baseUrl\` varchar(512),
  \`modelId\` varchar(128),
  \`keyMasked\` varchar(32),
  \`keyFingerprint\` varchar(64),
  \`source\` varchar(16),
  \`enabled\` boolean NOT NULL DEFAULT true,
  \`firstSeen\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`lastSeen\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`client_byok_user_device_provider_idx\` (\`userId\`,\`device\`,\`providerId\`),
  KEY \`client_byok_client_idx\` (\`client\`),
  CONSTRAINT \`client_byok_configs_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
)`;

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const conn = await mysql.createConnection(config);
const done = [];
try {
  if (!(await columnExists(conn, "usage_events", "client"))) {
    await conn.query("ALTER TABLE `usage_events` ADD `client` varchar(16)");
    done.push("usage_events.client added");
  } else {
    done.push("usage_events.client already there");
  }

  if (!(await tableExists(conn, "client_sessions"))) {
    await conn.query(SESSIONS);
    done.push("client_sessions created");
  } else {
    done.push("client_sessions already there");
  }

  if (!(await tableExists(conn, "client_byok_configs"))) {
    await conn.query(BYOK);
    done.push("client_byok_configs created");
  } else {
    done.push("client_byok_configs already there");
  }

  const [rows] = await conn.query("SELECT COUNT(*) AS n FROM `client_sessions`");
  done.push(`client_sessions rows: ${Number(rows[0]?.n ?? 0)}`);
} finally {
  await conn.end();
}

for (const line of done) console.log(`[telemetry] ${line}`);
console.log("[telemetry] schema ready");

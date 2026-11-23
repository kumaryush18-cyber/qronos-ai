#!/usr/bin/env node
/**
 * Apply the free-pi token-pool table without touching anything else.
 *
 * Why not `drizzle-kit migrate`?
 *
 * The production database was built with `drizzle-kit push`, so its migration
 * ledger and the real schema are out of step. A generated migration would try
 * to CREATE tables that already exist and abort before reaching ours. This
 * script makes the one additive change by hand and skips it when present.
 * Running it twice is safe, and it never drops or alters an existing column.
 *
 *   node scripts/ensure-freepi-slots.mjs
 *
 * Connection details come from DATABASE_URL, exactly like server/db.ts.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL || process.env.CUSTOM_DATABASE_URL;
if (!url) {
  console.error("[freepi] DATABASE_URL is not set; nothing to do");
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

/**
 * Eight encrypted slots hold the free-pi tokens behind the four free models.
 *
 * The ciphertext columns are the whole point: a token is never stored in clear
 * text, and `keyFingerprint` is a one-way digest used only to show "•••LBnE" in
 * the admin panel.
 */
const SLOTS = `CREATE TABLE IF NOT EXISTS \`freepi_credential_slots\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`slot\` int NOT NULL,
  \`label\` varchar(64) DEFAULT NULL,
  \`ciphertext\` text NOT NULL,
  \`iv\` varchar(32) NOT NULL,
  \`authTag\` varchar(32) NOT NULL,
  \`keyFingerprint\` varchar(16) NOT NULL,
  \`lastValidatedAt\` timestamp NOT NULL,
  \`updatedByUserId\` int DEFAULT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`freepi_credential_slots_slot_unique_idx\` (\`slot\`),
  CONSTRAINT \`freepi_credential_slots_updatedByUserId_users_id_fk\` FOREIGN KEY (\`updatedByUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
)`;

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
  if (!(await tableExists(conn, "freepi_credential_slots"))) {
    await conn.query(SLOTS);
    done.push("freepi_credential_slots created");
  } else {
    done.push("freepi_credential_slots already there");
  }
  const [rows] = await conn.query("SELECT COUNT(*) AS n FROM `freepi_credential_slots`");
  done.push(`freepi_credential_slots rows: ${Number(rows[0]?.n ?? 0)}`);
} finally {
  await conn.end();
}

for (const line of done) console.log(`[freepi] ${line}`);
console.log("[freepi] schema ready");

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const betaSignups = sqliteTable("beta_signups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  segment: text("segment").notNull(),
  locale: text("locale").notNull(),
  sourcePath: text("source_path").notNull(),
  consentVersion: text("consent_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("beta_signups_email_unique").on(table.email),
]);

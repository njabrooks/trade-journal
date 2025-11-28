import { asc } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

export async function getPrimaryAccount() {
  const rows = await db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAccounts() {
  return db.select().from(accounts).orderBy(asc(accounts.createdAt));
}


import "server-only";
import * as schema from "./schema";
import { createDb, type DB } from "./client";

// Singleton (evita várias conexões no hot-reload do Next em dev)
const g = globalThis as unknown as { __db?: DB };
export const db: DB = g.__db ?? (g.__db = createDb());

export { schema };

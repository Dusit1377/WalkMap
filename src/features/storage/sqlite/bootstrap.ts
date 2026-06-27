import { initializeLocalDatabase } from "@/features/storage/sqlite/database";
import { migrateAsyncStoragePayloadsToSQLite } from "@/features/storage/sqlite/migrations";
import { recordStorageError } from "@/features/storage/walkmapStorage";

export async function initializeSQLiteStorage() {
  const result = await initializeLocalDatabase();

  if (!result.ok) {
    recordStorageError({
      key: "walkmap_storage_version",
      operation: "sqlite-init",
      table: "schema_migrations",
      error: result.error,
    });
    return result;
  }

  try {
    await migrateAsyncStoragePayloadsToSQLite();
  } catch {
    // SQLite is best-effort here; AsyncStorage remains the source of truth.
  }

  return result;
}

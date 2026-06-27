import { openLocalDatabase } from "@/features/storage/sqlite/database";
import { backfillActiveWalkToSQLiteFromAsyncStorage } from "@/features/storage/sqlite/activeWalkRepository";
import { backfillCoverageRoutesToSQLiteFromAsyncStorage } from "@/features/storage/sqlite/coverageRepository";
import { backfillHistoryToSQLiteFromAsyncStorage } from "@/features/storage/sqlite/historyRepository";
import { recordStorageError } from "@/features/storage/walkmapStorage";

const MIGRATION_MARKER_KEY = "async_storage_to_sqlite_migration";
const MIGRATION_COMPLETE_VALUE = "complete";

async function readMigrationMarker() {
  const database = await openLocalDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key = ?;",
    MIGRATION_MARKER_KEY,
  );

  return row?.value ?? null;
}

export async function isAsyncStorageToSQLiteMigrationComplete() {
  try {
    return (await readMigrationMarker()) === MIGRATION_COMPLETE_VALUE;
  } catch {
    return false;
  }
}

async function writeMigrationMarker(value: string) {
  const database = await openLocalDatabase();
  await database.runAsync(
    "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?);",
    MIGRATION_MARKER_KEY,
    value,
    Date.now(),
  );
}

export async function migrateAsyncStoragePayloadsToSQLite() {
  try {
    if ((await readMigrationMarker()) === MIGRATION_COMPLETE_VALUE) {
      return;
    }

    await backfillHistoryToSQLiteFromAsyncStorage();
    await backfillActiveWalkToSQLiteFromAsyncStorage();
    await backfillCoverageRoutesToSQLiteFromAsyncStorage();
    await writeMigrationMarker(MIGRATION_COMPLETE_VALUE);
  } catch (error) {
    recordStorageError({
      key: "walkmap_storage_version",
      operation: "sqlite-async-storage-migration",
      table: "app_metadata",
      itemId: MIGRATION_MARKER_KEY,
      error,
    });
  }
}

import {
  openDatabaseAsync,
  type SQLiteDatabase,
} from "expo-sqlite";
import {
  CURRENT_SQLITE_SCHEMA_VERSION,
  LOCAL_DATABASE_NAME,
  SQLITE_MIGRATIONS,
} from "@/features/storage/sqlite/schema";

export type LocalDatabaseInitializationResult =
  | {
      ok: true;
      schemaVersion: number;
    }
  | {
      ok: false;
      error: unknown;
    };

let localDatabasePromise: Promise<SQLiteDatabase> | null = null;

export function openLocalDatabase() {
  if (!localDatabasePromise) {
    localDatabasePromise = openDatabaseAsync(LOCAL_DATABASE_NAME).catch((error) => {
      localDatabasePromise = null;
      throw error;
    });
  }

  return localDatabasePromise;
}

async function ensureSchemaMigrationsTable(database: SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

async function getAppliedMigrationVersions(database: SQLiteDatabase) {
  const rows = await database.getAllAsync<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version ASC;",
  );

  return new Set(rows.map((row) => row.version));
}

export async function applyMigrations(database: SQLiteDatabase) {
  await ensureSchemaMigrationsTable(database);

  const appliedVersions = await getAppliedMigrationVersions(database);
  const pendingMigrations = SQLITE_MIGRATIONS.filter(
    (migration) => !appliedVersions.has(migration.version),
  ).sort((left, right) => left.version - right.version);

  for (const migration of pendingMigrations) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(migration.sql);
      await database.runAsync(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);",
        migration.version,
        migration.name,
        Date.now(),
      );
    });
  }

  await database.runAsync(
    "INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?);",
    "sqlite_schema_version",
    String(CURRENT_SQLITE_SCHEMA_VERSION),
    Date.now(),
  );
}

export async function initializeLocalDatabase(): Promise<LocalDatabaseInitializationResult> {
  try {
    const database = await openLocalDatabase();
    await applyMigrations(database);

    return {
      ok: true,
      schemaVersion: CURRENT_SQLITE_SCHEMA_VERSION,
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

export { CURRENT_SQLITE_SCHEMA_VERSION, LOCAL_DATABASE_NAME };

export const LOCAL_DATABASE_NAME = "walkmap.db";
export const CURRENT_SQLITE_SCHEMA_VERSION = 1;

export type SqliteMigration = {
  version: number;
  name: string;
  sql: string;
};

export const SQLITE_MIGRATIONS: SqliteMigration[] = [
  {
    version: 1,
    name: "create_initial_storage_tables",
    sql: `
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS walks (
        id TEXT PRIMARY KEY NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        distance_km REAL NOT NULL DEFAULT 0,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS walk_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        walk_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        FOREIGN KEY (walk_id) REFERENCES walks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS coverage_routes (
        id TEXT PRIMARY KEY NOT NULL,
        walk_id TEXT,
        created_at INTEGER NOT NULL,
        points_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_walk_points_walk_sequence
        ON walk_points (walk_id, sequence);

      CREATE INDEX IF NOT EXISTS idx_walk_points_timestamp
        ON walk_points (timestamp);

      CREATE INDEX IF NOT EXISTS idx_coverage_routes_created_at
        ON coverage_routes (created_at);
    `,
  },
];

export const LOCAL_DATABASE_NAME = "walkmap.db";
export const CURRENT_SQLITE_SCHEMA_VERSION = 3;

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
  {
    version: 2,
    name: "add_walk_history_columns",
    sql: `
      ALTER TABLE walks ADD COLUMN date_text TEXT NOT NULL DEFAULT '';
      ALTER TABLE walks ADD COLUMN day_key TEXT;
      ALTER TABLE walks ADD COLUMN new_cells INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE walks ADD COLUMN total_cells INTEGER;
      ALTER TABLE walks ADD COLUMN achievements_unlocked_json TEXT NOT NULL DEFAULT '[]';

      CREATE INDEX IF NOT EXISTS idx_walks_day_key
        ON walks (day_key);
    `,
  },
  {
    version: 3,
    name: "add_json_payload_storage",
    sql: `
      CREATE TABLE IF NOT EXISTS active_walk_payload (
        id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS coverage_route_payloads (
        id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO app_metadata (key, value, updated_at)
      VALUES ('async_storage_to_sqlite_migration', 'pending', 0);
    `,
  },
];

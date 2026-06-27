import type { WalkHistoryItem } from "@/features/walkmap/domain";
import { readHistoryFromStorage } from "@/features/storage/walkmapStorage";
import { recordStorageError } from "@/features/storage/walkmapStorage";
import { openLocalDatabase } from "@/features/storage/sqlite/database";

type SQLiteHistoryRow = {
  id: string;
  started_at: number;
  finished_at: number | null;
  date_text: string;
  day_key: string | null;
  distance_km: number;
  duration_sec: number;
  new_cells: number;
  total_cells: number | null;
  achievements_unlocked_json: string;
  created_at: number;
  updated_at: number;
};

function sqliteRowToHistoryItem(row: SQLiteHistoryRow): WalkHistoryItem {
  let achievementsUnlocked: string[] = [];

  try {
    const parsed = JSON.parse(row.achievements_unlocked_json);
    if (Array.isArray(parsed)) {
      achievementsUnlocked = parsed.filter(
        (achievementId): achievementId is string =>
          typeof achievementId === "string",
      );
    }
  } catch (error) {
    recordStorageError({
      key: "walkmap_history",
      operation: "sqlite-read-parse",
      table: "walks",
      itemId: row.id,
      error,
    });
  }

  return {
    id: row.id,
    date: row.date_text,
    dayKey: row.day_key ?? undefined,
    distanceKm: row.distance_km,
    durationSec: row.duration_sec,
    newCells: row.new_cells,
    totalCells: row.total_cells ?? undefined,
    achievementsUnlocked,
  };
}

function isHistoryItemLike(item: unknown): item is WalkHistoryItem {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as WalkHistoryItem).id === "string" &&
    typeof (item as WalkHistoryItem).date === "string"
  );
}

function historyItemToSQLiteRow(historyItem: WalkHistoryItem): SQLiteHistoryRow {
  const finishedAt = Number(historyItem.id) || Date.now();
  const durationSec = Math.max(0, Math.floor(Number(historyItem.durationSec) || 0));
  const startedAt = Math.max(0, finishedAt - durationSec * 1000);

  return {
    id: historyItem.id,
    started_at: startedAt,
    finished_at: finishedAt,
    date_text: historyItem.date,
    day_key: historyItem.dayKey ?? null,
    distance_km: Number(historyItem.distanceKm) || 0,
    duration_sec: durationSec,
    new_cells: Number(historyItem.newCells) || 0,
    total_cells:
      historyItem.totalCells === undefined || historyItem.totalCells === null
        ? null
        : Number(historyItem.totalCells),
    achievements_unlocked_json: JSON.stringify(
      Array.isArray(historyItem.achievementsUnlocked)
        ? historyItem.achievementsUnlocked
        : [],
    ),
    created_at: finishedAt,
    updated_at: Date.now(),
  };
}

async function runSaveHistoryRow(historyItem: WalkHistoryItem) {
  const database = await openLocalDatabase();
  const row = historyItemToSQLiteRow(historyItem);

  await database.runAsync(
    `
      INSERT INTO walks (
        id,
        started_at,
        finished_at,
        date_text,
        day_key,
        distance_km,
        duration_sec,
        new_cells,
        total_cells,
        achievements_unlocked_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        date_text = excluded.date_text,
        day_key = excluded.day_key,
        distance_km = excluded.distance_km,
        duration_sec = excluded.duration_sec,
        new_cells = excluded.new_cells,
        total_cells = excluded.total_cells,
        achievements_unlocked_json = excluded.achievements_unlocked_json,
        updated_at = excluded.updated_at;
    `,
    row.id,
    row.started_at,
    row.finished_at,
    row.date_text,
    row.day_key,
    row.distance_km,
    row.duration_sec,
    row.new_cells,
    row.total_cells,
    row.achievements_unlocked_json,
    row.created_at,
    row.updated_at,
  );
}

export async function saveHistoryItemToSQLite(historyItem: WalkHistoryItem) {
  try {
    await runSaveHistoryRow(historyItem);
  } catch (error) {
    recordStorageError({
      key: "walkmap_history",
      operation: "sqlite-write",
      table: "walks",
      itemId: historyItem.id,
      error,
    });
  }
}

export async function saveHistoryToSQLite(historyItems: WalkHistoryItem[]) {
  for (const historyItem of historyItems) {
    if (!isHistoryItemLike(historyItem)) {
      continue;
    }

    await saveHistoryItemToSQLite(historyItem);
  }
}

export async function readHistoryFromSQLite() {
  try {
    const database = await openLocalDatabase();
    const rows = await database.getAllAsync<SQLiteHistoryRow>(
      `
        SELECT
          id,
          started_at,
          finished_at,
          date_text,
          day_key,
          distance_km,
          duration_sec,
          new_cells,
          total_cells,
          achievements_unlocked_json,
          created_at,
          updated_at
        FROM walks
        ORDER BY finished_at DESC, created_at DESC;
      `,
    );

    return rows.map(sqliteRowToHistoryItem);
  } catch (error) {
    recordStorageError({
      key: "walkmap_history",
      operation: "sqlite-read",
      table: "walks",
      error,
    });
    return [];
  }
}

export async function countHistoryItemsInSQLite() {
  try {
    const database = await openLocalDatabase();
    const result = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM walks;",
    );

    return result?.count ?? 0;
  } catch (error) {
    recordStorageError({
      key: "walkmap_history",
      operation: "sqlite-count",
      table: "walks",
      error,
    });
    return 0;
  }
}

export async function backfillHistoryToSQLiteFromAsyncStorage() {
  try {
    const historyItems = await readHistoryFromStorage();
    await saveHistoryToSQLite(
      historyItems.filter(isHistoryItemLike),
    );
  } catch (error) {
    recordStorageError({
      key: "walkmap_history",
      operation: "sqlite-backfill",
      table: "walks",
      error,
    });
  }
}

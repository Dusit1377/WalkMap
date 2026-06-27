import type { ActiveWalkData } from "@/features/walkmap/domain";
import { openLocalDatabase } from "@/features/storage/sqlite/database";
import {
  readActiveWalkFromStorage,
  recordStorageError,
} from "@/features/storage/walkmapStorage";

const ACTIVE_WALK_ROW_ID = "current";

type ActiveWalkRow = {
  payload_json: string;
};

function isActiveWalkData(value: unknown): value is ActiveWalkData {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ActiveWalkData).startedAt === "number" &&
    Array.isArray((value as ActiveWalkData).points) &&
    typeof (value as ActiveWalkData).distanceKm === "number"
  );
}

export async function readActiveWalkFromSQLite() {
  try {
    const database = await openLocalDatabase();
    const row = await database.getFirstAsync<ActiveWalkRow>(
      "SELECT payload_json FROM active_walk_payload WHERE id = ?;",
      ACTIVE_WALK_ROW_ID,
    );

    if (!row) {
      return null;
    }

    try {
      const parsed = JSON.parse(row.payload_json);
      return isActiveWalkData(parsed) ? parsed : null;
    } catch (error) {
      recordStorageError({
        key: "walkmap_active_walk",
        operation: "sqlite-active-walk-parse",
        table: "active_walk_payload",
        itemId: ACTIVE_WALK_ROW_ID,
        error,
      });
      return null;
    }
  } catch (error) {
    recordStorageError({
      key: "walkmap_active_walk",
      operation: "sqlite-active-walk-read",
      table: "active_walk_payload",
      itemId: ACTIVE_WALK_ROW_ID,
      error,
    });
    return null;
  }
}

export async function saveActiveWalkToSQLite(activeWalk: ActiveWalkData) {
  try {
    const database = await openLocalDatabase();
    await database.runAsync(
      `
        INSERT INTO active_walk_payload (id, payload_json, started_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          payload_json = excluded.payload_json,
          started_at = excluded.started_at,
          updated_at = excluded.updated_at;
      `,
      ACTIVE_WALK_ROW_ID,
      JSON.stringify(activeWalk),
      activeWalk.startedAt,
      Date.now(),
    );
    return true;
  } catch (error) {
    recordStorageError({
      key: "walkmap_active_walk",
      operation: "sqlite-active-walk-write",
      table: "active_walk_payload",
      itemId: ACTIVE_WALK_ROW_ID,
      error,
    });
    return false;
  }
}

export async function clearActiveWalkFromSQLite() {
  try {
    const database = await openLocalDatabase();
    await database.runAsync(
      "DELETE FROM active_walk_payload WHERE id = ?;",
      ACTIVE_WALK_ROW_ID,
    );
    return true;
  } catch (error) {
    recordStorageError({
      key: "walkmap_active_walk",
      operation: "sqlite-active-walk-clear",
      table: "active_walk_payload",
      itemId: ACTIVE_WALK_ROW_ID,
      error,
    });
    return false;
  }
}

export async function backfillActiveWalkToSQLiteFromAsyncStorage() {
  try {
    const activeWalk = await readActiveWalkFromStorage();

    if (activeWalk) {
      await saveActiveWalkToSQLite(activeWalk);
    }
  } catch (error) {
    recordStorageError({
      key: "walkmap_active_walk",
      operation: "sqlite-active-walk-backfill",
      table: "active_walk_payload",
      itemId: ACTIVE_WALK_ROW_ID,
      error,
    });
  }
}

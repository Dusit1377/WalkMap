import type { CoverageRoute } from "@/features/walkmap/domain";
import { openLocalDatabase } from "@/features/storage/sqlite/database";
import {
  readCoverageRoutesFromStorage,
  recordStorageError,
} from "@/features/storage/walkmapStorage";

type CoverageRouteRow = {
  id: string;
  payload_json: string;
};

function isCoverageRoute(value: unknown): value is CoverageRoute {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as CoverageRoute).id === "string" &&
    Array.isArray((value as CoverageRoute).points)
  );
}

export async function readCoverageRoutesFromSQLite() {
  try {
    const database = await openLocalDatabase();
    const rows = await database.getAllAsync<CoverageRouteRow>(
      `
        SELECT id, payload_json
        FROM coverage_route_payloads
        ORDER BY created_at ASC, id ASC;
      `,
    );
    const routes: CoverageRoute[] = [];

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.payload_json);

        if (isCoverageRoute(parsed)) {
          routes.push(parsed);
        }
      } catch (error) {
        recordStorageError({
          key: "walkmap_coverage_routes",
          operation: "sqlite-coverage-parse",
          table: "coverage_route_payloads",
          itemId: row.id,
          error,
        });
      }
    }

    return routes;
  } catch (error) {
    recordStorageError({
      key: "walkmap_coverage_routes",
      operation: "sqlite-coverage-read",
      table: "coverage_route_payloads",
      error,
    });
    return [];
  }
}

export async function saveCoverageRoutesToSQLite(routes: CoverageRoute[]) {
  try {
    const database = await openLocalDatabase();
    const now = Date.now();

    await database.withTransactionAsync(async () => {
      await database.runAsync("DELETE FROM coverage_route_payloads;");

      for (const route of routes) {
        if (!isCoverageRoute(route)) {
          continue;
        }

        await database.runAsync(
          `
            INSERT INTO coverage_route_payloads
              (id, payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?);
          `,
          route.id,
          JSON.stringify(route),
          now,
          now,
        );
      }
    });
    return true;
  } catch (error) {
    recordStorageError({
      key: "walkmap_coverage_routes",
      operation: "sqlite-coverage-write",
      table: "coverage_route_payloads",
      error,
    });
    return false;
  }
}

export async function clearCoverageRoutesFromSQLite() {
  try {
    const database = await openLocalDatabase();
    await database.runAsync("DELETE FROM coverage_route_payloads;");
    return true;
  } catch (error) {
    recordStorageError({
      key: "walkmap_coverage_routes",
      operation: "sqlite-coverage-clear",
      table: "coverage_route_payloads",
      error,
    });
    return false;
  }
}

export async function backfillCoverageRoutesToSQLiteFromAsyncStorage() {
  try {
    const routes = await readCoverageRoutesFromStorage();
    await saveCoverageRoutesToSQLite(routes.filter(isCoverageRoute));
  } catch (error) {
    recordStorageError({
      key: "walkmap_coverage_routes",
      operation: "sqlite-coverage-backfill",
      table: "coverage_route_payloads",
      error,
    });
  }
}

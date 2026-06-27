import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  ActiveWalkData,
  CoverageRoute,
  LocalProfile,
  WalkHistoryItem,
  WalkPoint,
} from "@/features/walkmap/domain";

const STORAGE_CELLS_KEY = "walkmap_opened_cells";
const STORAGE_HISTORY_KEY = "walkmap_history";
const STORAGE_ACTIVE_WALK_KEY = "walkmap_active_walk";
const STORAGE_COVERAGE_ROUTES_KEY = "walkmap_coverage_routes";
const STORAGE_ACCENT_COLOR_KEY = "walkmap_accent_color";
const STORAGE_LOCAL_PROFILE_KEY = "walkmap_local_profile";
const STORAGE_LAST_LOCATION_KEY = "walkmap_last_location";
const STORAGE_VERSION_KEY = "walkmap_storage_version";
const STORAGE_ERROR_LOG_KEY = "walkmap_storage_error_log";
const LEGACY_LOCAL_SESSION_KEY = "walkmap_local_session";
const CURRENT_STORAGE_VERSION = "1";
const MAX_STORAGE_ERROR_LOG_ENTRIES = 50;

type StorageErrorLogEntry = {
  key: string;
  operation: string;
  message: string;
  timestamp: number;
  rawLength: number;
};

function getStorageErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function appendStorageErrorLog(entry: StorageErrorLogEntry) {
  try {
    const rawLog = await AsyncStorage.getItem(STORAGE_ERROR_LOG_KEY);
    let previousEntries: StorageErrorLogEntry[] = [];

    if (rawLog) {
      try {
        const parsedLog = JSON.parse(rawLog);

        if (Array.isArray(parsedLog)) {
          previousEntries = parsedLog.filter(
            (item) =>
              item &&
              typeof item.key === "string" &&
              typeof item.operation === "string" &&
              typeof item.message === "string" &&
              typeof item.timestamp === "number" &&
              typeof item.rawLength === "number",
          );
        }
      } catch {}
    }

    const nextEntries = [...previousEntries, entry].slice(
      -MAX_STORAGE_ERROR_LOG_ENTRIES,
    );
    await AsyncStorage.setItem(
      STORAGE_ERROR_LOG_KEY,
      JSON.stringify(nextEntries),
    );
  } catch {}
}

function logStorageError(
  key: string,
  operation: string,
  error: unknown,
  raw: string | null,
) {
  void appendStorageErrorLog({
    key,
    operation,
    message: getStorageErrorMessage(error),
    timestamp: Date.now(),
    rawLength: raw?.length ?? 0,
  });
}

function safeParseStorageJson<T>(
  key: string,
  raw: string | null,
  fallback: T,
  operation = "parse",
): T {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logStorageError(key, operation, error, raw);
    return fallback;
  }
}

async function ensureStorageVersionMarker() {
  try {
    const version = await AsyncStorage.getItem(STORAGE_VERSION_KEY);

    if (!version) {
      await AsyncStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
    }
  } catch (error) {
    logStorageError(STORAGE_VERSION_KEY, "version-marker", error, null);
  }
}

async function safeGetStorageItem(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    logStorageError(key, "read", error, null);
    return null;
  }
}

function isValidStoredWalkPoint(point: any): point is WalkPoint {
  return (
    point &&
    typeof point.latitude === "number" &&
    typeof point.longitude === "number" &&
    typeof point.timestamp === "number" &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

export async function readLocalProfileFromStorage(
  normalizeNickname: (nickname: string) => string,
) {
  await ensureStorageVersionMarker();
  const raw = await safeGetStorageItem(STORAGE_LOCAL_PROFILE_KEY);

  if (!raw) {
    return null;
  }

  const parsed = safeParseStorageJson<Partial<LocalProfile> | null>(
    STORAGE_LOCAL_PROFILE_KEY,
    raw,
    null,
  );

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (typeof parsed.id !== "string" || typeof parsed.nickname !== "string") {
    return null;
  }

  return {
    id: parsed.id,
    nickname: normalizeNickname(parsed.nickname),
    createdAt: Number(parsed.createdAt) || Date.now(),
  } satisfies LocalProfile;
}

export async function writeLocalProfileToStorage(profile: LocalProfile) {
  await AsyncStorage.setItem(STORAGE_LOCAL_PROFILE_KEY, JSON.stringify(profile));
}

export async function hasLegacyLocalProgressInStorage() {
  const savedValues = await Promise.all([
    safeGetStorageItem(STORAGE_CELLS_KEY),
    safeGetStorageItem(STORAGE_HISTORY_KEY),
    safeGetStorageItem(STORAGE_ACTIVE_WALK_KEY),
    safeGetStorageItem(STORAGE_COVERAGE_ROUTES_KEY),
    safeGetStorageItem(STORAGE_ACCENT_COLOR_KEY),
    safeGetStorageItem(LEGACY_LOCAL_SESSION_KEY),
  ]);

  return savedValues.some((value) => value !== null);
}

export async function readLegacyProfileNicknameFromStorage(
  normalizeNickname: (nickname: string) => string,
) {
  const raw = await safeGetStorageItem(LEGACY_LOCAL_SESSION_KEY);

  if (!raw) {
    return "Гость";
  }

  const parsed = safeParseStorageJson<{ email?: unknown } | null>(
    LEGACY_LOCAL_SESSION_KEY,
    raw,
    null,
  );

  if (!parsed || typeof parsed.email !== "string") {
    return "Гость";
  }

  const [namePart] = parsed.email.split("@");
  return normalizeNickname(namePart || parsed.email);
}

export async function readActiveWalkFromStorage() {
  await ensureStorageVersionMarker();
  const savedActiveWalk = await safeGetStorageItem(STORAGE_ACTIVE_WALK_KEY);

  if (!savedActiveWalk) return null;

  const parsedActiveWalk = safeParseStorageJson<ActiveWalkData | null>(
    STORAGE_ACTIVE_WALK_KEY,
    savedActiveWalk,
    null,
  );

  if (
    !parsedActiveWalk ||
    typeof parsedActiveWalk.startedAt !== "number" ||
    !Array.isArray(parsedActiveWalk.points)
  ) {
    return null;
  }

  return parsedActiveWalk;
}

export async function saveActiveWalkToStorage(activeWalk: ActiveWalkData) {
  await AsyncStorage.setItem(STORAGE_ACTIVE_WALK_KEY, JSON.stringify(activeWalk));
}

export async function readAccentColorFromStorage() {
  await ensureStorageVersionMarker();
  return safeGetStorageItem(STORAGE_ACCENT_COLOR_KEY);
}

export async function saveAccentColorToStorage(themeId: string) {
  await AsyncStorage.setItem(STORAGE_ACCENT_COLOR_KEY, themeId);
}

export async function readStoredWalkData() {
  await ensureStorageVersionMarker();
  const savedCells = safeParseStorageJson<unknown[]>(
    STORAGE_CELLS_KEY,
    await safeGetStorageItem(STORAGE_CELLS_KEY),
    [],
  );
  const savedHistory = safeParseStorageJson<unknown[]>(
    STORAGE_HISTORY_KEY,
    await safeGetStorageItem(STORAGE_HISTORY_KEY),
    [],
  );
  const savedCoverageRoutes = safeParseStorageJson<unknown[]>(
    STORAGE_COVERAGE_ROUTES_KEY,
    await safeGetStorageItem(STORAGE_COVERAGE_ROUTES_KEY),
    [],
  );

  return {
    savedCells,
    savedHistory,
    savedCoverageRoutes,
  };
}

export async function readLastLocationFromStorage() {
  await ensureStorageVersionMarker();
  const savedLocation = await safeGetStorageItem(STORAGE_LAST_LOCATION_KEY);

  if (!savedLocation) {
    return null;
  }

  const parsedLocation = safeParseStorageJson<unknown>(
    STORAGE_LAST_LOCATION_KEY,
    savedLocation,
    null,
  );

  if (isValidStoredWalkPoint(parsedLocation)) {
    return parsedLocation;
  }

  return null;
}

export async function saveLastLocationToStorage(point: WalkPoint) {
  await AsyncStorage.setItem(STORAGE_LAST_LOCATION_KEY, JSON.stringify(point));
}

export async function saveHistoryToStorage(nextHistory: WalkHistoryItem[]) {
  await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(nextHistory));
}

export async function saveCoverageRoutesToStorage(
  nextCoverageRoutes: CoverageRoute[],
) {
  await AsyncStorage.setItem(
    STORAGE_COVERAGE_ROUTES_KEY,
    JSON.stringify(nextCoverageRoutes),
  );
}

export async function removeActiveWalkFromStorage() {
  await AsyncStorage.removeItem(STORAGE_ACTIVE_WALK_KEY);
}

export async function removeProgressDataFromStorage() {
  await AsyncStorage.removeItem(STORAGE_CELLS_KEY);
  await AsyncStorage.removeItem(STORAGE_HISTORY_KEY);
  await AsyncStorage.removeItem(STORAGE_ACTIVE_WALK_KEY);
  await AsyncStorage.removeItem(STORAGE_COVERAGE_ROUTES_KEY);
}

export async function removeProfileSettingsFromStorage() {
  await AsyncStorage.removeItem(STORAGE_LOCAL_PROFILE_KEY);
  await AsyncStorage.removeItem(STORAGE_ACCENT_COLOR_KEY);
}

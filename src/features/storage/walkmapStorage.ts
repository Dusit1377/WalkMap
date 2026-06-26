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
const LEGACY_LOCAL_SESSION_KEY = "walkmap_local_session";

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
  const raw = await AsyncStorage.getItem(STORAGE_LOCAL_PROFILE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;

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
  } catch {
    return null;
  }
}

export async function writeLocalProfileToStorage(profile: LocalProfile) {
  await AsyncStorage.setItem(STORAGE_LOCAL_PROFILE_KEY, JSON.stringify(profile));
}

export async function hasLegacyLocalProgressInStorage() {
  const savedValues = await Promise.all([
    AsyncStorage.getItem(STORAGE_CELLS_KEY),
    AsyncStorage.getItem(STORAGE_HISTORY_KEY),
    AsyncStorage.getItem(STORAGE_ACTIVE_WALK_KEY),
    AsyncStorage.getItem(STORAGE_COVERAGE_ROUTES_KEY),
    AsyncStorage.getItem(STORAGE_ACCENT_COLOR_KEY),
    AsyncStorage.getItem(LEGACY_LOCAL_SESSION_KEY),
  ]);

  return savedValues.some((value) => value !== null);
}

export async function readLegacyProfileNicknameFromStorage(
  normalizeNickname: (nickname: string) => string,
) {
  const raw = await AsyncStorage.getItem(LEGACY_LOCAL_SESSION_KEY);

  if (!raw) {
    return "Гость";
  }

  try {
    const parsed = JSON.parse(raw) as { email?: unknown };

    if (typeof parsed.email !== "string") {
      return "Гость";
    }

    const [namePart] = parsed.email.split("@");
    return normalizeNickname(namePart || parsed.email);
  } catch {
    return "Гость";
  }
}

export async function readActiveWalkFromStorage() {
  const savedActiveWalk = await AsyncStorage.getItem(STORAGE_ACTIVE_WALK_KEY);

  if (!savedActiveWalk) return null;

  const parsedActiveWalk = JSON.parse(savedActiveWalk) as ActiveWalkData;

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
  return AsyncStorage.getItem(STORAGE_ACCENT_COLOR_KEY);
}

export async function saveAccentColorToStorage(themeId: string) {
  await AsyncStorage.setItem(STORAGE_ACCENT_COLOR_KEY, themeId);
}

export async function readStoredWalkData() {
  const savedCells = await AsyncStorage.getItem(STORAGE_CELLS_KEY);
  const savedHistory = await AsyncStorage.getItem(STORAGE_HISTORY_KEY);
  const savedCoverageRoutes = await AsyncStorage.getItem(
    STORAGE_COVERAGE_ROUTES_KEY,
  );

  return {
    savedCells,
    savedHistory,
    savedCoverageRoutes,
  };
}

export async function readLastLocationFromStorage() {
  const savedLocation = await AsyncStorage.getItem(STORAGE_LAST_LOCATION_KEY);

  if (!savedLocation) {
    return null;
  }

  try {
    const parsedLocation = JSON.parse(savedLocation);

    if (isValidStoredWalkPoint(parsedLocation)) {
      return parsedLocation;
    }
  } catch {}

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

import type {
  ActiveWalkData,
  BackgroundTrackingState,
  CoverageRoute,
  TrackingPointSource,
  WalkHistoryItem,
  WalkPointDiagnostics,
  WalkPoint,
  WalkSessionStatus,
} from "@/features/walkmap/domain";
import type { RejectedTrackingPointReason } from "@/features/location/trackingQuality";
import { getDistanceKm } from "@/features/statistics/distance";
import {
  getProgressStats,
  getTodayKey,
} from "@/features/statistics/calculations";
import { activeWalkRepository } from "@/features/storage/repositories";

type ProgressStats = ReturnType<typeof getProgressStats>;

const DELAYED_POINT_AGE_MS = 30_000;

type PrepareFinishedWalkSessionParams = {
  activeWalk: ActiveWalkData | null;
  fallbackStartedAt: number | null;
  fallbackDurationSec: number;
  fallbackPoints: WalkPoint[];
  fallbackDistanceKm: number;
  history: WalkHistoryItem[];
  coverageRoutes: CoverageRoute[];
  now: number;
  localeDate: string;
  getUnlockedAchievementIds: (
    previousStats: ProgressStats,
    nextStats: ProgressStats,
  ) => string[];
  thinCoveragePoints: (points: WalkPoint[]) => WalkPoint[];
};

export type RestoredWalkSession = {
  startedAt: number;
  durationSec: number;
  distanceKm: number;
  points: WalkPoint[];
  visiblePoints: WalkPoint[];
  currentWalkCells: string[];
  lastPoint: WalkPoint | null;
  status: WalkSessionStatus;
  diagnostics: WalkPointDiagnostics;
};

export type WalkSessionRuntimeState = {
  status: WalkSessionStatus;
  pausedAt: number | null;
};

export async function readActiveWalkSession() {
  return activeWalkRepository.readActiveWalk();
}

export async function saveActiveWalkSession(activeWalk: ActiveWalkData) {
  await activeWalkRepository.writeActiveWalk(activeWalk);
}

export async function clearActiveWalkSession() {
  await activeWalkRepository.clearActiveWalk();
}

export function getVisibleWalkPoints(points: WalkPoint[], limit: number) {
  if (points.length <= limit) {
    return points;
  }

  return points.slice(-limit);
}

export function createWalkDiagnostics(
  now = Date.now(),
  backgroundTrackingState: BackgroundTrackingState = "unknown",
): WalkPointDiagnostics {
  return {
    pointsAccepted: 0,
    pointsRejected: 0,
    pointsDelayed: 0,
    pointsFromForeground: 0,
    pointsFromBackground: 0,
    pointsFromRestored: 0,
    pointsFromUnknown: 0,
    backgroundTrackingState,
    possibleBackgroundGap: false,
    updatedAt: now,
  };
}

export function ensureWalkDiagnostics(activeWalk: ActiveWalkData) {
  if (!activeWalk.diagnostics) {
    activeWalk.diagnostics = createWalkDiagnostics(activeWalk.startedAt);
  }

  return activeWalk.diagnostics;
}

export function recordAcceptedWalkPoint({
  activeWalk,
  source,
  point,
  ageMs,
}: {
  activeWalk: ActiveWalkData;
  source: TrackingPointSource;
  point: WalkPoint;
  ageMs?: number;
}) {
  const diagnostics = ensureWalkDiagnostics(activeWalk);

  diagnostics.pointsAccepted += 1;
  diagnostics.lastAcceptedPointAt = point.timestamp;
  diagnostics.updatedAt = Date.now();

  if (ageMs !== undefined && ageMs > DELAYED_POINT_AGE_MS) {
    diagnostics.pointsDelayed += 1;
  }

  if (source === "foreground") {
    diagnostics.pointsFromForeground += 1;
    diagnostics.lastForegroundPointAt = point.timestamp;
  } else if (source === "background") {
    diagnostics.pointsFromBackground += 1;
    diagnostics.lastBackgroundPointAt = point.timestamp;
    diagnostics.possibleBackgroundGap = false;
  } else if (source === "restored") {
    diagnostics.pointsFromRestored += 1;
  } else {
    diagnostics.pointsFromUnknown += 1;
  }
}

export function recordRejectedWalkPoint({
  activeWalk,
  source,
  reason,
}: {
  activeWalk: ActiveWalkData;
  source: TrackingPointSource;
  reason: RejectedTrackingPointReason;
}) {
  const diagnostics = ensureWalkDiagnostics(activeWalk);

  diagnostics.pointsRejected += 1;
  diagnostics.lastRejectedReason = reason;
  diagnostics.updatedAt = Date.now();

  void source;
}

export function setActiveWalkBackgroundTrackingState(
  activeWalk: ActiveWalkData | null,
  backgroundTrackingState: BackgroundTrackingState,
) {
  if (!activeWalk) {
    return;
  }

  const diagnostics = ensureWalkDiagnostics(activeWalk);
  diagnostics.backgroundTrackingState = backgroundTrackingState;
  diagnostics.updatedAt = Date.now();
}

export function markPossibleBackgroundGap(
  activeWalk: ActiveWalkData | null,
  now = Date.now(),
  gapThresholdMs = 5 * 60 * 1000,
) {
  const lastBackgroundPointAt = activeWalk?.diagnostics?.lastBackgroundPointAt;

  if (!lastBackgroundPointAt) {
    return false;
  }

  const diagnostics = ensureWalkDiagnostics(activeWalk);
  const hasGap = now - lastBackgroundPointAt > gapThresholdMs;
  diagnostics.possibleBackgroundGap = hasGap;
  diagnostics.updatedAt = now;
  return hasGap;
}

export function restoreWalkSession(
  activeWalk: ActiveWalkData | null,
  now: number,
): RestoredWalkSession | null {
  if (!activeWalk) {
    return null;
  }

  return {
    startedAt: activeWalk.startedAt,
    durationSec: Math.floor((now - activeWalk.startedAt) / 1000),
    distanceKm: activeWalk.distanceKm,
    points: activeWalk.points,
    visiblePoints: activeWalk.points,
    currentWalkCells: [],
    lastPoint: activeWalk.points[activeWalk.points.length - 1] || null,
    status: "active",
    diagnostics: ensureWalkDiagnostics(activeWalk),
  };
}

export function createActiveWalk(
  startedAt: number,
  firstPoint: WalkPoint,
): ActiveWalkData {
  return {
    startedAt,
    points: [firstPoint],
    currentWalkCells: [],
    distanceKm: 0,
    diagnostics: {
      ...createWalkDiagnostics(startedAt, "inactive"),
      pointsAccepted: 1,
      pointsFromForeground: 1,
      lastAcceptedPointAt: firstPoint.timestamp,
      lastForegroundPointAt: firstPoint.timestamp,
      updatedAt: startedAt,
    },
  };
}

export function addPointToActiveWalk(
  activeWalk: ActiveWalkData,
  newPoint: WalkPoint,
) {
  const lastPoint = activeWalk.points[activeWalk.points.length - 1];

  if (lastPoint) {
    const addedDistance = getDistanceKm(lastPoint, newPoint);

    if (addedDistance > 0.003 && addedDistance < 0.2) {
      activeWalk.distanceKm += addedDistance;
    }

    if (addedDistance < 0.003) {
      return activeWalk;
    }
  }

  activeWalk.points.push(newPoint);
  activeWalk.currentWalkCells = [];

  return activeWalk;
}

export function pauseWalkSession(
  state: WalkSessionRuntimeState,
  pausedAt = Date.now(),
): WalkSessionRuntimeState {
  return {
    ...state,
    status: "paused",
    pausedAt,
  };
}

export function resumeWalkSession(
  state: WalkSessionRuntimeState,
): WalkSessionRuntimeState {
  return {
    ...state,
    status: "active",
    pausedAt: null,
  };
}

export function startWalkSession(startedAt: number, firstPoint: WalkPoint) {
  const activeWalk = createActiveWalk(startedAt, firstPoint);

  return {
    activeWalk,
    startedAt,
    points: activeWalk.points,
    currentWalkCells: [],
    distanceKm: activeWalk.distanceKm,
  };
}

export function finishWalkSession({
  activeWalk,
  fallbackStartedAt,
  fallbackDurationSec,
  fallbackPoints,
  fallbackDistanceKm,
  history,
  coverageRoutes,
  now,
  localeDate,
  getUnlockedAchievementIds,
  thinCoveragePoints,
}: PrepareFinishedWalkSessionParams) {
  const finishStartedAt = activeWalk?.startedAt ?? fallbackStartedAt;
  const durationSec = finishStartedAt
    ? Math.floor((now - finishStartedAt) / 1000)
    : fallbackDurationSec;
  const points =
    activeWalk && activeWalk.points.length > 0
      ? activeWalk.points
      : fallbackPoints;
  const distanceKm = activeWalk?.distanceKm ?? fallbackDistanceKm;

  const previousStats = getProgressStats([], history);
  const nextHistoryBase: WalkHistoryItem = {
    id: now.toString(),
    date: localeDate,
    dayKey: getTodayKey(),
    distanceKm,
    durationSec,
    newCells: 0,
    totalCells: undefined,
  };
  const nextStats = getProgressStats([], [nextHistoryBase, ...history]);
  const unlockedAchievementIds = getUnlockedAchievementIds(
    previousStats,
    nextStats,
  );

  const walkItem: WalkHistoryItem = {
    ...nextHistoryBase,
    achievementsUnlocked: unlockedAchievementIds,
  };
  const nextHistory = [walkItem, ...history];
  const nextCoverageRoutes =
    points.length > 0
      ? [
          {
            id: walkItem.id,
            points: thinCoveragePoints(points),
          },
          ...coverageRoutes,
        ].slice(0, 500)
      : coverageRoutes;

  return {
    durationSec,
    distanceKm,
    points,
    walkItem,
    nextHistory,
    nextCoverageRoutes,
  };
}

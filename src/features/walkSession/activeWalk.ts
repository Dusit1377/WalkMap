import type {
  ActiveWalkData,
  CoverageRoute,
  WalkHistoryItem,
  WalkPoint,
} from "@/features/walkmap/domain";
import {
  getDistanceKm,
  getProgressStats,
  getTodayKey,
} from "@/features/statistics/calculations";

type ProgressStats = ReturnType<typeof getProgressStats>;

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

export function createActiveWalk(
  startedAt: number,
  firstPoint: WalkPoint,
): ActiveWalkData {
  return {
    startedAt,
    points: [firstPoint],
    currentWalkCells: [],
    distanceKm: 0,
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

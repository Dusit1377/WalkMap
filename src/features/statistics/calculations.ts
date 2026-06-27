import type {
  DailyProgress,
  GpsSignalState,
  LevelInfo,
  WalkDerivedMetrics,
  WalkHistoryItem,
  WalkPoint,
} from "@/features/walkmap/domain";
import { getRouteDistanceKm } from "@/features/statistics/distance";

export { getDistanceKm, getRouteDistanceKm } from "@/features/statistics/distance";

const DAILY_DISTANCE_GOAL_KM = 1;

const LEVELS = [
  { level: 1, title: "Новичок", km: 0 },
  { level: 2, title: "Гуляющий", km: 1 },
  { level: 3, title: "Исследователь", km: 5 },
  { level: 4, title: "Картограф", km: 15 },
  { level: 5, title: "Покоритель района", km: 35 },
  { level: 6, title: "Легенда маршрутов", km: 75 },
];

type GpsSignalInput = {
  lastAccuracy?: number | null;
  lastPointTimestamp?: number | null;
  now?: number;
  pointsAccepted?: number;
  pointsRejected?: number;
};

type DerivedMetricsInput = {
  points?: WalkPoint[];
  startedAt?: number | null;
  finishedAt?: number | null;
  distanceKm?: number | null;
  durationSec?: number | null;
  pointsAccepted?: number | null;
  pointsRejected?: number | null;
  rejectedPointsByReason?: Partial<Record<string, number>>;
  lastAccuracy?: number | null;
  now?: number;
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeNonNegativeNumber(value: unknown) {
  return Math.max(0, safeNumber(value));
}

export function getAverageSpeedKmh(distanceKm: number, durationSec: number) {
  const safeDistanceKm = safeNonNegativeNumber(distanceKm);
  const safeDurationSec = safeNonNegativeNumber(durationSec);

  if (safeDistanceKm <= 0 || safeDurationSec <= 0) {
    return 0;
  }

  const speed = safeDistanceKm / (safeDurationSec / 3600);
  return Number.isFinite(speed) ? speed : 0;
}

export function getGpsSignalState({
  lastAccuracy,
  lastPointTimestamp,
  now = Date.now(),
  pointsAccepted = 0,
  pointsRejected = 0,
}: GpsSignalInput): GpsSignalState {
  const accepted = safeNonNegativeNumber(pointsAccepted);
  const rejected = safeNonNegativeNumber(pointsRejected);
  const totalPoints = accepted + rejected;
  const rejectionRatio = totalPoints > 0 ? rejected / totalPoints : 0;
  const accuracy = safeNumber(lastAccuracy, Number.NaN);
  const timestamp = safeNumber(lastPointTimestamp, Number.NaN);
  const ageMs = Number.isFinite(timestamp) ? now - timestamp : Number.NaN;

  if (accepted <= 0) {
    return rejected > 0 ? "lost" : "unknown";
  }

  if (Number.isFinite(ageMs) && ageMs > 2 * 60 * 1000) {
    return "lost";
  }

  if (
    (Number.isFinite(accuracy) && accuracy > 80) ||
    rejectionRatio >= 0.5
  ) {
    return "poor";
  }

  if (
    (Number.isFinite(accuracy) && accuracy > 35) ||
    rejectionRatio >= 0.2
  ) {
    return "weak";
  }

  return "good";
}

export function getWalkDerivedMetrics({
  points = [],
  startedAt,
  finishedAt,
  distanceKm,
  durationSec,
  pointsAccepted,
  pointsRejected,
  rejectedPointsByReason,
  lastAccuracy,
  now = Date.now(),
}: DerivedMetricsInput): WalkDerivedMetrics {
  const safeStartedAt = safeNumber(startedAt, Number.NaN);
  const safeFinishedAt = safeNumber(finishedAt, now);
  const timestampDurationSec =
    Number.isFinite(safeStartedAt) && Number.isFinite(safeFinishedAt)
      ? Math.max(0, Math.floor((safeFinishedAt - safeStartedAt) / 1000))
      : 0;
  const safeDurationSec =
    durationSec === null || durationSec === undefined
      ? timestampDurationSec
      : safeNonNegativeNumber(durationSec);
  const safeDistanceKm =
    distanceKm === null || distanceKm === undefined
      ? getRouteDistanceKm(points)
      : safeNonNegativeNumber(distanceKm);
  const accepted =
    pointsAccepted === null || pointsAccepted === undefined
      ? points.length
      : safeNonNegativeNumber(pointsAccepted);
  const rejected =
    pointsRejected === null || pointsRejected === undefined
      ? 0
      : safeNonNegativeNumber(pointsRejected);
  const lastPoint = points[points.length - 1];

  return {
    distanceKm: safeDistanceKm,
    durationSec: safeDurationSec,
    avgSpeedKmh: getAverageSpeedKmh(safeDistanceKm, safeDurationSec),
    gpsSignalState: getGpsSignalState({
      lastAccuracy,
      lastPointTimestamp: lastPoint?.timestamp,
      now,
      pointsAccepted: accepted,
      pointsRejected: rejected,
    }),
    pointsAccepted: accepted,
    pointsRejected: rejected,
    rejectedPointsByReason,
    startedAt: Number.isFinite(safeStartedAt) ? safeStartedAt : undefined,
    finishedAt: Number.isFinite(safeFinishedAt) ? safeFinishedAt : undefined,
    movingDurationSec: safeDurationSec,
  };
}

export function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

export function getDayKeyFromHistoryItem(item: WalkHistoryItem) {
  if (item.dayKey) return item.dayKey;

  const match = item.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);

  if (!match) return "";

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getYesterdayKey(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00`);
  date.setDate(date.getDate() - 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getStreak(items: WalkHistoryItem[]) {
  const walkedDays = Array.from(
    new Set(items.map(getDayKeyFromHistoryItem).filter(Boolean)),
  ).sort();

  if (walkedDays.length === 0) return 0;

  let streak = 0;
  let cursor = getTodayKey();

  while (walkedDays.includes(cursor)) {
    streak += 1;
    cursor = getYesterdayKey(cursor);
  }

  return streak;
}

export function getLevelInfo(totalDistanceKm: number): LevelInfo {
  const safeTotalDistanceKm = safeNonNegativeNumber(totalDistanceKm);
  let current = LEVELS[0];
  let next = LEVELS[LEVELS.length - 1];

  for (let index = 0; index < LEVELS.length; index += 1) {
    if (safeTotalDistanceKm >= LEVELS[index].km) {
      current = LEVELS[index];
    }

    if (safeTotalDistanceKm < LEVELS[index].km) {
      next = LEVELS[index];
      break;
    }
  }

  const currentLevelTargetKm = current.km;
  const nextLevelTargetKm = next.km;
  const isMaxLevel = current.level === LEVELS[LEVELS.length - 1].level;
  const progressPercent = isMaxLevel
    ? 100
    : Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((safeTotalDistanceKm - currentLevelTargetKm) /
              Math.max(0.1, nextLevelTargetKm - currentLevelTargetKm)) *
              100,
          ),
        ),
      );

  return {
    level: current.level,
    title: current.title,
    currentLevelDistanceKm: Math.round(safeTotalDistanceKm * 10) / 10,
    currentLevelTargetKm,
    nextLevelTargetKm,
    progressPercent,
    distanceToNextLevelKm: isMaxLevel
      ? 0
      : Math.max(0, Math.round((nextLevelTargetKm - safeTotalDistanceKm) * 10) / 10),
  };
}

export function getDailyProgress(items: WalkHistoryItem[]): DailyProgress {
  const todayKey = getTodayKey();
  const todayItems = items.filter(
    (item) => getDayKeyFromHistoryItem(item) === todayKey,
  );

  const todayDistance = todayItems.reduce(
    (sum, item) => sum + safeNonNegativeNumber(item.distanceKm),
    0,
  );

  const todayDuration = todayItems.reduce(
    (sum, item) => sum + safeNonNegativeNumber(item.durationSec),
    0,
  );

  return {
    dayKey: todayKey,
    distanceKm: todayDistance,
    durationSec: todayDuration,
    walks: todayItems.length,
    distanceGoalPercent: Math.min(
      100,
      Math.round((todayDistance / DAILY_DISTANCE_GOAL_KM) * 100),
    ),
    isGoalDone: todayDistance >= DAILY_DISTANCE_GOAL_KM,
  };
}

export function getProgressStats(_coverageCells: string[], items: WalkHistoryItem[]) {
  const totalDistance = items.reduce(
    (sum, item) => sum + safeNonNegativeNumber(item.distanceKm),
    0,
  );

  const totalDuration = items.reduce(
    (sum, item) => sum + safeNonNegativeNumber(item.durationSec),
    0,
  );

  const longestWalkKm = items.reduce(
    (max, item) => Math.max(max, safeNonNegativeNumber(item.distanceKm)),
    0,
  );

  const longestWalkSec = items.reduce(
    (max, item) => Math.max(max, safeNonNegativeNumber(item.durationSec)),
    0,
  );

  const aggregateMetrics = getWalkDerivedMetrics({
    distanceKm: totalDistance,
    durationSec: totalDuration,
    pointsAccepted: 0,
    pointsRejected: 0,
  });

  return {
    totalWalks: items.length,
    totalDistanceKm: totalDistance,
    totalDurationSec: totalDuration,
    longestWalkKm,
    longestWalkSec,
    streak: getStreak(items),
    levelInfo: getLevelInfo(totalDistance),
    dailyProgress: getDailyProgress(items),
    avgSpeedKmh: aggregateMetrics.avgSpeedKmh,
    gpsSignalState: aggregateMetrics.gpsSignalState,
    pointsAccepted: aggregateMetrics.pointsAccepted,
    pointsRejected: aggregateMetrics.pointsRejected,
  };
}

import type {
  DailyProgress,
  LevelInfo,
  WalkHistoryItem,
  WalkPoint,
} from "@/features/walkmap/domain";

const DAILY_DISTANCE_GOAL_KM = 1;

const LEVELS = [
  { level: 1, title: "Новичок", km: 0 },
  { level: 2, title: "Гуляющий", km: 1 },
  { level: 3, title: "Исследователь", km: 5 },
  { level: 4, title: "Картограф", km: 15 },
  { level: 5, title: "Покоритель района", km: 35 },
  { level: 6, title: "Легенда маршрутов", km: 75 },
];

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceKm(a: WalkPoint, b: WalkPoint) {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
  let current = LEVELS[0];
  let next = LEVELS[LEVELS.length - 1];

  for (let index = 0; index < LEVELS.length; index += 1) {
    if (totalDistanceKm >= LEVELS[index].km) {
      current = LEVELS[index];
    }

    if (totalDistanceKm < LEVELS[index].km) {
      next = LEVELS[index];
      break;
    }
  }

  const currentTarget = current.km;
  const nextTarget = next.km;
  const isMaxLevel = current.level === LEVELS[LEVELS.length - 1].level;
  const progressPercent = isMaxLevel
    ? 100
    : Math.min(
        100,
        Math.round(
          ((totalDistanceKm - currentTarget) /
            Math.max(0.1, nextTarget - currentTarget)) *
            100,
        ),
      );

  return {
    level: current.level,
    title: current.title,
    currentCells: Math.round(totalDistanceKm * 10) / 10,
    currentTarget,
    nextTarget,
    progressPercent,
    cellsToNextLevel: isMaxLevel
      ? 0
      : Math.max(0, Math.round((nextTarget - totalDistanceKm) * 10) / 10),
  };
}

export function getDailyProgress(items: WalkHistoryItem[]): DailyProgress {
  const todayKey = getTodayKey();
  const todayItems = items.filter(
    (item) => getDayKeyFromHistoryItem(item) === todayKey,
  );

  const todayDistance = todayItems.reduce(
    (sum, item) => sum + (Number(item.distanceKm) || 0),
    0,
  );

  const todayDuration = todayItems.reduce(
    (sum, item) => sum + (Number(item.durationSec) || 0),
    0,
  );

  return {
    dayKey: todayKey,
    distanceKm: todayDistance,
    durationSec: todayDuration,
    newCells: 0,
    walks: todayItems.length,
    cellsGoalPercent: 0,
    distanceGoalPercent: Math.min(
      100,
      Math.round((todayDistance / DAILY_DISTANCE_GOAL_KM) * 100),
    ),
    isGoalDone: todayDistance >= DAILY_DISTANCE_GOAL_KM,
  };
}

export function getProgressStats(_cells: string[], items: WalkHistoryItem[]) {
  const totalDistance = items.reduce(
    (sum, item) => sum + (Number(item.distanceKm) || 0),
    0,
  );

  const totalDuration = items.reduce(
    (sum, item) => sum + (Number(item.durationSec) || 0),
    0,
  );

  const longestWalkKm = items.reduce(
    (max, item) => Math.max(max, Number(item.distanceKm) || 0),
    0,
  );

  const longestWalkSec = items.reduce(
    (max, item) => Math.max(max, Number(item.durationSec) || 0),
    0,
  );

  return {
    totalWalks: items.length,
    totalDistanceKm: totalDistance,
    totalDurationSec: totalDuration,
    openedCellsCount: 0,
    longestWalkKm,
    longestWalkSec,
    bestCellsWalk: 0,
    streak: getStreak(items),
    levelInfo: getLevelInfo(totalDistance),
    dailyProgress: getDailyProgress(items),
  };
}

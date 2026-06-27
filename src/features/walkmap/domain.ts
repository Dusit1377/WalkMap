export type WalkPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type WalkHistoryItem = {
  id: string;
  date: string;
  dayKey?: string;
  distanceKm: number;
  durationSec: number;
  newCells: number;
  totalCells?: number;
  achievementsUnlocked?: string[];
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  isUnlocked: boolean;
};

export type LevelInfo = {
  level: number;
  title: string;
  currentLevelDistanceKm: number;
  currentLevelTargetKm: number;
  nextLevelTargetKm: number;
  progressPercent: number;
  distanceToNextLevelKm: number;
};

export type DailyProgress = {
  dayKey: string;
  distanceKm: number;
  durationSec: number;
  walks: number;
  distanceGoalPercent: number;
  isGoalDone: boolean;
};

export type GpsSignalState = "good" | "weak" | "poor" | "lost" | "unknown";

export type WalkDerivedMetrics = {
  distanceKm: number;
  durationSec: number;
  avgSpeedKmh: number;
  avgPaceMinPerKm: number | null;
  gpsSignalState: GpsSignalState;
  pointsAccepted: number;
  pointsRejected: number;
  rejectedPointsByReason?: Partial<Record<string, number>>;
  startedAt?: number;
  finishedAt?: number;
  movingDurationSec?: number;
};

export type MapGeoJsonData = {
  type: "FeatureCollection";
  features: any[];
};

export type ActiveWalkData = {
  startedAt: number;
  points: WalkPoint[];
  currentWalkCells?: string[];
  distanceKm: number;
};

export type WalkSessionStatus = "idle" | "active" | "paused";

export type CoverageRoute = {
  id: string;
  points: WalkPoint[];
};

export type LocalProfile = {
  id: string;
  nickname: string;
  createdAt: number;
};

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

export type TrackingPointSource =
  | "foreground"
  | "background"
  | "restored"
  | "unknown";

export type BackgroundTrackingState =
  | "unavailable"
  | "permissionDenied"
  | "starting"
  | "active"
  | "inactive"
  | "stoppedBySystem"
  | "error"
  | "unknown";

export type WalkPointDiagnostics = {
  pointsAccepted: number;
  pointsRejected: number;
  pointsDelayed: number;
  pointsFromForeground: number;
  pointsFromBackground: number;
  pointsFromRestored: number;
  pointsFromUnknown: number;
  lastAcceptedPointAt?: number;
  lastBackgroundPointAt?: number;
  lastForegroundPointAt?: number;
  lastRejectedReason?: string;
  backgroundTrackingState: BackgroundTrackingState;
  possibleBackgroundGap: boolean;
  updatedAt: number;
};

export type WalkDerivedMetrics = {
  distanceKm: number;
  durationSec: number;
  avgSpeedKmh: number;
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
  diagnostics?: WalkPointDiagnostics;
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

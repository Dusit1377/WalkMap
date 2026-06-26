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
  currentCells: number;
  currentTarget: number;
  nextTarget: number;
  progressPercent: number;
  cellsToNextLevel: number;
};

export type DailyProgress = {
  dayKey: string;
  distanceKm: number;
  durationSec: number;
  newCells: number;
  walks: number;
  cellsGoalPercent: number;
  distanceGoalPercent: number;
  isGoalDone: boolean;
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

export type CoverageRoute = {
  id: string;
  points: WalkPoint[];
};

export type LocalProfile = {
  id: string;
  nickname: string;
  createdAt: number;
};

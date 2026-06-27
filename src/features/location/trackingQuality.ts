import type { TrackingPointSource, WalkPoint } from "@/features/walkmap/domain";
import { getDistanceKm } from "@/features/statistics/distance";
import { appendLocalErrorReport } from "@/features/errorReporting";

export type { TrackingPointSource } from "@/features/walkmap/domain";

export type RejectedTrackingPointReason =
  | "invalid_coordinates"
  | "stale_timestamp"
  | "future_timestamp"
  | "poor_accuracy"
  | "unrealistic_speed"
  | "max_jump_exceeded"
  | "missing_timestamp"
  | "missing_coordinates"
  | "background_permission_denied"
  | "foreground_permission_denied"
  | "watch_position_error"
  | "background_task_error";

export type TrackingPointCandidate = {
  latitude?: number | null;
  longitude?: number | null;
  timestamp?: number | null;
  accuracy?: number | null;
  speed?: number | null;
};

export type TrackingPointQualityResult =
  | {
      accepted: true;
      point: WalkPoint;
      distanceFromPrevious: number;
      ageMs: number;
      accuracy?: number;
      speed?: number;
    }
  | {
      accepted: false;
      reason: RejectedTrackingPointReason;
      distanceFromPrevious?: number;
      ageMs?: number;
      accuracy?: number;
      speed?: number;
    };

const MAX_LOCATION_AGE_MS = 2 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;
const MAX_ACCURACY_METERS = 80;
const MAX_SPEED_METERS_PER_SECOND = 8;
const MAX_JUMP_KM = 0.35;
const MAX_JUMP_SPEED_METERS_PER_SECOND = 10;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeOptionalMetric(value: number | null | undefined) {
  return isFiniteNumber(value) ? value : undefined;
}

export function evaluateTrackingPointQuality({
  candidate,
  previousPoint,
  now = Date.now(),
}: {
  candidate: TrackingPointCandidate;
  previousPoint?: WalkPoint | null;
  now?: number;
}): TrackingPointQualityResult {
  const accuracy = normalizeOptionalMetric(candidate.accuracy);
  const speed = normalizeOptionalMetric(candidate.speed);

  if (
    !isFiniteNumber(candidate.latitude) ||
    !isFiniteNumber(candidate.longitude)
  ) {
    return {
      accepted: false,
      reason: "missing_coordinates",
      accuracy,
      speed,
    };
  }

  if (
    candidate.latitude < -90 ||
    candidate.latitude > 90 ||
    candidate.longitude < -180 ||
    candidate.longitude > 180
  ) {
    return {
      accepted: false,
      reason: "invalid_coordinates",
      accuracy,
      speed,
    };
  }

  if (!isFiniteNumber(candidate.timestamp)) {
    return {
      accepted: false,
      reason: "missing_timestamp",
      accuracy,
      speed,
    };
  }

  const ageMs = now - candidate.timestamp;

  if (ageMs > MAX_LOCATION_AGE_MS) {
    return {
      accepted: false,
      reason: "stale_timestamp",
      ageMs,
      accuracy,
      speed,
    };
  }

  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    return {
      accepted: false,
      reason: "future_timestamp",
      ageMs,
      accuracy,
      speed,
    };
  }

  if (accuracy !== undefined && accuracy > MAX_ACCURACY_METERS) {
    return {
      accepted: false,
      reason: "poor_accuracy",
      ageMs,
      accuracy,
      speed,
    };
  }

  if (speed !== undefined && speed > MAX_SPEED_METERS_PER_SECOND) {
    return {
      accepted: false,
      reason: "unrealistic_speed",
      ageMs,
      accuracy,
      speed,
    };
  }

  const point: WalkPoint = {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    timestamp: candidate.timestamp,
  };
  const distanceFromPrevious = previousPoint
    ? getDistanceKm(previousPoint, point)
    : 0;

  if (previousPoint) {
    const timeDeltaSec = Math.max(
      1,
      Math.abs(point.timestamp - previousPoint.timestamp) / 1000,
    );
    const impliedSpeed = (distanceFromPrevious * 1000) / timeDeltaSec;

    if (
      distanceFromPrevious > MAX_JUMP_KM ||
      impliedSpeed > MAX_JUMP_SPEED_METERS_PER_SECOND
    ) {
      return {
        accepted: false,
        reason: "max_jump_exceeded",
        distanceFromPrevious,
        ageMs,
        accuracy,
        speed,
      };
    }
  }

  return {
    accepted: true,
    point,
    distanceFromPrevious,
    ageMs,
    accuracy,
    speed,
  };
}

export function logRejectedTrackingPoint({
  reason,
  source,
  operation,
  ageMs,
  accuracy,
  speed,
  distanceFromPrevious,
}: {
  reason: RejectedTrackingPointReason;
  source: TrackingPointSource;
  operation: string;
  ageMs?: number;
  accuracy?: number;
  speed?: number;
  distanceFromPrevious?: number;
}) {
  void appendLocalErrorReport({
    source: "app",
    severity: "warning",
    message: `Location point rejected: ${reason}`,
    operation,
    metadata: {
      reason,
      captureMode: source,
      ageMs: ageMs ?? null,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      distanceFromPrevious: distanceFromPrevious ?? null,
    },
  });
}

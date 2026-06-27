import {
  getAveragePaceMinPerKm,
  getAverageSpeedKmh,
  getWalkDerivedMetrics,
} from "@/features/statistics/calculations";
import { getDistanceKm } from "@/features/statistics/distance";
import { evaluateTrackingPointQuality } from "@/features/location/trackingQuality";
import type { WalkPoint } from "@/features/walkmap/domain";

type StatisticsSelfCheck = {
  name: string;
  run: () => void;
};

function assertCheck(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Statistics self-check failed: ${message}`);
  }
}

function assertFiniteMetric(value: number | null, message: string) {
  assertCheck(value === null || Number.isFinite(value), message);
}

const origin: WalkPoint = {
  latitude: 55.7558,
  longitude: 37.6173,
  timestamp: 1_000_000,
};

const nearby: WalkPoint = {
  latitude: 55.7568,
  longitude: 37.6173,
  timestamp: 1_060_000,
};

export const STATISTICS_SELF_CHECKS: StatisticsSelfCheck[] = [
  {
    name: "same point distance is zero",
    run: () => {
      assertCheck(getDistanceKm(origin, origin) === 0, "same point distance");
    },
  },
  {
    name: "known small segment stays in expected range",
    run: () => {
      const distanceKm = getDistanceKm(origin, nearby);
      assertCheck(
        distanceKm > 0.09 && distanceKm < 0.13,
        "small segment range",
      );
    },
  },
  {
    name: "empty point list returns finite metrics",
    run: () => {
      const metrics = getWalkDerivedMetrics({ points: [] });
      assertFiniteMetric(metrics.distanceKm, "empty distance");
      assertFiniteMetric(metrics.avgSpeedKmh, "empty speed");
      assertFiniteMetric(metrics.avgPaceMinPerKm, "empty pace");
    },
  },
  {
    name: "one point returns finite metrics",
    run: () => {
      const metrics = getWalkDerivedMetrics({ points: [origin] });
      assertFiniteMetric(metrics.distanceKm, "one-point distance");
      assertFiniteMetric(metrics.avgSpeedKmh, "one-point speed");
      assertFiniteMetric(metrics.avgPaceMinPerKm, "one-point pace");
    },
  },
  {
    name: "zero duration does not create infinite speed",
    run: () => {
      assertCheck(getAverageSpeedKmh(1, 0) === 0, "zero duration speed");
    },
  },
  {
    name: "zero distance does not create infinite pace",
    run: () => {
      assertCheck(getAveragePaceMinPerKm(0, 60) === null, "zero distance pace");
    },
  },
  {
    name: "rejected GPS jump does not increase distance",
    run: () => {
      const jump = {
        latitude: 55.9,
        longitude: 37.9,
        timestamp: origin.timestamp + 1_000,
        accuracy: 10,
      };
      const result = evaluateTrackingPointQuality({
        candidate: jump,
        previousPoint: origin,
        now: jump.timestamp,
      });
      const metrics = getWalkDerivedMetrics({
        points: [origin],
        distanceKm: result.accepted ? result.distanceFromPrevious : 0,
        durationSec: 1,
        pointsAccepted: result.accepted ? 2 : 1,
        pointsRejected: result.accepted ? 0 : 1,
      });

      assertCheck(!result.accepted, "jump rejected");
      assertCheck(metrics.distanceKm === 0, "jump distance ignored");
    },
  },
  {
    name: "restart duration can be calculated from timestamps",
    run: () => {
      const metrics = getWalkDerivedMetrics({
        points: [origin, nearby],
        startedAt: origin.timestamp,
        finishedAt: origin.timestamp + 125_000,
      });

      assertCheck(metrics.durationSec === 125, "timestamp duration");
    },
  },
];

export function runStatisticsSelfChecks() {
  STATISTICS_SELF_CHECKS.forEach((check) => check.run());
}

import type { ActiveWalkData, WalkPoint } from "@/features/walkmap/domain";
import { getDistanceKm } from "@/features/statistics/calculations";

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

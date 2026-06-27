import type { WalkPoint } from "@/features/walkmap/domain";

export const EARTH_RADIUS_KM = 6371;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidCoordinates(point: WalkPoint) {
  return (
    isFiniteNumber(point.latitude) &&
    isFiniteNumber(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceKm(a: WalkPoint, b: WalkPoint) {
  if (!hasValidCoordinates(a) || !hasValidCoordinates(b)) {
    return 0;
  }

  if (a.latitude === b.latitude && a.longitude === b.longitude) {
    return 0;
  }

  const dLat = degreesToRadians(b.latitude - a.latitude);
  const dLon = degreesToRadians(b.longitude - a.longitude);
  const lat1 = degreesToRadians(a.latitude);
  const lat2 = degreesToRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const normalizedH = Math.min(1, Math.max(0, h));
  const distanceKm =
    2 *
    EARTH_RADIUS_KM *
    Math.atan2(Math.sqrt(normalizedH), Math.sqrt(1 - normalizedH));

  return Number.isFinite(distanceKm) ? distanceKm : 0;
}

export function getRouteDistanceKm(points: WalkPoint[]) {
  return points.reduce((totalDistanceKm, point, index) => {
    if (index === 0) return totalDistanceKm;

    return totalDistanceKm + getDistanceKm(points[index - 1], point);
  }, 0);
}

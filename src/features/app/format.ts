export function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatKm(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return safeValue.toFixed(2).replace(".", ",");
}

export function formatSpeedKmh(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${safeValue.toFixed(1).replace(".", ",")} км/ч`;
}

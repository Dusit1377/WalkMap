import AsyncStorage from "@react-native-async-storage/async-storage";

import { sanitizeErrorReport } from "@/features/errorReporting/sanitize";
import type {
  AppErrorReport,
  SanitizedErrorPayload,
} from "@/features/errorReporting/types";

const ERROR_REPORT_QUEUE_KEY = "walkmap_error_report_queue";
const MAX_ERROR_REPORT_QUEUE_ENTRIES = 50;

function isSanitizedErrorPayload(item: unknown): item is SanitizedErrorPayload {
  return (
    !!item &&
    typeof item === "object" &&
    typeof (item as SanitizedErrorPayload).id === "string" &&
    typeof (item as SanitizedErrorPayload).timestamp === "number" &&
    typeof (item as SanitizedErrorPayload).platform === "string" &&
    typeof (item as SanitizedErrorPayload).source === "string" &&
    typeof (item as SanitizedErrorPayload).severity === "string" &&
    typeof (item as SanitizedErrorPayload).message === "string"
  );
}

async function readErrorReportQueue() {
  try {
    const rawQueue = await AsyncStorage.getItem(ERROR_REPORT_QUEUE_KEY);

    if (!rawQueue) {
      return [];
    }

    const parsedQueue = JSON.parse(rawQueue);
    return Array.isArray(parsedQueue)
      ? parsedQueue.filter(isSanitizedErrorPayload)
      : [];
  } catch {
    return [];
  }
}

export async function getLocalErrorReports() {
  return readErrorReportQueue();
}

export async function appendLocalErrorReport(report: AppErrorReport) {
  try {
    const sanitizedReport = sanitizeErrorReport(report);
    const previousReports = await readErrorReportQueue();
    const nextReports = [...previousReports, sanitizedReport].slice(
      -MAX_ERROR_REPORT_QUEUE_ENTRIES,
    );

    await AsyncStorage.setItem(
      ERROR_REPORT_QUEUE_KEY,
      JSON.stringify(nextReports),
    );
  } catch {}
}

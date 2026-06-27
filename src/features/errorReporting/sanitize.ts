import Constants from "expo-constants";
import { Platform } from "react-native";

import type {
  AppErrorReport,
  SanitizedErrorPayload,
} from "@/features/errorReporting/types";

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LINES = 6;
const MAX_STACK_LENGTH = 1200;
const MAX_METADATA_ENTRIES = 12;

const PRIVATE_METADATA_KEY_PATTERN =
  /(lat|latitude|lng|lon|longitude|coord|coordinate|point|points|route|routes|walk|history|coverage|profile|active|storage|asyncstorage|raw|json|location)/i;

function trimText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function sanitizeStack(stack?: string) {
  if (!stack) {
    return undefined;
  }

  return trimText(stack.split("\n").slice(0, MAX_STACK_LINES).join("\n"), MAX_STACK_LENGTH);
}

function createReportId(timestamp: number) {
  return `local-${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return undefined;
  }

  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (Object.keys(sanitized).length >= MAX_METADATA_ENTRIES) {
      break;
    }

    if (PRIVATE_METADATA_KEY_PATTERN.test(key)) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      sanitized[key] = typeof value === "string" ? trimText(value, 160) : value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function sanitizeErrorReport(
  report: AppErrorReport,
): SanitizedErrorPayload {
  const timestamp = report.timestamp ?? Date.now();
  const rawLength =
    typeof report.rawLength === "number"
      ? report.rawLength
      : typeof report.raw === "string"
        ? report.raw.length
        : undefined;

  return {
    id: createReportId(timestamp),
    timestamp,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version,
    source: report.source,
    severity: report.severity ?? "error",
    message: trimText(report.message, MAX_MESSAGE_LENGTH),
    screen: report.screen,
    operation: report.operation,
    storageKey: report.storageKey,
    rawLength,
    stack: sanitizeStack(report.stack),
    table: report.table,
    itemId: report.itemId,
    metadata: sanitizeMetadata(report.metadata),
  };
}

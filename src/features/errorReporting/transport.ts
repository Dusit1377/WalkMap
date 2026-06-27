import type { SanitizedErrorPayload } from "@/features/errorReporting/types";
import {
  ERROR_REPORTING_ENABLED,
  ERROR_REPORTING_ENDPOINT,
  ERROR_REPORTING_TIMEOUT_MS,
} from "@/features/errorReporting/config";
import { appendLocalErrorReport } from "@/features/errorReporting/localQueue";

export type SendErrorReportResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "disabled"
        | "missing-endpoint"
        | "invalid-endpoint"
        | "timeout"
        | "network-error"
        | "server-error";
      status?: number;
    };

type SendErrorReportFailureReason = Exclude<
  SendErrorReportResult,
  { ok: true }
>["reason"];

type ErrorReportTransportPayload = Pick<
  SanitizedErrorPayload,
  | "timestamp"
  | "source"
  | "severity"
  | "message"
  | "stack"
  | "platform"
  | "appVersion"
  | "buildVersion"
  | "storageKey"
  | "rawLength"
  | "operation"
>;

function buildTransportPayload(
  report: SanitizedErrorPayload,
): ErrorReportTransportPayload {
  return {
    timestamp: report.timestamp,
    source: report.source,
    severity: report.severity,
    message: report.message,
    stack: report.stack,
    platform: report.platform,
    appVersion: report.appVersion,
    buildVersion: report.buildVersion,
    storageKey: report.storageKey,
    rawLength: report.rawLength,
    operation: report.operation,
  };
}

function getEndpoint() {
  return ERROR_REPORTING_ENDPOINT.trim();
}

function isSafeEndpoint(endpoint: string) {
  return endpoint.startsWith("https://");
}

async function recordTransportFailure(
  reason: SendErrorReportFailureReason,
  status?: number,
) {
  await appendLocalErrorReport({
    source: "app",
    severity: "warning",
    message: status
      ? `Error report transport failed: ${reason} (${status})`
      : `Error report transport failed: ${reason}`,
    operation: "error-report-transport",
  });
}

// Telegram bot token must never be stored in the mobile app.
// External reporting must only send sanitized reports.
// Location tracks, exact coordinates, history payloads and raw storage values are forbidden.
export async function sendSanitizedErrorReport(
  report: SanitizedErrorPayload,
): Promise<SendErrorReportResult> {
  if (!ERROR_REPORTING_ENABLED) {
    return {
      ok: false,
      reason: "disabled",
    };
  }

  const endpoint = getEndpoint();

  if (!endpoint) {
    return {
      ok: false,
      reason: "missing-endpoint",
    };
  }

  if (!isSafeEndpoint(endpoint)) {
    await recordTransportFailure("invalid-endpoint");
    return {
      ok: false,
      reason: "invalid-endpoint",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ERROR_REPORTING_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTransportPayload(report)),
      signal: controller.signal,
    });

    if (!response.ok) {
      await recordTransportFailure("server-error", response.status);
      return {
        ok: false,
        reason: "server-error",
        status: response.status,
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "network-error";
    await recordTransportFailure(reason);
    return {
      ok: false,
      reason,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendErrorReport(
  report: SanitizedErrorPayload,
): Promise<SendErrorReportResult> {
  return sendSanitizedErrorReport(report);
}

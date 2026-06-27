import type { SanitizedErrorPayload } from "@/features/errorReporting/types";

export type SendErrorReportResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: "disabled";
    };

// External auto-reporting is disabled until a safe server endpoint exists. Do not put Telegram bot tokens or secrets inside the mobile app.
export async function sendErrorReport(
  _report: SanitizedErrorPayload,
): Promise<SendErrorReportResult> {
  return {
    ok: false,
    reason: "disabled",
  };
}

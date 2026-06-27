export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

export type ErrorSource = "app" | "storage" | "sqlite" | "unknown";

export type AppErrorReport = {
  source: ErrorSource;
  severity?: ErrorSeverity;
  message: string;
  timestamp?: number;
  screen?: string;
  operation?: string;
  storageKey?: string;
  raw?: string | null;
  rawLength?: number;
  stack?: string;
  table?: string;
  itemId?: string;
  metadata?: Record<string, unknown>;
};

export type SanitizedErrorPayload = {
  id: string;
  timestamp: number;
  platform: string;
  appVersion?: string;
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  screen?: string;
  operation?: string;
  storageKey?: string;
  rawLength?: number;
  stack?: string;
  table?: string;
  itemId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

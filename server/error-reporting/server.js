const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_ON_ADMIN = 100;
const DATA_DIR = path.join(__dirname, "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.jsonl");

const ALLOWED_FIELDS = new Set([
  "timestamp",
  "appVersion",
  "buildVersion",
  "platform",
  "source",
  "severity",
  "message",
  "stack",
  "storageKey",
  "rawLength",
  "operation",
  "context",
]);

const FORBIDDEN_FIELDS = new Set([
  "coordinates",
  "latitude",
  "longitude",
  "route",
  "routes",
  "points",
  "track",
  "tracks",
  "history",
  "coverage",
  "activeWalk",
  "profile",
  "raw",
  "rawJson",
  "storageDump",
  "locationPayload",
  "routePayload",
]);

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasForbiddenField(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasForbiddenField);
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (FORBIDDEN_FIELDS.has(key)) {
      return true;
    }

    return hasForbiddenField(nestedValue);
  });
}

function validateString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function sanitizeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return undefined;
  }

  const result = {};

  for (const [key, value] of Object.entries(context)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      return undefined;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = typeof value === "string" ? value.slice(0, 160) : value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function validateAndSanitizeReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, reason: "payload must be an object" };
  }

  for (const key of Object.keys(report)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return { ok: false, reason: `field is not allowed: ${key}` };
    }
  }

  if (hasForbiddenField(report)) {
    return { ok: false, reason: "payload contains forbidden private fields" };
  }

  if (typeof report.timestamp !== "number") {
    return { ok: false, reason: "timestamp is required" };
  }

  if (!validateString(report.source, 40)) {
    return { ok: false, reason: "source is required" };
  }

  if (!validateString(report.severity, 20)) {
    return { ok: false, reason: "severity is required" };
  }

  if (!validateString(report.message, 500)) {
    return { ok: false, reason: "message is required" };
  }

  const sanitized = {
    receivedAt: Date.now(),
    timestamp: report.timestamp,
    source: report.source,
    severity: report.severity,
    message: report.message,
  };

  for (const key of [
    "appVersion",
    "buildVersion",
    "platform",
    "stack",
    "storageKey",
    "operation",
  ]) {
    if (report[key] !== undefined) {
      if (!validateString(report[key], key === "stack" ? 1200 : 160)) {
        return { ok: false, reason: `${key} is invalid` };
      }

      sanitized[key] = report[key];
    }
  }

  if (report.rawLength !== undefined) {
    if (typeof report.rawLength !== "number" || report.rawLength < 0) {
      return { ok: false, reason: "rawLength is invalid" };
    }

    sanitized.rawLength = report.rawLength;
  }

  const context = sanitizeContext(report.context);

  if (context) {
    sanitized.context = context;
  }

  return { ok: true, report: sanitized };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        request.destroy();
        return;
      }

      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function appendReport(report) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(REPORTS_FILE, `${JSON.stringify(report)}\n`, "utf8");
}

function readReports() {
  if (!fs.existsSync(REPORTS_FILE)) {
    return [];
  }

  return fs
    .readFileSync(REPORTS_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .slice(-MAX_REPORTS_ON_ADMIN)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

async function handleReport(request, response) {
  if (request.headers["content-type"] !== "application/json") {
    sendJson(response, 415, { ok: false, error: "content-type must be application/json" });
    return;
  }

  try {
    const rawBody = await readRequestBody(request);
    const parsed = JSON.parse(rawBody);
    const validation = validateAndSanitizeReport(parsed);

    if (!validation.ok) {
      sendJson(response, 400, { ok: false, error: validation.reason });
      return;
    }

    appendReport(validation.report);
    sendJson(response, 202, { ok: true });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : "invalid request",
    });
  }
}

function handleAdmin(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    "";

  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    sendHtml(response, 401, "<!doctype html><h1>Unauthorized</h1>");
    return;
  }

  const reports = readReports();
  const items = reports
    .map(
      (report) => `
        <article>
          <h2>${escapeHtml(report.severity)}: ${escapeHtml(report.message)}</h2>
          <p>${escapeHtml(new Date(report.timestamp).toISOString())}</p>
          <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
        </article>
      `,
    )
    .join("");

  sendHtml(
    response,
    200,
    `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>WalkMap Error Reports</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 24px; line-height: 1.4; }
            article { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 0 0 16px; }
            h1, h2 { margin: 0 0 8px; }
            pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f6f6; padding: 12px; }
          </style>
        </head>
        <body>
          <h1>WalkMap Error Reports</h1>
          ${items || "<p>No reports yet.</p>"}
        </body>
      </html>`,
  );
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/report") {
    void handleReport(request, response);
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/admin")) {
    handleAdmin(request, response);
    return;
  }

  sendJson(response, 404, { ok: false, error: "not found" });
});

server.listen(PORT, () => {
  console.log(`WalkMap error reporting server listening on ${PORT}`);
});

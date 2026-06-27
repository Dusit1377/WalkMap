# WalkMap error reporting server template

This is a minimal no-dependency Node.js template for receiving sanitized WalkMap error reports. It is not imported by the mobile app and does not affect APK builds.

## Run locally

```bash
ADMIN_TOKEN=change-me PORT=8787 node server.js
```

Endpoints:

- `POST /api/report` accepts a sanitized JSON report.
- `GET /admin?token=change-me` shows a simple server-rendered report list.

Required environment variables:

- `ADMIN_TOKEN` protects `/admin`.
- `PORT` is optional and defaults to `8787`.

Do not store Telegram bot tokens or other secrets in the mobile app or this repository. If forwarding to Telegram is ever needed, add it only on a deployed server through environment variables after this endpoint has already validated and stored sanitized reports.

Allowed report fields:

- `timestamp`
- `appVersion`
- `buildVersion`
- `platform`
- `source`
- `severity`
- `message`
- `stack`
- `storageKey`
- `rawLength`
- `operation`
- `context`

Forbidden fields are rejected, including coordinates, routes, points, tracks, history, coverage, active walk, profile, raw payloads, storage dumps, and location payloads.

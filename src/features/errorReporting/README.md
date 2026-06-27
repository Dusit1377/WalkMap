# Error report transport

External error reporting is disabled by default. To enable it later, point `ERROR_REPORTING_ENDPOINT` at a safe server endpoint and set `ERROR_REPORTING_ENABLED` to `true`.

The mobile app must send reports only to a server that you control. Telegram bot token must never be stored in the mobile app. If Telegram or private storage is needed later, the server endpoint can forward sanitized reports after applying its own auth, rate limits, and validation.

External reporting must only send sanitized reports. Location tracks, exact coordinates, history payloads and raw storage values are forbidden.

The transport JSON payload is allowlisted:

```json
{
  "timestamp": 1710000000000,
  "source": "storage",
  "severity": "error",
  "message": "Failed to parse storage value",
  "stack": "short stack trace",
  "platform": "android",
  "appVersion": "1.0.0",
  "buildVersion": "1",
  "storageKey": "walkmap_history",
  "rawLength": 1024,
  "operation": "parse"
}
```

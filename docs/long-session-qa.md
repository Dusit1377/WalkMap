# Long Session QA

This checklist is for manual WalkMap testing after memory and long-session
changes. Do not clear app data between checks unless the test explicitly says so.

## Before Testing

- Install the APK normally from `/sdcard/Download/WalkMap-update.apk`.
- Grant foreground location permission.
- For background tests, grant background location permission and disable battery
  restrictions for WalkMap when the device allows it.
- Keep `LONG_SESSION_PROFILING_ENABLED` disabled for normal testing. Enable it
  only in a local build when collecting internal counters.

## Scenarios

1. 1 hour active walk
   - Start a walk outdoors.
   - Keep the screen open for part of the walk and locked for part of the walk.
   - Finish the walk and verify distance, duration, history item, achievements,
     and opened territory look reasonable.

2. 3 hour active walk
   - Start a walk with background permission granted.
   - Lock the phone for long intervals.
   - Return to the app several times and verify the walk is still active, the
     map remains smooth, and the route does not jump wildly.

3. 10 walks in a row
   - Start and finish 10 normal walks without reinstalling the app.
   - Verify history opens quickly and statistics update after each finish.

4. 100 historical records
   - Use an existing device/profile with many records or seed records in a test
     build only.
   - Open Profile -> History and scroll from top to bottom.
   - Watch for slow first open, blank rows, or visible layout jumps.

5. Close through recent apps
   - Start a walk, then remove the app from recent apps.
   - Wait several minutes, reopen the app, and verify it restores safely.
   - Android may stop background execution; this is acceptable if the app marks
     the state honestly and keeps the saved route/statistics valid.

6. Return after restart
   - Start a walk, force close or restart the app, then open WalkMap again.
   - Verify active walk restoration, duration, distance, and last known position.

7. Weak indoor GPS
   - Start a walk indoors or near windows with weak signal.
   - Verify rejected points do not create huge route jumps.

8. Background permission denied
   - Deny background location permission.
   - Start a walk and verify foreground recording still works.
   - Confirm the UI indicates foreground-only/background permission state.

9. Background permission granted, app in background
   - Start a walk, lock the phone, wait 15-30 minutes, then return.
   - Verify background status, distance continuity, and no impossible jumps.

10. Fast history check
    - Open History after a long walk and after many records.
    - Verify the list remains responsive and renders lazily.

## What To Watch

- Subjective map smoothness and touch responsiveness.
- History opening time and scroll smoothness.
- Active route GeoJSON size in profiling logs when profiling is enabled.
- Coverage GeoJSON size and rebuild time when profiling is enabled.
- Number of full route points versus points sent to the map.
- Correct distance and duration after finish.
- No huge route jumps after background/weak GPS.
- Opened territory remains visually reasonable.
- Active walk restores after restart without losing saved progress.

## Optional Profiling

For a local diagnostic build, temporarily set:

```ts
const LONG_SESSION_PROFILING_ENABLED = true;
const MAP_PERF_LOGGING_ENABLED = true;
```

Turn both flags back off before handing the build to testers.

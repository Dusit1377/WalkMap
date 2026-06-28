import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type StyleSpecification,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import * as TaskManager from "expo-task-manager";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Achievement,
  ActiveWalkData,
  BackgroundTrackingState,
  CoverageRoute,
  LocalProfile,
  MapGeoJsonData,
  WalkHistoryItem,
  WalkPoint,
} from "@/features/walkmap/domain";
import {
  addPointToActiveWalk,
  clearActiveWalkSession,
  finishWalkSession,
  getVisibleWalkPoints,
  markPossibleBackgroundGap,
  pauseWalkSession,
  readActiveWalkSession,
  recordAcceptedWalkPoint,
  recordRejectedWalkPoint,
  restoreWalkSession,
  resumeWalkSession,
  saveActiveWalkSession,
  setActiveWalkBackgroundTrackingState,
  type RestoredWalkSession,
  type WalkSessionRuntimeState,
  startWalkSession,
} from "@/features/walkSession/activeWalk";
import {
  evaluateTrackingPointQuality,
  logRejectedTrackingPoint,
  type TrackingPointSource,
} from "@/features/location/trackingQuality";
import { useAccentTheme } from "@/features/app/accentStore";
import { ACCENT_THEMES } from "@/features/app/theme";
import { appendLocalErrorReport } from "@/features/errorReporting";
import {
  getProgressStats,
} from "@/features/statistics/calculations";
import { getDistanceKm } from "@/features/statistics/distance";
import {
  coverageRepository,
  historyRepository,
  lastLocationRepository,
  openedCellsRepository,
  preferencesRepository,
  profileRepository,
  progressRepository,
} from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  NativeModules,
  View,
} from "react-native";

type AppDialogVariant = "info" | "success" | "warning" | "error" | "danger";

type AppDialogActionVariant = "primary" | "secondary" | "danger" | "copy";

type AppDialogAction = {
  text: string;
  variant?: AppDialogActionVariant;
  closeOnPress?: boolean;
  onPress?: () => void | Promise<void>;
};

type AppDialogData = {
  title: string;
  message: string;
  variant?: AppDialogVariant;
  copyText?: string;
  actions?: AppDialogAction[];
};

const BACKGROUND_LOCATION_TASK = "walkmap_background_location_task";

const DEFAULT_CENTER: [number, number] = [49.6679, 58.6035];
const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "WalkMap",
  sources: {
    carto: {
      type: "raster",
      tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0B1020",
      },
    },
    {
      id: "carto",
      type: "raster",
      source: "carto",
      paint: {
        "raster-opacity": 1,
      },
    },
  ],
};
const UNLOCK_RADIUS_METERS = 48;
const USER_RADIUS_RING_STEPS = 96;
const COVERAGE_ARC_STEP_METERS = 8;
const COVERAGE_SAMPLE_STEP_METERS = 10;
const MAX_COVERAGE_ROUTES_ON_MAP = 350;
const MAX_COVERAGE_SAMPLE_POINTS = 3200;
const ACTIVE_WALK_MEMORY_POINTS_LIMIT = 750;
const ACTIVE_ROUTE_VISIBLE_POINTS_LIMIT = 750;
const LIVE_COVERAGE_PREVIEW_POINTS_LIMIT = 300;
const ACTIVE_WALK_PERSIST_POINT_BATCH = 3;
const ACTIVE_WALK_PERSIST_INTERVAL_MS = 10_000;
const MAP_PERF_LOGGING_ENABLED = false;
const LONG_SESSION_PROFILING_ENABLED = false;
const LONG_SESSION_PROFILING_POINT_BATCH = 100;
const BACKGROUND_GAP_WARNING_MS = 5 * 60 * 1000;
const WEB_MERCATOR_RADIUS_METERS = 6_378_137;
const FOG_OUTER_RING: [number, number][] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];
const EMPTY_FEATURE_COLLECTION: MapGeoJsonData = {
  type: "FeatureCollection",
  features: [],
};

type MapFallbackOperation =
  | "coverage-rings"
  | "fog-geojson"
  | "opened-fill-geojson"
  | "opened-edge-geojson"
  | "user-radius-geojson"
  | "route-geojson"
  | "user-geojson";

function getUnknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function recordMapFallback(operation: MapFallbackOperation, error: unknown) {
  void appendLocalErrorReport({
    source: "app",
    severity: "warning",
    message: `Map fallback used: ${getUnknownErrorMessage(error)}`,
    operation,
  });
}

function isValidMapCoordinate(coordinate: unknown): coordinate is [number, number] {
  return (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    typeof coordinate[0] === "number" &&
    typeof coordinate[1] === "number" &&
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1]) &&
    Math.abs(coordinate[0]) <= 180 &&
    Math.abs(coordinate[1]) <= 90
  );
}

function makeClosedMapRing(coordinates: unknown): [number, number][] | null {
  if (!Array.isArray(coordinates)) {
    return null;
  }

  const ring = coordinates.filter(isValidMapCoordinate);

  if (ring.length < 3) {
    return null;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed =
    first[0] === last[0] && first[1] === last[1]
      ? ring
      : [...ring, first];

  return closed.length >= 4 ? closed : null;
}

function sanitizeGeometry(geometry: any) {
  if (!geometry || typeof geometry.type !== "string") {
    return null;
  }

  if (geometry.type === "Point") {
    return isValidMapCoordinate(geometry.coordinates)
      ? { type: "Point", coordinates: geometry.coordinates }
      : null;
  }

  if (geometry.type === "LineString") {
    if (!Array.isArray(geometry.coordinates)) {
      return null;
    }

    const coordinates = geometry.coordinates.filter(isValidMapCoordinate);
    return coordinates.length >= 2
      ? { type: "LineString", coordinates }
      : null;
  }

  if (geometry.type === "Polygon") {
    if (!Array.isArray(geometry.coordinates)) {
      return null;
    }

    const coordinates = geometry.coordinates
      .map(makeClosedMapRing)
      .filter(Boolean);

    return coordinates.length > 0
      ? { type: "Polygon", coordinates }
      : null;
  }

  return null;
}

function sanitizeMapGeoJson(
  geoJson: MapGeoJsonData,
  operation: MapFallbackOperation,
): MapGeoJsonData {
  try {
    if (!geoJson || geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
      throw new Error("Invalid FeatureCollection");
    }

    const features = geoJson.features
      .map((feature) => {
        const geometry = sanitizeGeometry(feature?.geometry);

        if (!geometry) {
          return null;
        }

        return {
          ...feature,
          type: "Feature",
          properties: feature?.properties ?? {},
          geometry,
        };
      })
      .filter(Boolean);

    if (features.length !== geoJson.features.length) {
      recordMapFallback(operation, new Error("Invalid GeoJSON features dropped"));
    }

    return {
      type: "FeatureCollection",
      features,
    };
  } catch (error) {
    recordMapFallback(operation, error);
    return EMPTY_FEATURE_COLLECTION;
  }
}

function safeBuildMapGeoJson(
  operation: MapFallbackOperation,
  build: () => MapGeoJsonData,
): MapGeoJsonData {
  try {
    return sanitizeMapGeoJson(build(), operation);
  } catch (error) {
    recordMapFallback(operation, error);
    return EMPTY_FEATURE_COLLECTION;
  }
}

const WalkMapClipboard = NativeModules.WalkMapClipboard as
  | { setString?: (text: string) => Promise<void> }
  | undefined;

async function setClipboardText(text: string) {
  if (!WalkMapClipboard?.setString) {
    throw new Error(
      "WalkMapClipboard native module is not available. Rebuild the Android app after adding the native clipboard files.",
    );
  }

  await WalkMapClipboard.setString(text);
}

function getRouteCacheEdge(points: WalkPoint[]) {
  if (points.length === 0) {
    return "empty";
  }

  const first = points[0];
  const last = points[points.length - 1];
  return [
    points.length,
    first.timestamp,
    last.timestamp,
    last.latitude.toFixed(5),
    last.longitude.toFixed(5),
  ].join(":");
}

function getCoverageCacheKey(routes: CoverageRoute[], routePoints: WalkPoint[]) {
  const routeMarker = routes
    .slice(0, MAX_COVERAGE_ROUTES_ON_MAP)
    .map((route) => getRouteCacheEdge(route.points))
    .join("|");

  return `${routeMarker}::active:${getRouteCacheEdge(routePoints)}`;
}

function logMapPerf(message: string, data: Record<string, number | string>) {
  if (!MAP_PERF_LOGGING_ENABLED) {
    return;
  }

  console.log(`[map-perf] ${message}`, data);
}

function logLongSessionPerf(
  message: string,
  data: Record<string, number | string | boolean | null>,
) {
  if (!LONG_SESSION_PROFILING_ENABLED) {
    return;
  }

  console.log(`[long-session] ${message}`, data);
}

function getGeoJsonFeatureCount(geoJson: MapGeoJsonData) {
  return geoJson.features.length;
}

function getGeoJsonApproxSize(geoJson: MapGeoJsonData) {
  if (!LONG_SESSION_PROFILING_ENABLED) {
    return 0;
  }

  return JSON.stringify(geoJson).length;
}

function getBackgroundTrackingLabel(state: BackgroundTrackingState) {
  if (state === "active") return "Активна";
  if (state === "permissionDenied") return "Только при открытом";
  if (state === "starting") return "Старт";
  if (state === "stoppedBySystem") return "Остановлена системой";
  if (state === "error") return "Ошибка";
  if (state === "inactive") return "Неактивна";
  return "Неизвестно";
}

function normalizeNickname(nickname: string) {
  const cleanNickname = nickname.trim().slice(0, 220);
  return cleanNickname.length > 0 ? cleanNickname : "Гость";
}

function createLocalProfile(nickname: string): LocalProfile {
  return {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    nickname: normalizeNickname(nickname),
    createdAt: Date.now(),
  };
}

function getTrackingCandidateFromLocation(location: Location.LocationObject) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
  };
}

async function readLocalProfile() {
  return profileRepository.readProfile(normalizeNickname);
}

async function writeLocalProfile(profile: LocalProfile) {
  await profileRepository.writeProfile(profile);
}

async function hasLegacyLocalProgress() {
  return profileRepository.hasLegacyLocalProgress();
}

async function readLegacyProfileNickname() {
  return profileRepository.readLegacyProfileNickname(normalizeNickname);
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logRejectedTrackingPoint({
      reason: "background_task_error",
      source: "background",
      operation: "background-location-task",
    });
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] })
    ?.locations;

  if (!Array.isArray(locations) || locations.length === 0) {
    return;
  }

  try {
    const activeWalk = await readActiveWalkSession();

    if (!activeWalk) {
      return;
    }

    locations.forEach((location) => {
      const quality = evaluateTrackingPointQuality({
        candidate: getTrackingCandidateFromLocation(location),
        previousPoint: activeWalk.points[activeWalk.points.length - 1] ?? null,
      });

      if (!quality.accepted) {
        recordRejectedWalkPoint({
          activeWalk,
          source: "background",
          reason: quality.reason,
        });
        logRejectedTrackingPoint({
          ...quality,
          source: "background",
          operation: "background-location-point",
        });
        return;
      }

      addPointToActiveWalk(activeWalk, quality.point);
      recordAcceptedWalkPoint({
        activeWalk,
        source: "background",
        point: quality.point,
        ageMs: quality.ageMs,
      });
    });

    setActiveWalkBackgroundTrackingState(activeWalk, "active");
    await saveActiveWalkSession(activeWalk);
  } catch {
    logRejectedTrackingPoint({
      reason: "background_task_error",
      source: "background",
      operation: "background-location-save",
    });
    // Фоновая задача не должна ломать приложение из-за одной неудачной записи.
  }
});

export default function Index() {
  const router = useRouter();
  const [isWalking, setIsWalking] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);

  const [, setOpenedCells] = useState<string[]>([]);
  const [, setCurrentWalkCells] = useState<string[]>([]);
  const [points, setPoints] = useState<WalkPoint[]>([]);
  const [coverageRoutes, setCoverageRoutes] = useState<CoverageRoute[]>([]);
  const [history, setHistory] = useState<WalkHistoryItem[]>([]);
  const [currentLocation, setCurrentLocation] = useState<WalkPoint | null>(
    null,
  );
  const [mapCenter, setMapCenter] = useState<WalkPoint | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [finishConfirmVisible, setFinishConfirmVisible] = useState(false);
  const [finishConfirmMode, setFinishConfirmMode] = useState<"normal" | "short">(
    "normal",
  );
  const [backgroundRecordingEnabled, setBackgroundRecordingEnabled] =
    useState(false);
  const [backgroundTrackingState, setBackgroundTrackingState] =
    useState<BackgroundTrackingState>("unknown");
  const [appDialog, setAppDialog] = useState<AppDialogData | null>(null);
  const [appDialogCopied, setAppDialogCopied] = useState(false);
  const [lastResult, setLastResult] = useState<WalkHistoryItem | null>(null);

  const [localProfile, setLocalProfile] = useState<LocalProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameBusy, setNicknameBusy] = useState(false);
  const { accentTheme, setAccentTheme } = useAccentTheme();

  const cameraRef = useRef<CameraRef | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );
  const activeWalkRef = useRef<ActiveWalkData | null>(null);
  const lastAcceptedPointRef = useRef<WalkPoint | null>(null);
  const pendingAcceptedPointsRef = useRef(0);
  const lastActiveWalkPersistedAtRef = useRef(0);
  const walkSessionStateRef = useRef<WalkSessionRuntimeState>({
    status: "idle",
    pausedAt: null,
  });
  const distanceKmRef = useRef(0);
  const coverageGeometryCacheRef = useRef<{
    key: string;
    rings: [number, number][][];
  } | null>(null);
  const backgroundTrackingStateRef =
    useRef<BackgroundTrackingState>("unknown");
  const userNickname = localProfile?.nickname ?? "Гость";
  const userProfileLabel = "Локальный профиль";
  const userInitial = userNickname.slice(0, 1).toUpperCase();

  useEffect(() => {
    void initializeSQLiteStorage();
  }, []);

  async function refreshLocalProfileFromStorage() {
    const savedProfile = await readLocalProfile();
    setLocalProfile(savedProfile);
    setNicknameDraft(savedProfile?.nickname ?? "");
    setProfileReady(true);
  }

  useFocusEffect(
    useCallback(() => {
      void loadData();
      void refreshBackgroundRecordingStatus();
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (profileReady) {
        void refreshLocalProfileFromStorage();
      }
    }, [profileReady]),
  );

  async function routePermissionOnboarding() {
    if (!profileReady || !localProfile) {
      return;
    }

    const [foregroundPermission, backgroundPermission] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);

    if (
      foregroundPermission.status !== "granted" ||
      backgroundPermission.status !== "granted"
    ) {
      router.replace("/permissions/location");
      return;
    }

    const batteryInstructionAcknowledged =
      await preferencesRepository.readBatteryInstructionAcknowledged();

    if (!batteryInstructionAcknowledged) {
      router.replace("/permissions/battery");
    }
  }

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const savedProfile = await readLocalProfile();

        if (!isMounted) {
          return;
        }

        if (savedProfile) {
          setLocalProfile(savedProfile);
          setNicknameDraft(savedProfile.nickname);
          return;
        }

        if (await hasLegacyLocalProgress()) {
          const migratedProfile = createLocalProfile(
            await readLegacyProfileNickname(),
          );
          await writeLocalProfile(migratedProfile);

          if (!isMounted) {
            return;
          }

          setLocalProfile(migratedProfile);
          setNicknameDraft(migratedProfile.nickname);
          return;
        }

        setLocalProfile(null);
        setNicknameDraft("");
      } finally {
        if (isMounted) {
          setProfileReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profileReady || !localProfile) {
      return;
    }

    loadData();
    getInitialLocation();
    routePermissionOnboarding();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncActiveWalkFromStorage();
        refreshBackgroundRecordingStatus();
        routePermissionOnboarding();
      }
    });

    refreshBackgroundRecordingStatus();

    return () => {
      appStateSubscription.remove();

      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [profileReady, localProfile?.id]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    if (isWalking && startedAt) {
      timer = setInterval(() => {
        setDurationSec(Math.floor((Date.now() - startedAt) / 1000));
      }, 1500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isWalking, startedAt]);

  function showAppDialog(dialog: AppDialogData) {
    setAppDialogCopied(false);
    setAppDialog({
      variant: "info",
      ...dialog,
    });
  }

  async function copyAppDialogText() {
    if (!appDialog) return;

    const textToCopy =
      appDialog.copyText || `${appDialog.title}\n${appDialog.message}`;

    try {
      await setClipboardText(textToCopy);
      setAppDialogCopied(true);
    } catch {
      setAppDialogCopied(false);
      showAppDialog({
        title: "Не удалось скопировать",
        message:
          "Модуль копирования ещё не подключён. Добавь native-файлы из архива и пересобери приложение.",
        variant: "error",
        copyText: textToCopy,
      });
    }
  }

  function getDialogIcon(variant?: AppDialogVariant) {
    if (variant === "success") return "✓";
    if (variant === "warning") return "!";
    if (variant === "error") return "!";
    if (variant === "danger") return "×";
    return "i";
  }

  function getDialogActions(dialog: AppDialogData | null): AppDialogAction[] {
    if (!dialog) return [];

    if (dialog.actions && dialog.actions.length > 0) {
      return dialog.actions;
    }

    if (dialog.variant === "error") {
      return [
        { text: "Закрыть", variant: "secondary" },
        { text: "Скопировать", variant: "copy", closeOnPress: false },
      ];
    }

    return [{ text: "Закрыть", variant: "primary" }];
  }

  async function handleAppDialogAction(action: AppDialogAction) {
    if (action.variant === "copy") {
      await copyAppDialogText();
      return;
    }

    if (action.closeOnPress !== false) {
      setAppDialog(null);
      setAppDialogCopied(false);
    }

    await action.onPress?.();
  }

  function handleNicknameDraftChange(value: string) {
    setNicknameDraft(value.slice(0, 220));
  }

  async function handleCreateLocalProfile() {
    setNicknameBusy(true);

    try {
      const profile = createLocalProfile(nicknameDraft);
      await writeLocalProfile(profile);
      setLocalProfile(profile);
      setNicknameDraft(profile.nickname);
    } catch {
      showAppDialog({
        title: "Не удалось сохранить профиль",
        message: "Проверь память устройства и попробуй снова.",
        variant: "error",
      });
    } finally {
      setNicknameBusy(false);
    }
  }

  async function handleSaveNickname() {
    if (!localProfile) {
      await handleCreateLocalProfile();
      return;
    }

    const nextProfile = {
      ...localProfile,
      nickname: normalizeNickname(nicknameDraft),
    };

    setNicknameBusy(true);

    try {
      await writeLocalProfile(nextProfile);
      setLocalProfile(nextProfile);
      setNicknameDraft(nextProfile.nickname);
      showAppDialog({
        title: "Ник изменён",
        message: "Прогресс, история и открытая территория остались на месте.",
        variant: "success",
      });
    } catch {
      showAppDialog({
        title: "Не удалось сохранить ник",
        message: "Проверь память устройства и попробуй снова.",
        variant: "error",
      });
    } finally {
      setNicknameBusy(false);
    }
  }

  async function loadData() {
    try {
      const [savedCells, savedHistory, savedCoverageRoutes] =
        await Promise.all([
          openedCellsRepository.readOpenedCells(),
          historyRepository.readHistory(),
          coverageRepository.readCoverageRoutes(),
        ]);

      if (Array.isArray(savedCells)) {
        setOpenedCells(
          savedCells.filter((cellId) => typeof cellId === "string"),
        );
      }

      if (Array.isArray(savedHistory)) {
        setHistory(savedHistory as WalkHistoryItem[]);
      }

      if (Array.isArray(savedCoverageRoutes)) {
        const cleanRoutes = savedCoverageRoutes
          .filter(
            (route) =>
              route &&
              typeof route.id === "string" &&
              Array.isArray(route.points),
          )
          .map((route) => ({
            id: route.id,
            points: route.points.filter(isValidWalkPoint),
          }))
          .filter((route) => route.points.length > 0);

        setCoverageRoutes(cleanRoutes);
      }

      await restoreActiveWalk();
    } catch {
      showAppDialog({
        title: "Не получилось загрузить данные",
        message: "Приложение продолжит работу. Открой профиль или настройки ещё раз позже.",
        variant: "error",
      });
    }
  }

  async function getInitialLocation() {
    let startupPoint: WalkPoint | null = null;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status === "granted") {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const point: WalkPoint = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp || Date.now(),
        };

        await saveLastLocation(point);
        setCurrentLocation(point);
        startupPoint = point;
      }
    } catch {
      startupPoint = null;
    }

    if (!startupPoint) {
      startupPoint = await readLastLocation();
    }

    if (!startupPoint) {
      startupPoint = getDefaultCenterPoint();
    }

    setMapCenter(startupPoint);

    setTimeout(() => {
      moveMapTo(startupPoint);
    }, 700);
  }

  async function readLastLocation() {
    return lastLocationRepository.readLastLocation();
  }

  async function saveLastLocation(point: WalkPoint) {
    await lastLocationRepository.writeLastLocation(point);
  }

  function getDefaultCenterPoint(): WalkPoint {
    return {
      latitude: DEFAULT_CENTER[1],
      longitude: DEFAULT_CENTER[0],
      timestamp: Date.now(),
    };
  }

  function moveMapTo(point: WalkPoint) {
    cameraRef.current?.easeTo({
      center: [point.longitude, point.latitude],
      duration: 700,
    });

    cameraRef.current?.zoomTo(15, {
      duration: 700,
    });
  }

  async function saveCells(_cells: string[]) {
    // Radius-only mode does not add new grid cells, but legacy cells are kept
    // so updates do not wipe old guest-mode progress.
  }

  async function saveHistory(nextHistory: WalkHistoryItem[]) {
    await historyRepository.writeHistory(nextHistory);
  }

  async function saveCoverageRoutes(nextCoverageRoutes: CoverageRoute[]) {
    await coverageRepository.writeCoverageRoutes(nextCoverageRoutes);
  }

  function isValidWalkPoint(point: any): point is WalkPoint {
    return (
      point &&
      typeof point.latitude === "number" &&
      typeof point.longitude === "number" &&
      typeof point.timestamp === "number" &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude)
    );
  }

  function thinCoveragePoints(routePoints: WalkPoint[]) {
    const cleanPoints = routePoints.filter(isValidWalkPoint);

    if (cleanPoints.length <= 2) {
      return cleanPoints;
    }

    const thinned: WalkPoint[] = [cleanPoints[0]];

    cleanPoints.slice(1, -1).forEach((point) => {
      const lastSavedPoint = thinned[thinned.length - 1];
      const distanceFromLast = getDistanceKm(lastSavedPoint, point);

      if (distanceFromLast >= 0.012) {
        thinned.push(point);
      }
    });

    const lastPoint = cleanPoints[cleanPoints.length - 1];
    const previousPoint = thinned[thinned.length - 1];

    if (previousPoint.timestamp !== lastPoint.timestamp) {
      thinned.push(lastPoint);
    }

    return thinned;
  }

  function applyRestoredWalkSession(
    restoredSession: RestoredWalkSession,
    shouldMarkWalking: boolean,
  ) {
    if (shouldMarkWalking) {
      setIsWalking(true);
    }

    setStartedAt(restoredSession.startedAt);
    setDurationSec(restoredSession.durationSec);
    setDistanceKm(restoredSession.distanceKm);
    setPoints(
      getVisibleWalkPoints(
        restoredSession.points,
        ACTIVE_WALK_MEMORY_POINTS_LIMIT,
      ),
    );
    setCurrentWalkCells(restoredSession.currentWalkCells);
    activeWalkRef.current = {
      startedAt: restoredSession.startedAt,
      points: restoredSession.points,
      currentWalkCells: restoredSession.currentWalkCells,
      distanceKm: restoredSession.distanceKm,
      diagnostics: restoredSession.diagnostics,
    };
    lastAcceptedPointRef.current = restoredSession.lastPoint;
    walkSessionStateRef.current = {
      status: restoredSession.status,
      pausedAt: null,
    };
    distanceKmRef.current = restoredSession.distanceKm;
    markPossibleBackgroundGap(
      activeWalkRef.current,
      Date.now(),
      BACKGROUND_GAP_WARNING_MS,
    );
    updateBackgroundTrackingState(
      activeWalkRef.current?.diagnostics?.possibleBackgroundGap
        ? "stoppedBySystem"
        : activeWalkRef.current?.diagnostics?.backgroundTrackingState ??
            "unknown",
    );

    if (restoredSession.lastPoint) {
      setCurrentLocation(restoredSession.lastPoint);
    }

    logLongSessionPerf("restore-active-walk", {
      fullPoints: restoredSession.points.length,
      memoryPoints: Math.min(
        restoredSession.points.length,
        ACTIVE_WALK_MEMORY_POINTS_LIMIT,
      ),
      distanceKm: restoredSession.distanceKm,
      possibleBackgroundGap:
        activeWalkRef.current?.diagnostics?.possibleBackgroundGap ?? false,
    });
  }

  async function persistActiveWalkIfNeeded(force = false) {
    const activeWalk = activeWalkRef.current;

    if (!activeWalk) {
      return;
    }

    const now = Date.now();

    if (
      !force &&
      pendingAcceptedPointsRef.current < ACTIVE_WALK_PERSIST_POINT_BATCH &&
      now - lastActiveWalkPersistedAtRef.current < ACTIVE_WALK_PERSIST_INTERVAL_MS
    ) {
      return;
    }

    pendingAcceptedPointsRef.current = 0;
    lastActiveWalkPersistedAtRef.current = now;
    await saveActiveWalkSession(activeWalk);
  }

  function updateBackgroundTrackingState(
    nextState: BackgroundTrackingState,
    shouldPersist = false,
  ) {
    backgroundTrackingStateRef.current = nextState;
    setBackgroundTrackingState(nextState);
    setActiveWalkBackgroundTrackingState(activeWalkRef.current, nextState);

    if (shouldPersist) {
      void persistActiveWalkIfNeeded(true).catch(() => {});
    }
  }

  function applyAcceptedTrackingPoint(
    point: WalkPoint,
    source: TrackingPointSource,
    ageMs?: number,
  ) {
    const activeWalk = activeWalkRef.current;

    if (!activeWalk || walkSessionStateRef.current.status === "paused") {
      return;
    }

    addPointToActiveWalk(activeWalk, point);
    recordAcceptedWalkPoint({
      activeWalk,
      source,
      point,
      ageMs,
    });
    const nextVisiblePoints = getVisibleWalkPoints(
      activeWalk.points,
      ACTIVE_WALK_MEMORY_POINTS_LIMIT,
    );

    lastAcceptedPointRef.current =
      activeWalk.points[activeWalk.points.length - 1] ?? point;
    distanceKmRef.current = activeWalk.distanceKm;
    pendingAcceptedPointsRef.current += 1;
    setPoints(nextVisiblePoints);
    setDistanceKm(activeWalk.distanceKm);
    setCurrentWalkCells(activeWalk.currentWalkCells ?? []);
    setCurrentLocation(point);
    void saveLastLocation(point).catch(() => {});
    void persistActiveWalkIfNeeded().catch(() => {});

    if (
      activeWalk.diagnostics &&
      activeWalk.diagnostics.pointsAccepted % LONG_SESSION_PROFILING_POINT_BATCH ===
        0
    ) {
      logLongSessionPerf("accepted-point-batch", {
        fullPoints: activeWalk.points.length,
        memoryPoints: nextVisiblePoints.length,
        pointsAccepted: activeWalk.diagnostics.pointsAccepted,
        pointsRejected: activeWalk.diagnostics.pointsRejected,
        pointsDelayed: activeWalk.diagnostics.pointsDelayed,
      });
    }
  }

  function handleLocationRejected(
    result: Exclude<
      ReturnType<typeof evaluateTrackingPointQuality>,
      { accepted: true }
    >,
    source: TrackingPointSource,
    operation: string,
  ) {
    if (activeWalkRef.current) {
      recordRejectedWalkPoint({
        activeWalk: activeWalkRef.current,
        source,
        reason: result.reason,
      });
    }

    logRejectedTrackingPoint({
      ...result,
      source,
      operation,
    });
  }

  function handleForegroundLocation(location: Location.LocationObject) {
    const quality = evaluateTrackingPointQuality({
      candidate: getTrackingCandidateFromLocation(location),
      previousPoint: lastAcceptedPointRef.current,
    });

    if (!quality.accepted) {
      handleLocationRejected(quality, "foreground", "foreground-location-point");
      return;
    }

    applyAcceptedTrackingPoint(quality.point, "foreground", quality.ageMs);
  }

  async function startForegroundLiveTracking() {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 8,
        timeInterval: 2500,
      },
      handleForegroundLocation,
    );
  }

  async function pauseCurrentWalkSession() {
    walkSessionStateRef.current = pauseWalkSession(walkSessionStateRef.current);
    await persistActiveWalkIfNeeded(true);
  }

  function resumeCurrentWalkSession() {
    walkSessionStateRef.current = resumeWalkSession(walkSessionStateRef.current);
  }

  async function restoreActiveWalk() {
    const restoredSession = restoreWalkSession(
      await readActiveWalkSession(),
      Date.now(),
    );

    if (!restoredSession) {
      return;
    }

    applyRestoredWalkSession(restoredSession, true);

    if (restoredSession.lastPoint) {
      setTimeout(() => {
        moveMapTo(restoredSession.lastPoint!);
      }, 700);
    }
  }

  async function syncActiveWalkFromStorage() {
    const restoredSession = restoreWalkSession(
      await readActiveWalkSession(),
      Date.now(),
    );

    if (!restoredSession) {
      return;
    }

    applyRestoredWalkSession(restoredSession, false);
  }

  async function stopBackgroundLocation() {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
    );

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    setBackgroundRecordingEnabled(false);
    updateBackgroundTrackingState("inactive");
  }

  async function refreshBackgroundRecordingStatus() {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
      );

      setBackgroundRecordingEnabled(hasStarted);
      updateBackgroundTrackingState(hasStarted ? "active" : "inactive");
    } catch {
      setBackgroundRecordingEnabled(false);
      updateBackgroundTrackingState("unknown");
    }
  }

  function showBatteryHelp() {
    showAppDialog({
      title: "Фоновая запись",
      message:
        "Чтобы WalkMap стабильнее записывал прогулку с заблокированным экраном, разреши геолокацию в фоне и отключи ограничение батареи для приложения в настройках Android.",
      variant: "info",
      actions: [
        { text: "Позже", variant: "secondary" },
        {
          text: "Открыть настройки",
          variant: "primary",
          onPress: () => {
            Linking.openSettings();
          },
        },
      ],
    });
  }

  async function startWalk() {
    const foregroundPermission = await Location.requestForegroundPermissionsAsync();

    if (foregroundPermission.status !== "granted") {
      logRejectedTrackingPoint({
        reason: "foreground_permission_denied",
        source: "foreground",
        operation: "start-walk-permission",
      });
      showAppDialog({
        title: "Нет доступа",
        message: "Разреши доступ к геолокации, чтобы WalkMap мог записывать прогулку.",
        variant: "warning",
      });
      return;
    }

    const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
    const canRecordInBackground = backgroundPermission.status === "granted";

    if (backgroundPermission.status !== "granted") {
      logRejectedTrackingPoint({
        reason: "background_permission_denied",
        source: "background",
        operation: "start-walk-permission",
      });
      showAppDialog({
        title: "Нужна геолокация в фоне",
        message:
          "Чтобы WalkMap записывал прогулку с заблокированным экраном, разреши доступ к геолокации в фоне.",
        variant: "warning",
        actions: [
          { text: "Закрыть", variant: "secondary" },
          {
            text: "Настройки",
            variant: "primary",
            onPress: () => {
              Linking.openSettings();
            },
          },
        ],
      });
    }

    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    await stopBackgroundLocation();

    setIsWalking(true);
    const walkStartedAt = Date.now();
    setStartedAt(walkStartedAt);
    setDurationSec(0);
    setDistanceKm(0);
    setPoints([]);
    setCurrentWalkCells([]);
    distanceKmRef.current = 0;
    activeWalkRef.current = null;
    lastAcceptedPointRef.current = null;
    pendingAcceptedPointsRef.current = 0;
    lastActiveWalkPersistedAtRef.current = 0;
    setBackgroundTrackingState("starting");
    backgroundTrackingStateRef.current = "starting";
    walkSessionStateRef.current = {
      status: "active",
      pausedAt: null,
    };

    const firstLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const firstPointQuality = evaluateTrackingPointQuality({
      candidate: getTrackingCandidateFromLocation(firstLocation),
      previousPoint: null,
    });

    if (!firstPointQuality.accepted) {
      handleLocationRejected(
        firstPointQuality,
        "foreground",
        "start-walk-first-location",
      );
      setIsWalking(false);
      setStartedAt(null);
      setPoints([]);
      setBackgroundRecordingEnabled(false);
      updateBackgroundTrackingState("inactive");
      activeWalkRef.current = null;
      lastAcceptedPointRef.current = null;
      walkSessionStateRef.current = {
        status: "idle",
        pausedAt: null,
      };
      await clearActiveWalkSession();
      showAppDialog({
        title: "РќРµС‚ С‚РѕС‡РЅРѕР№ РїРѕР·РёС†РёРё",
        message:
          "GPS-С‚РѕС‡РєР° СЃРµР№С‡Р°СЃ РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РєР°С‡РµСЃС‚РІРµРЅРЅР°СЏ. РџРѕРїСЂРѕР±СѓР№ РЅР° СѓР»РёС†Рµ РёР»Рё РїРѕРґРѕР¶РґРё РЅРµСЃРєРѕР»СЊРєРѕ СЃРµРєСѓРЅРґ.",
        variant: "warning",
      });
      return;
    }

    const firstPoint = firstPointQuality.point;

    const startedSession = startWalkSession(walkStartedAt, firstPoint);

    activeWalkRef.current = startedSession.activeWalk;
    setActiveWalkBackgroundTrackingState(
      activeWalkRef.current,
      canRecordInBackground ? "starting" : "permissionDenied",
    );
    lastAcceptedPointRef.current = firstPoint;
    await saveActiveWalkSession(startedSession.activeWalk);
    lastActiveWalkPersistedAtRef.current = Date.now();

    setPoints(startedSession.points);
    setCurrentWalkCells(startedSession.currentWalkCells);
    setCurrentLocation(firstPoint);
    await saveLastLocation(firstPoint);
    moveMapTo(firstPoint);
    try {
      await startForegroundLiveTracking();
    } catch {
      logRejectedTrackingPoint({
        reason: "watch_position_error",
        source: "foreground",
        operation: "start-foreground-watch",
      });
      setIsWalking(false);
      setStartedAt(null);
      activeWalkRef.current = null;
      lastAcceptedPointRef.current = null;
      pendingAcceptedPointsRef.current = 0;
      setPoints([]);
      walkSessionStateRef.current = {
        status: "idle",
        pausedAt: null,
      };
      await clearActiveWalkSession();
      showAppDialog({
        title: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РїСѓСЃС‚РёС‚СЊ GPS",
        message:
          "WalkMap РЅРµ СЃРјРѕРі Р·Р°РїСѓСЃС‚РёС‚СЊ Р¶РёРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ РїРѕР·РёС†РёРё. РџСЂРѕРІРµСЂСЊ РґРѕСЃС‚СѓРї Рє РіРµРѕР»РѕРєР°С†РёРё Рё РїРѕРїСЂРѕР±СѓР№ СЃРЅРѕРІР°.",
        variant: "error",
      });
      return;
    }

    if (canRecordInBackground) {
      try {
        updateBackgroundTrackingState("starting", true);
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
      timeInterval: 3000,
      foregroundService: {
        notificationTitle: "WalkMap записывает прогулку",
        notificationBody: "Можно заблокировать телефон — маршрут продолжит сохраняться.",
        notificationColor: "#35E6B7",
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

        setBackgroundRecordingEnabled(true);
        updateBackgroundTrackingState("active", true);
      } catch {
        logRejectedTrackingPoint({
          reason: "background_task_error",
          source: "background",
          operation: "start-background-updates",
        });
        setBackgroundRecordingEnabled(false);
        updateBackgroundTrackingState("error", true);
      }
    } else {
      setBackgroundRecordingEnabled(false);
      updateBackgroundTrackingState("permissionDenied", true);
    }

    showAppDialog({
      title: "Прогулка началась",
      message:
        "Телефон можно заблокировать. Если запись будет прерываться, открой настройки приложения и отключи ограничение батареи для WalkMap.",
      variant: "success",
      actions: [
        { text: "Ок", variant: "secondary" },
        {
          text: "Настройки",
          variant: "primary",
          onPress: () => {
            Linking.openSettings();
          },
        },
      ],
    });
  }

  function askFinishWalk() {
    const safeDuration = startedAt
      ? Math.floor((Date.now() - startedAt) / 1000)
      : durationSec;

    if (safeDuration < 20 && distanceKmRef.current < 0.02) {
      setFinishConfirmMode("short");
      setFinishConfirmVisible(true);
      return;
    }

    setFinishConfirmMode("normal");
    setFinishConfirmVisible(true);
  }

  function confirmFinishWalk() {
    setFinishConfirmVisible(false);
    finishWalk();
  }

  async function finishWalk() {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    await pauseCurrentWalkSession();
    const activeWalk = activeWalkRef.current ?? (await readActiveWalkSession());

    await stopBackgroundLocation();
    await clearActiveWalkSession();

    const finishedSession = finishWalkSession({
      activeWalk,
      fallbackStartedAt: startedAt,
      fallbackDurationSec: durationSec,
      fallbackPoints: points,
      fallbackDistanceKm: distanceKmRef.current,
      history,
      coverageRoutes,
      now: Date.now(),
      localeDate: new Date().toLocaleString("ru-RU"),
      getUnlockedAchievementIds: (previousStats, nextStats) =>
        getNewAchievements(previousStats, nextStats).map(
          (achievement) => achievement.id,
        ),
      thinCoveragePoints,
    });

    setOpenedCells([]);
    setCoverageRoutes(finishedSession.nextCoverageRoutes);
    setHistory(finishedSession.nextHistory);
    setLastResult(finishedSession.walkItem);
    setResultModalVisible(true);
    setDurationSec(finishedSession.durationSec);
    setDistanceKm(finishedSession.distanceKm);
    setPoints([]);
    setCurrentWalkCells([]);
    distanceKmRef.current = finishedSession.distanceKm;

    await saveCells([]);
    await saveCoverageRoutes(finishedSession.nextCoverageRoutes);
    await saveHistory(finishedSession.nextHistory);

    setIsWalking(false);
    setStartedAt(null);
    updateBackgroundTrackingState("inactive");
    activeWalkRef.current = null;
    lastAcceptedPointRef.current = null;
    pendingAcceptedPointsRef.current = 0;
    walkSessionStateRef.current = {
      status: "idle",
      pausedAt: null,
    };
  }

  function askResetApplication() {
    showAppDialog({
      title: "Сбросить всё приложение?",
      message:
        "Будут удалены прогулки, история, открытая территория, ник и выбранный цвет.",
      variant: "danger",
      actions: [
        { text: "Отмена", variant: "secondary" },
        {
          text: "Сбросить всё",
          variant: "danger",
          onPress: resetApplication,
        },
      ],
    });
  }

  async function resetData() {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    await stopBackgroundLocation();

    await progressRepository.clearProgressData();

    setIsWalking(false);
    setStartedAt(null);
    setOpenedCells([]);
    setCurrentWalkCells([]);
    setCoverageRoutes([]);
    setHistory([]);
    setPoints([]);
    setDistanceKm(0);
    setDurationSec(0);
    setLastResult(null);
    setBackgroundRecordingEnabled(false);
    updateBackgroundTrackingState("inactive");
    distanceKmRef.current = 0;
    activeWalkRef.current = null;
    lastAcceptedPointRef.current = null;
    pendingAcceptedPointsRef.current = 0;
    walkSessionStateRef.current = {
      status: "idle",
      pausedAt: null,
    };
  }

  async function resetApplication() {
    await resetData();
    await profileRepository.clearProfileSettings();

    const defaultAccent = ACCENT_THEMES[0].id;
    await setAccentTheme(defaultAccent);
    setLocalProfile(null);
    setNicknameDraft("");
    setProfileReady(true);
  }

  function getAchievements(stats: ReturnType<typeof getProgressStats>) {
    const achievements: Achievement[] = [
      {
        id: "first_walk",
        title: "Первый след",
        description: "Заверши первую прогулку",
        isUnlocked: stats.totalWalks >= 1,
      },
      {
        id: "one_km_total",
        title: "Первый километр",
        description: "Пройди 1 км суммарно",
        isUnlocked: stats.totalDistanceKm >= 1,
      },
      {
        id: "five_km_total",
        title: "Уже райончик",
        description: "Пройди 5 км суммарно",
        isUnlocked: stats.totalDistanceKm >= 5,
      },
      {
        id: "five_walks",
        title: "Маршрут вошёл в привычку",
        description: "Заверши 5 прогулок",
        isUnlocked: stats.totalWalks >= 5,
      },
      {
        id: "ten_km_total",
        title: "Город начал открываться",
        description: "Пройди 10 км суммарно",
        isUnlocked: stats.totalDistanceKm >= 10,
      },
      {
        id: "twenty_minutes",
        title: "Нормальная прогулка",
        description: "Заверши прогулку на 20+ минут",
        isUnlocked: stats.longestWalkSec >= 20 * 60,
      },
      {
        id: "daily_goal",
        title: "Цель дня",
        description: "Выполни дневную цель",
        isUnlocked: stats.dailyProgress.isGoalDone,
      },
      {
        id: "three_day_streak",
        title: "Серия началась",
        description: "Гуляй 3 дня подряд",
        isUnlocked: stats.streak >= 3,
      },
    ];

    return achievements;
  }

  function getNewAchievements(
    previousStats: ReturnType<typeof getProgressStats>,
    nextStats: ReturnType<typeof getProgressStats>,
  ) {
    const previousUnlockedIds = getAchievements(previousStats)
      .filter((achievement) => achievement.isUnlocked)
      .map((achievement) => achievement.id);

    return getAchievements(nextStats).filter(
      (achievement) =>
        achievement.isUnlocked && !previousUnlockedIds.includes(achievement.id),
    );
  }

  function getAchievementById(id: string) {
    return achievements.find((achievement) => achievement.id === id);
  }

  function toRad(value: number) {
    return (value * Math.PI) / 180;
  }

  function formatTime(seconds: number) {
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

  function formatKm(value: number) {
    return value.toFixed(2).replace(".", ",");
  }

  function pointToMercatorMeters(point: WalkPoint) {
    const latitude = Math.max(-85, Math.min(85, point.latitude));
    const longitude = Math.max(-180, Math.min(180, point.longitude));
    const lonRad = toRad(longitude);
    const latRad = toRad(latitude);

    return {
      x: WEB_MERCATOR_RADIUS_METERS * lonRad,
      y:
        WEB_MERCATOR_RADIUS_METERS *
        Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
    };
  }

  function mercatorMetersToCoordinate(x: number, y: number): [number, number] {
    const longitude = (x / WEB_MERCATOR_RADIUS_METERS) * (180 / Math.PI);
    const latitude =
      (2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS_METERS)) - Math.PI / 2) *
      (180 / Math.PI);

    return [longitude, latitude];
  }

  type MercatorPoint = {
    x: number;
    y: number;
  };

  function getRingSignedArea(ring: [number, number][]) {
    let sum = 0;

    for (let index = 0; index < ring.length - 1; index += 1) {
      const current = ring[index];
      const next = ring[index + 1];
      sum += current[0] * next[1] - next[0] * current[1];
    }

    return sum / 2;
  }

  function makeFillOuterRing(ring: [number, number][]) {
    return getRingSignedArea(ring) < 0 ? [...ring].reverse() : ring;
  }

  function makeFogHoleRing(ring: [number, number][]) {
    return getRingSignedArea(ring) > 0 ? [...ring].reverse() : ring;
  }

  function getMercatorRingArea(ring: MercatorPoint[]) {
    let sum = 0;

    for (let index = 0; index < ring.length; index += 1) {
      const current = ring[index];
      const next = ring[(index + 1) % ring.length];
      sum += current.x * next.y - next.x * current.y;
    }

    return sum / 2;
  }

  function makeCircleRing(
    point: WalkPoint,
    radiusMeters = UNLOCK_RADIUS_METERS,
    steps = 96,
  ): [number, number][] {
    const center = pointToMercatorMeters(point);
    const ring: [number, number][] = [];

    for (let index = 0; index <= steps; index += 1) {
      const angle = (Math.PI * 2 * index) / steps;
      const x = center.x + Math.cos(angle) * radiusMeters;
      const y = center.y + Math.sin(angle) * radiusMeters;
      ring.push(mercatorMetersToCoordinate(x, y));
    }

    return ring;
  }

  function addCoverageSample(
    samples: MercatorPoint[],
    seen: Set<string>,
    point: MercatorPoint,
  ) {
    const key = `${Math.round(point.x / COVERAGE_SAMPLE_STEP_METERS)}:${Math.round(
      point.y / COVERAGE_SAMPLE_STEP_METERS,
    )}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    samples.push(point);
  }

  function addRouteCoverageSamples(
    samples: MercatorPoint[],
    seen: Set<string>,
    routePoints: WalkPoint[],
  ) {
    const cleanPoints = routePoints.filter(isValidWalkPoint);

    if (cleanPoints.length === 0) {
      return;
    }

    if (cleanPoints.length === 1) {
      addCoverageSample(samples, seen, pointToMercatorMeters(cleanPoints[0]));
      return;
    }

    for (let index = 0; index < cleanPoints.length - 1; index += 1) {
      const start = pointToMercatorMeters(cleanPoints[index]);
      const end = pointToMercatorMeters(cleanPoints[index + 1]);
      const segmentDistance = Math.hypot(end.x - start.x, end.y - start.y);
      const steps = Math.max(
        1,
        Math.ceil(segmentDistance / COVERAGE_SAMPLE_STEP_METERS),
      );

      for (let step = 0; step <= steps; step += 1) {
        const progress = step / steps;
        addCoverageSample(samples, seen, {
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        });
      }
    }
  }

  function addPointCoverageSamples(
    samples: MercatorPoint[],
    seen: Set<string>,
    routePoints: WalkPoint[],
  ) {
    routePoints
      .filter(isValidWalkPoint)
      .forEach((point) => {
        addCoverageSample(samples, seen, pointToMercatorMeters(point));
      });
  }

  function collectCoverageSamples(
    routes: CoverageRoute[],
    routePoints: WalkPoint[],
    fallbackPoint: WalkPoint | null,
    connectRoutePoints = true,
  ) {
    const samples: MercatorPoint[] = [];
    const seen = new Set<string>();

    routes.slice(0, MAX_COVERAGE_ROUTES_ON_MAP).forEach((route) => {
      addRouteCoverageSamples(samples, seen, route.points);
    });

    if (connectRoutePoints) {
      addRouteCoverageSamples(samples, seen, routePoints);
    } else {
      addPointCoverageSamples(samples, seen, routePoints);
    }

    if (fallbackPoint) {
      addCoverageSample(samples, seen, pointToMercatorMeters(fallbackPoint));
    }

    if (samples.length <= MAX_COVERAGE_SAMPLE_POINTS) {
      return samples;
    }

    return samples.slice(samples.length - MAX_COVERAGE_SAMPLE_POINTS);
  }

  function makeAnglePositive(angle: number) {
    const full = Math.PI * 2;
    let result = angle % full;

    if (result < 0) {
      result += full;
    }

    return result;
  }

  function makeCirclePoint(center: MercatorPoint, angle: number) {
    return {
      x: center.x + Math.cos(angle) * UNLOCK_RADIUS_METERS,
      y: center.y + Math.sin(angle) * UNLOCK_RADIUS_METERS,
    };
  }

  function getUnionBucketKey(x: number, y: number, bucketSize: number) {
    return `${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`;
  }

  function makeCircleUnionBuckets(samples: MercatorPoint[], bucketSize: number) {
    const buckets = new globalThis.Map<string, number[]>();

    samples.forEach((sample, index) => {
      const key = getUnionBucketKey(sample.x, sample.y, bucketSize);
      const list = buckets.get(key) ?? [];
      list.push(index);
      buckets.set(key, list);
    });

    return buckets;
  }

  function getNearbyCircleIndexes(
    sample: MercatorPoint,
    buckets: globalThis.Map<string, number[]>,
    bucketSize: number,
  ) {
    const bucketX = Math.floor(sample.x / bucketSize);
    const bucketY = Math.floor(sample.y / bucketSize);
    const result: number[] = [];

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const list = buckets.get(`${bucketX + dx}:${bucketY + dy}`);

        if (list) {
          result.push(...list);
        }
      }
    }

    return result;
  }

  function addCoveredAngleInterval(
    intervals: { start: number; end: number }[],
    start: number,
    end: number,
  ) {
    const full = Math.PI * 2;
    const safeStart = makeAnglePositive(start);
    const safeEnd = makeAnglePositive(end);

    if (end - start >= full) {
      intervals.push({ start: 0, end: full });
      return;
    }

    if (safeStart <= safeEnd) {
      intervals.push({ start: safeStart, end: safeEnd });
      return;
    }

    intervals.push({ start: safeStart, end: full });
    intervals.push({ start: 0, end: safeEnd });
  }

  function mergeAngleIntervals(intervals: { start: number; end: number }[]) {
    const sortedIntervals = intervals
      .filter((interval) => interval.end - interval.start > 0.0001)
      .sort((a, b) => a.start - b.start);

    if (sortedIntervals.length === 0) {
      return [];
    }

    const merged: { start: number; end: number }[] = [sortedIntervals[0]];

    sortedIntervals.slice(1).forEach((interval) => {
      const last = merged[merged.length - 1];

      if (interval.start <= last.end + 0.0001) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    });

    return merged;
  }

  function getUncoveredAngleIntervals(coveredIntervals: { start: number; end: number }[]) {
    const full = Math.PI * 2;
    const merged = mergeAngleIntervals(coveredIntervals);

    if (merged.length === 0) {
      return [{ start: 0, end: full }];
    }

    if (merged.length === 1 && merged[0].start <= 0 && merged[0].end >= full) {
      return [];
    }

    const uncovered: { start: number; end: number }[] = [];
    let cursor = 0;

    merged.forEach((interval) => {
      if (interval.start > cursor + 0.0001) {
        uncovered.push({ start: cursor, end: interval.start });
      }

      cursor = Math.max(cursor, interval.end);
    });

    if (cursor < full - 0.0001) {
      uncovered.push({ start: cursor, end: full });
    }

    return uncovered;
  }

  function makeArcPoints(center: MercatorPoint, startAngle: number, endAngle: number) {
    const angleLength = endAngle - startAngle;
    const arcLength = Math.max(0, angleLength * UNLOCK_RADIUS_METERS);
    const steps = Math.max(3, Math.ceil(arcLength / COVERAGE_ARC_STEP_METERS));
    const points: MercatorPoint[] = [];

    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const angle = startAngle + angleLength * progress;
      points.push(makeCirclePoint(center, angle));
    }

    return points;
  }

  function getMercatorPointKey(point: MercatorPoint) {
    return `${Math.round(point.x * 5)}:${Math.round(point.y * 5)}`;
  }

  function findNearestArcIndex(
    keyPoint: MercatorPoint,
    segments: { points: MercatorPoint[]; used: boolean }[],
  ) {
    let bestIndex = -1;
    let bestDistance = 1.5;

    segments.forEach((segment, index) => {
      if (segment.used) {
        return;
      }

      const start = segment.points[0];
      const distance = Math.hypot(start.x - keyPoint.x, start.y - keyPoint.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function buildRingsFromCircleArcs(
    segments: { points: MercatorPoint[]; used: boolean }[],
  ) {
    const startsByKey = new globalThis.Map<string, number[]>();

    segments.forEach((segment, index) => {
      const key = getMercatorPointKey(segment.points[0]);
      const list = startsByKey.get(key) ?? [];
      list.push(index);
      startsByKey.set(key, list);
    });

    const takeSegmentByStartKey = (key: string) => {
      const list = startsByKey.get(key);

      if (!list || list.length === 0) {
        return -1;
      }

      while (list.length > 0) {
        const index = list.shift() as number;

        if (!segments[index].used) {
          if (list.length === 0) {
            startsByKey.delete(key);
          } else {
            startsByKey.set(key, list);
          }

          return index;
        }
      }

      startsByKey.delete(key);
      return -1;
    };

    const rings: [number, number][][] = [];

    segments.forEach((segment, startIndex) => {
      if (segment.used) {
        return;
      }

      segment.used = true;
      const ring = [...segment.points];
      const firstPoint = ring[0];
      let guard = 0;

      while (guard < 20_000) {
        const endPoint = ring[ring.length - 1];

        if (Math.hypot(endPoint.x - firstPoint.x, endPoint.y - firstPoint.y) < 1.5) {
          break;
        }

        const nextKey = getMercatorPointKey(endPoint);
        let nextIndex = takeSegmentByStartKey(nextKey);

        if (nextIndex < 0) {
          nextIndex = findNearestArcIndex(endPoint, segments);
        }

        if (nextIndex < 0) {
          break;
        }

        segments[nextIndex].used = true;
        ring.push(...segments[nextIndex].points.slice(1));
        guard += 1;
      }

      const endPoint = ring[ring.length - 1];

      if (Math.hypot(endPoint.x - firstPoint.x, endPoint.y - firstPoint.y) >= 2) {
        segments[startIndex].used = true;
        return;
      }

      if (ring.length < 8) {
        return;
      }

      const area = Math.abs(getMercatorRingArea(ring));

      if (area < UNLOCK_RADIUS_METERS * UNLOCK_RADIUS_METERS * 0.2) {
        return;
      }

      const coordinates = ring.map((point) => mercatorMetersToCoordinate(point.x, point.y));
      coordinates.push(coordinates[0]);

      const signedArea = getRingSignedArea(coordinates);
      rings.push(signedArea > 0 ? [...coordinates].reverse() : coordinates);
    });

    return rings;
  }

  function makeOpenedRadiusRings(
    routes: CoverageRoute[],
    routePoints: WalkPoint[],
    fallbackPoint: WalkPoint | null,
    connectRoutePoints = true,
  ) {
    const samples = collectCoverageSamples(
      routes,
      routePoints,
      fallbackPoint,
      connectRoutePoints,
    );

    if (samples.length === 0) {
      return [];
    }

    const bucketSize = UNLOCK_RADIUS_METERS * 2;
    const buckets = makeCircleUnionBuckets(samples, bucketSize);
    const arcSegments: { points: MercatorPoint[]; used: boolean }[] = [];
    const full = Math.PI * 2;

    samples.forEach((sample, sampleIndex) => {
      const coveredIntervals: { start: number; end: number }[] = [];
      const nearbyIndexes = getNearbyCircleIndexes(sample, buckets, bucketSize);

      nearbyIndexes.forEach((nearbyIndex) => {
        if (nearbyIndex === sampleIndex) {
          return;
        }

        const other = samples[nearbyIndex];
        const distance = Math.hypot(other.x - sample.x, other.y - sample.y);

        if (distance < 0.01) {
          coveredIntervals.push({ start: 0, end: full });
          return;
        }

        if (distance >= UNLOCK_RADIUS_METERS * 2) {
          return;
        }

        const angle = Math.atan2(other.y - sample.y, other.x - sample.x);
        const halfAngle = Math.acos(
          Math.max(-1, Math.min(1, distance / (UNLOCK_RADIUS_METERS * 2))),
        );

        addCoveredAngleInterval(coveredIntervals, angle - halfAngle, angle + halfAngle);
      });

      const uncoveredIntervals = getUncoveredAngleIntervals(coveredIntervals);

      uncoveredIntervals.forEach((interval) => {
        if (interval.end - interval.start >= full - 0.0001) {
          const circlePoints = makeArcPoints(sample, 0, full);
          const coordinates = circlePoints.map((point) =>
            mercatorMetersToCoordinate(point.x, point.y),
          );
          coordinates.push(coordinates[0]);
          const signedArea = getRingSignedArea(coordinates);
          arcSegments.push({ points: circlePoints, used: true });
          const ring = signedArea > 0 ? [...coordinates].reverse() : coordinates;
          // Store isolated circles directly by abusing a marker segment that is already used.
          (arcSegments as any).__isolatedRings = [
            ...((arcSegments as any).__isolatedRings ?? []),
            ring,
          ];
          return;
        }

        const arcPoints = makeArcPoints(sample, interval.start, interval.end);

        if (arcPoints.length >= 2) {
          arcSegments.push({ points: arcPoints, used: false });
        }
      });
    });

    const isolatedRings = ((arcSegments as any).__isolatedRings ?? []) as [
      number,
      number,
    ][][];

    return [...isolatedRings, ...buildRingsFromCircleArcs(arcSegments)];
  }

  function makeFogGeoJson(openedRings: [number, number][][]): MapGeoJsonData {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [FOG_OUTER_RING, ...openedRings.map(makeFogHoleRing)],
          },
        },
      ],
    };
  }

  function makeOpenedEdgeGeoJson(openedRings: [number, number][][]): MapGeoJsonData {
    if (openedRings.length === 0) {
      return EMPTY_FEATURE_COLLECTION;
    }

    return {
      type: "FeatureCollection",
      features: openedRings.map((ring, index) => ({
        type: "Feature" as const,
        id: index,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: ring,
        },
      })),
    };
  }

  function makeOpenedFillGeoJson(openedRings: [number, number][][]): MapGeoJsonData {
    if (openedRings.length === 0) {
      return EMPTY_FEATURE_COLLECTION;
    }

    return {
      type: "FeatureCollection",
      features: openedRings.map((ring, index) => ({
        type: "Feature" as const,
        id: index,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [makeFillOuterRing(ring)],
        },
      })),
    };
  }

  function makeUserRadiusGeoJson(point: WalkPoint | null): MapGeoJsonData {
    if (!point) {
      return EMPTY_FEATURE_COLLECTION;
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
              type: "Polygon" as const,
            coordinates: [makeCircleRing(point, UNLOCK_RADIUS_METERS, USER_RADIUS_RING_STEPS)],
          },
        },
      ],
    };
  }

  const progressStats = getProgressStats([], history);
  const levelInfo = progressStats.levelInfo;
  const dailyProgress = progressStats.dailyProgress;
  const achievements = getAchievements(progressStats);
  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.isUnlocked,
  );
  const lastUnlockedAchievements =
    lastResult?.achievementsUnlocked
      ?.map(getAchievementById)
      .filter(Boolean) as Achievement[] | undefined;

  const displayRoutePoints = useMemo(() => {
    if (!isWalking) {
      return [];
    }

    return points.slice(-ACTIVE_ROUTE_VISIBLE_POINTS_LIMIT);
  }, [isWalking, points]);

  const liveCoveragePreviewPoints = useMemo(() => {
    if (!isWalking) {
      return [];
    }

    return displayRoutePoints.slice(-LIVE_COVERAGE_PREVIEW_POINTS_LIMIT);
  }, [displayRoutePoints, isWalking]);

  const liveCoverageFallbackPoint = useMemo(() => {
    if (!isWalking || !currentLocation) {
      return null;
    }

    const lastPreviewPoint =
      liveCoveragePreviewPoints[liveCoveragePreviewPoints.length - 1];

    if (
      lastPreviewPoint &&
      getDistanceKm(lastPreviewPoint, currentLocation) < 0.001
    ) {
      return null;
    }

    return currentLocation;
  }, [currentLocation, isWalking, liveCoveragePreviewPoints]);

  const openedBoundaryRings = useMemo(() => {
    try {
      const cacheKey = `${getCoverageCacheKey(
        coverageRoutes,
        liveCoveragePreviewPoints,
      )}|live:${liveCoverageFallbackPoint ? getRouteCacheEdge([liveCoverageFallbackPoint]) : "none"}`;

      if (coverageGeometryCacheRef.current?.key === cacheKey) {
        return coverageGeometryCacheRef.current.rings;
      }

      const startedAt = Date.now();
      const rings = makeOpenedRadiusRings(
        coverageRoutes,
        liveCoveragePreviewPoints,
        liveCoverageFallbackPoint,
        false,
      );

      coverageGeometryCacheRef.current = {
        key: cacheKey,
        rings,
      };

      logMapPerf("coverage", {
        durationMs: Date.now() - startedAt,
        rings: rings.length,
        coverageRoutes: coverageRoutes.length,
        fullActivePoints: points.length,
        visibleActivePoints: liveCoveragePreviewPoints.length,
        fallbackPoint: liveCoverageFallbackPoint ? 1 : 0,
      });
      logLongSessionPerf("coverage-rebuild", {
        durationMs: Date.now() - startedAt,
        rings: rings.length,
        coverageRoutes: coverageRoutes.length,
        fullActivePoints: activeWalkRef.current?.points.length ?? points.length,
        memoryPoints: points.length,
        mapPoints: liveCoveragePreviewPoints.length,
        fallbackPoint: liveCoverageFallbackPoint ? 1 : 0,
      });

      return rings;
    } catch (error) {
      recordMapFallback("coverage-rings", error);
      return [];
    }
  }, [
    coverageRoutes,
    liveCoverageFallbackPoint,
    liveCoveragePreviewPoints,
    points.length,
  ]);

  const fogGeoJson = useMemo(() => {
    return safeBuildMapGeoJson("fog-geojson", () =>
      makeFogGeoJson(openedBoundaryRings),
    );
  }, [openedBoundaryRings]);

  const openedEdgeGeoJson = useMemo(() => {
    return safeBuildMapGeoJson("opened-edge-geojson", () =>
      makeOpenedEdgeGeoJson(openedBoundaryRings),
    );
  }, [openedBoundaryRings]);

  const openedFillGeoJson = useMemo(() => {
    return safeBuildMapGeoJson("opened-fill-geojson", () =>
      makeOpenedFillGeoJson(openedBoundaryRings),
    );
  }, [openedBoundaryRings]);

  const userRadiusGeoJson = useMemo(() => {
    return safeBuildMapGeoJson("user-radius-geojson", () =>
      makeUserRadiusGeoJson(currentLocation),
    );
  }, [currentLocation]);

  const routeGeoJson: MapGeoJsonData = useMemo(() => {
    const geoJson = safeBuildMapGeoJson("route-geojson", () => ({
        type: "FeatureCollection",
        features:
          displayRoutePoints.length > 1
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: displayRoutePoints.map((point) => [
                      point.longitude,
                      point.latitude,
                    ]),
                  },
                },
              ]
            : [],
      }));

    logLongSessionPerf("active-route-geojson", {
      fullPoints: activeWalkRef.current?.points.length ?? points.length,
      memoryPoints: points.length,
      mapPoints: displayRoutePoints.length,
      featureCount: getGeoJsonFeatureCount(geoJson),
      approxBytes: getGeoJsonApproxSize(geoJson),
    });

    return geoJson;
  }, [displayRoutePoints, points.length]);

  const userGeoJson: MapGeoJsonData = useMemo(() => {
    return safeBuildMapGeoJson("user-geojson", () => {
      if (!currentLocation) {
        return EMPTY_FEATURE_COLLECTION;
      }

      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [currentLocation.longitude, currentLocation.latitude],
            },
          },
        ],
      };
    });
  }, [currentLocation]);


  if (!profileReady) {
    return (
      <View style={styles.authScreen}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={accentTheme.color} />
        <Text style={styles.authLoadingText}>Загрузка профиля...</Text>
      </View>
    );
  }

  if (!localProfile) {
    return (
      <View style={styles.authScreen}>
        <StatusBar barStyle="light-content" />

        <View style={styles.authCard}>
          <Text style={styles.authLogo}>WalkMap</Text>
          <Text style={styles.authTitle}>Как тебя называть?</Text>
          <Text style={styles.authSubtitle}>
            Ник сохранится на этом устройстве. Интернет не нужен.
          </Text>

          <TextInput
            style={styles.authInput}
            value={nicknameDraft}
            onChangeText={handleNicknameDraftChange}
            placeholder="Гость"
            placeholderTextColor="#6F7A99"
            maxLength={220}
            autoCapitalize="sentences"
          />

          <TouchableOpacity
            style={[
              styles.authPrimaryButton,
              { backgroundColor: accentTheme.color },
              nicknameBusy && styles.disabledButton,
            ]}
            onPress={handleCreateLocalProfile}
            disabled={nicknameBusy}
          >
            <Text style={[styles.buttonText, { color: accentTheme.foreground }]}>
              {nicknameBusy ? "Сохраняю..." : "Начать"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <Map
        style={styles.map}
        mapStyle={MAP_STYLE}
        onDidFinishLoadingMap={() => setMapReady(true)}
        compass={false}
        logo={false}
        attribution={true}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: mapCenter
              ? [mapCenter.longitude, mapCenter.latitude]
              : DEFAULT_CENTER,
            zoom: 12,
          }}
        />

        <GeoJSONSource id="fog-source" data={fogGeoJson as any}>
          <Layer
            id="locked-map-fog"
            type="fill"
            paint={{
              "fill-color": "#101622",
              "fill-opacity": 0.72,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="opened-fill-source" data={openedFillGeoJson as any}>
          <Layer
            id="opened-territory-fill"
            type="fill"
            paint={{
              "fill-color": accentTheme.color,
              "fill-opacity": 0.18,
              "fill-antialias": true,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="opened-edge-source" data={openedEdgeGeoJson as any}>
          <Layer
            id="opened-territory-edge"
            type="line"
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": accentTheme.color,
              "line-width": 2,
              "line-opacity": 0.74,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="user-radius-source" data={userRadiusGeoJson as any}>
          <Layer
            id="user-radius-halo"
            type="line"
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": accentTheme.color,
              "line-width": isWalking ? 12 : 18,
              "line-opacity": isWalking ? 0.12 : 0.18,
              "line-blur": isWalking ? 8 : 10,
            }}
          />
          <Layer
            id="user-radius-fill"
            type="fill"
            paint={{
              "fill-color": accentTheme.color,
              "fill-opacity": isWalking ? 0.045 : 0.11,
              "fill-antialias": true,
            }}
          />
          <Layer
            id="user-radius-soft-edge"
            type="line"
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": accentTheme.color,
              "line-width": isWalking ? 5 : 7,
              "line-opacity": isWalking ? 0.18 : 0.22,
              "line-blur": 3,
            }}
          />
          <Layer
            id="user-radius-edge"
            type="line"
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": accentTheme.color,
              "line-width": isWalking ? 2 : 2.2,
              "line-opacity": isWalking ? 0.78 : 0.92,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="route-source" data={routeGeoJson as any}>
          <Layer
            id="route-line"
            type="line"
            paint={{
              "line-color": "#FFFFFF",
              "line-width": 4,
              "line-opacity": 0.72,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="user-source" data={userGeoJson as any}>
          <Layer
            id="user-dot"
            type="circle"
            paint={{
              "circle-color": accentTheme.color,
              "circle-radius": 8,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 3,
            }}
          />
        </GeoJSONSource>
      </Map>

      {!mapReady && (
        <View style={styles.mapLoading} pointerEvents="none">
          <Text style={styles.mapLoadingText}>Загрузка карты...</Text>
        </View>
      )}

      <View style={styles.topPanel}>
        <TouchableOpacity
          style={styles.topProfileButton}
          activeOpacity={0.82}
          onPress={() => router.push("/profile")}
        >
          <View
            style={[
              styles.topAvatar,
              { backgroundColor: accentTheme.color },
            ]}
          >
            <Text
              style={[
                styles.topAvatarText,
                { color: accentTheme.foreground },
              ]}
            >
              {userInitial}
            </Text>
          </View>
          <View style={styles.topTitleBlock}>
            <Text style={styles.logo}>WalkMap</Text>
            <Text style={styles.subtitle}>
              Открывай город прогулками
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.topIconButtonSecondary}
          onPress={() => {
            refreshBackgroundRecordingStatus();
            router.push("/settings");
          }}
        >
          <Text style={styles.gearButtonText}>⚙</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[
          styles.mapLocateButton,
          !currentLocation && styles.mapLocateButtonDisabled,
          {
            borderColor: accentTheme.border,
            shadowColor: accentTheme.color,
          },
        ]}
        activeOpacity={0.86}
        onPress={() => {
          if (currentLocation) moveMapTo(currentLocation);
        }}
      >
        <View style={[styles.locateIconOuter, { borderColor: accentTheme.color }]}>
          <View style={[styles.locateIconInner, { backgroundColor: accentTheme.color }]} />
        </View>
      </TouchableOpacity>

      <View style={styles.bottomPanel} pointerEvents="box-none">
        {isWalking && (
          <View style={styles.walkStatsFloatingRow}>
            <View style={[styles.walkStatCard, { borderColor: accentTheme.border }]}>
              <Text style={styles.statLabel}>Км</Text>
              <Text style={styles.statValue}>{formatKm(distanceKm)}</Text>
            </View>

            <View style={[styles.walkStatCard, { borderColor: accentTheme.border }]}>
              <Text style={styles.statLabel}>Время</Text>
              <Text style={styles.statValue}>{formatTime(durationSec)}</Text>
            </View>

            <View style={[styles.walkStatCard, { borderColor: accentTheme.border }]}>
              <Text style={styles.statLabel}>Фон</Text>
              <Text style={styles.statValueSmall}>
                {getBackgroundTrackingLabel(backgroundTrackingState)}
              </Text>
            </View>
          </View>
        )}

        {!isWalking && (
          <View style={styles.homeCardsRow}>
            <TouchableOpacity
              style={[styles.homeInfoCard, { borderColor: accentTheme.border }]}
              onPress={() => router.push("/profile/statistics")}
            >
              <Text style={styles.homeInfoLabel}>Цель дня</Text>
              <Text style={[styles.homeInfoValue, { color: accentTheme.color }]}>
                {dailyProgress.distanceGoalPercent}%
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.homeInfoCard, { borderColor: "rgba(255,255,255,0.08)" }]}
              onPress={() => router.push("/profile/statistics")}
            >
              <Text style={styles.homeInfoLabel}>Серия</Text>
              <Text style={styles.homeInfoValue}>
                {progressStats.streak} дн.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.homeInfoCard, { borderColor: "rgba(255,255,255,0.08)" }]}
              onPress={() => router.push("/profile/achievements")}
            >
              <Text style={styles.homeInfoLabel}>Награды</Text>
              <Text style={styles.homeInfoValue}>
                {unlockedAchievements.length}/{achievements.length}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!isWalking ? (
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: accentTheme.color },
            ]}
            onPress={startWalk}
          >
            <Text style={[styles.buttonText, { color: accentTheme.foreground }]}>Начать прогулку</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.dangerButton} onPress={askFinishWalk}>
            <Text style={styles.buttonText}>Завершить прогулку</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={appDialog !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.appDialogCard,
              appDialog?.variant === "error" ? styles.appDialogCardError : null,
            ]}
          >
            <View
              style={[
                styles.appDialogIconCircle,
                appDialog?.variant === "success"
                  ? styles.appDialogIconSuccess
                  : null,
                appDialog?.variant === "warning"
                  ? styles.appDialogIconWarning
                  : null,
                appDialog?.variant === "error"
                  ? styles.appDialogIconError
                  : null,
                appDialog?.variant === "danger"
                  ? styles.appDialogIconDanger
                  : null,
              ]}
            >
              <Text style={[styles.appDialogIcon, { color: accentTheme.color }]}>
                {getDialogIcon(appDialog?.variant)}
              </Text>
            </View>

            <Text style={styles.appDialogTitle}>{appDialog?.title}</Text>
            <Text style={styles.appDialogText}>{appDialog?.message}</Text>

            {appDialog?.variant === "error" ? (
              <View style={styles.errorCopyBox}>
                <Text style={styles.errorCopyText} selectable>
                  {appDialog.copyText ||
                    `${appDialog.title}\n${appDialog.message}`}
                </Text>
              </View>
            ) : null}

            {appDialogCopied ? (
              <Text style={styles.appDialogCopied}>Скопировано</Text>
            ) : null}

            <View style={styles.appDialogActionsRow}>
              {getDialogActions(appDialog).map((action, index, actions) => (
                <TouchableOpacity
                  key={`${action.text}-${index}`}
                  style={[
                    styles.appDialogButton,
                    action.variant !== "secondary" && action.variant !== "danger"
                      ? { backgroundColor: accentTheme.color }
                      : null,
                    index < actions.length - 1 ? styles.appDialogButtonGap : null,
                    action.variant === "secondary"
                      ? styles.appDialogButtonSecondary
                      : null,
                    action.variant === "danger"
                      ? styles.appDialogButtonDanger
                      : null,
                    action.variant === "copy"
                      ? styles.appDialogButtonCopy
                      : null,
                  ]}
                  onPress={() => {
                    handleAppDialogAction(action);
                  }}
                >
                  <Text
                    style={[
                      styles.appDialogButtonText,
                      action.variant !== "secondary" && action.variant !== "danger"
                        ? { color: accentTheme.foreground }
                        : null,
                      action.variant === "secondary"
                        ? styles.appDialogButtonTextSecondary
                        : null,
                    ]}
                  >
                    {action.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={finishConfirmVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.finishCard}>
            <View style={styles.finishIconCircle}>
              <Text style={styles.finishIcon}>✓</Text>
            </View>

            <Text style={styles.finishTitle}>
              {finishConfirmMode === "short"
                ? "Сохранить короткую прогулку?"
                : "Завершить прогулку?"}
            </Text>
            <Text style={styles.finishText}>
              {finishConfirmMode === "short"
                ? "Похоже, ты только начал запись. Можно продолжить маршрут или сохранить как есть."
                : "Текущий маршрут будет сохранён в историю, а пройденная область останется открытой."}
            </Text>

            <View style={styles.finishStatsRow}>
              <View style={styles.finishStatBox}>
                <Text style={styles.finishStatLabel}>Км</Text>
                <Text style={styles.finishStatValue}>{formatKm(distanceKm)}</Text>
              </View>

              <View style={styles.finishStatBox}>
                <Text style={styles.finishStatLabel}>Время</Text>
                <Text style={styles.finishStatValue}>{formatTime(durationSec)}</Text>
              </View>

              <View style={styles.finishStatBox}>
                <Text style={styles.finishStatLabel}>Радиус</Text>
                <Text style={styles.finishStatValue}>{UNLOCK_RADIUS_METERS} м</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.finishConfirmButton}
              onPress={confirmFinishWalk}
            >
              <Text style={styles.buttonText}>
                {finishConfirmMode === "short" ? "Сохранить" : "Завершить"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.finishCancelButton}
              onPress={() => setFinishConfirmVisible(false)}
            >
              <Text style={styles.secondaryButtonText}>Продолжить прогулку</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={resultModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Прогулка завершена</Text>

            {lastResult && (
              <>
                <View style={styles.resultBigRow}>
                  <Text style={styles.resultBigValue}>
                    {formatKm(lastResult.distanceKm)} км
                  </Text>
                  <Text style={styles.resultBigLabel}>пройдено</Text>
                </View>

                <View style={styles.resultGrid}>
                  <View style={styles.resultMiniBox}>
                    <Text style={styles.resultMiniLabel}>Время</Text>
                    <Text style={styles.resultMiniValue}>
                      {formatTime(lastResult.durationSec)}
                    </Text>
                  </View>

                  <View style={styles.resultMiniBox}>
                    <Text style={styles.resultMiniLabel}>Открытая область</Text>
                    <Text style={styles.resultMiniValue}>
                      {UNLOCK_RADIUS_METERS} м
                    </Text>
                  </View>

                  <View style={styles.resultMiniBox}>
                    <Text style={styles.resultMiniLabel}>Уровень</Text>
                    <Text style={styles.resultMiniValue}>
                      {levelInfo.level}
                    </Text>
                  </View>

                  <View style={styles.resultMiniBox}>
                    <Text style={styles.resultMiniLabel}>Серия</Text>
                    <Text style={styles.resultMiniValue}>
                      {progressStats.streak} дн.
                    </Text>
                  </View>
                </View>

                {lastUnlockedAchievements &&
                  lastUnlockedAchievements.length > 0 && (
                    <View style={styles.unlockedCard}>
                      <Text style={styles.unlockedTitle}>Новые достижения</Text>
                      {lastUnlockedAchievements.map((achievement) => (
                        <View key={achievement.id} style={styles.unlockedItem}>
                          <Text style={styles.unlockedIcon}>★</Text>
                          <View style={styles.unlockedTextBlock}>
                            <Text style={styles.unlockedName}>
                              {achievement.title}
                            </Text>
                            <Text style={styles.unlockedDescription}>
                              {achievement.description}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
              </>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setResultModalVisible(false)}
            >
              <Text style={styles.buttonText}>Отлично</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setResultModalVisible(false);
                router.push("/profile/history");
              }}
            >
              <Text style={styles.secondaryButtonText}>Посмотреть историю</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const { height } = Dimensions.get("window");

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  authScreen: {
    flex: 1,
    backgroundColor: "#0B1020",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  authCard: {
    width: "100%",
    backgroundColor: "#10182D",
    borderRadius: 30,
    padding: 22,
  },
  authLogo: {
    color: "#35E6B7",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 8,
  },
  authTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginBottom: 8,
  },
  authSubtitle: {
    color: "#AAB3D1",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  authNotice: {
    backgroundColor: "rgba(53, 230, 183, 0.12)",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(53, 230, 183, 0.28)",
  },
  authNoticeText: {
    color: "#DDF9F2",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  authInput: {
    backgroundColor: "#151C33",
    borderRadius: 18,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 10,
  },
  authPrimaryButton: {
    backgroundColor: "#2F80ED",
    paddingVertical: 17,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 6,
  },
  authSwitchButton: {
    paddingVertical: 15,
    alignItems: "center",
  },
  authSwitchText: {
    color: "#35E6B7",
    fontSize: 14,
    fontWeight: "900",
  },
  authGuestButton: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  authGuestText: {
    fontSize: 14,
    fontWeight: "900",
  },
  authLoadingInline: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  authLoadingInlineText: {
    color: "#AAB3D1",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginLeft: 10,
    flex: 1,
  },
  authLoadingText: {
    color: "#AAB3D1",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 14,
  },
  disabledButton: {
    opacity: 0.62,
  },
  map: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mapLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0B1020",
    alignItems: "center",
    justifyContent: "center",
  },
  mapLoadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  topPanel: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(11, 16, 32, 0.88)",
    borderRadius: 26,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  topTitleBlock: {
    flex: 1,
    paddingRight: 8,
  },
  topProfileButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
  topAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  topAvatarText: {
    fontSize: 18,
    fontWeight: "900",
  },
  logo: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  subtitle: {
    color: "#AAB3D1",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
  topIconButtonSecondary: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(21, 28, 51, 0.96)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mapLocateButton: {
    position: "absolute",
    right: 16,
    top: 136,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(11, 16, 32, 0.96)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    elevation: 10,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  mapLocateButtonDisabled: {
    opacity: 0.58,
  },
  locateIconOuter: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  locateIconInner: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  floatingMenuButton: {
    position: "absolute",
    top: 162,
    right: 16,
    backgroundColor: "rgba(11, 16, 32, 0.92)",
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },

  bottomPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  compactHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  menuPillButton: {
    backgroundColor: "#151C33",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  menuPillText: {
    color: "#DCE5FF",
    fontSize: 13,
    fontWeight: "900",
  },
  gearButtonText: {
    color: "#DCE5FF",
    fontSize: 22,
    fontWeight: "900",
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 9,
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: "#35E6B7",
  },
  statusDotIdle: {
    backgroundColor: "#AAB3D1",
  },
  statusText: {
    color: "#DCE5FF",
    fontSize: 13,
    fontWeight: "700",
  },
  levelCard: {
    backgroundColor: "#151C33",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  levelTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  levelTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  levelSubtitle: {
    color: "#35E6B7",
    fontSize: 13,
    fontWeight: "900",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#26304D",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#35E6B7",
    borderRadius: 99,
  },
  dailyProgressFill: {
    height: "100%",
    backgroundColor: "#2F80ED",
    borderRadius: 99,
  },
  progressText: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },
  statsRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  walkStatsFloatingRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  walkStatCard: {
    flex: 1,
    backgroundColor: "rgba(21, 28, 51, 0.94)",
    borderRadius: 20,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
  },
  homeCardsRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  homeInfoCard: {
    flex: 1,
    backgroundColor: "rgba(21, 28, 51, 0.94)",
    borderRadius: 20,
    padding: 12,
    marginRight: 8,
    minHeight: 70,
    justifyContent: "center",
    borderWidth: 1,
  },
  homeInfoLabel: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  homeInfoValue: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
  },

  statBox: {
    flex: 1,
    backgroundColor: "#151C33",
    borderRadius: 18,
    padding: 11,
    marginRight: 8,
  },
  statLabel: {
    color: "#AAB3D1",
    fontSize: 12,
    marginBottom: 6,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  statValueSmall: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  dailyCard: {
    backgroundColor: "#151C33",
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  dailyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dailyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  dailyBadge: {
    color: "#06111F",
    backgroundColor: "#35E6B7",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
  },
  dailyText: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: "#2F80ED",
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 0,
  },
  dangerButton: {
    backgroundColor: "#EB5757",
    paddingVertical: 17,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 0,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#151C33",
  },
  secondaryButtonText: {
    color: "#AAB3D1",
    fontSize: 15,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  smallButton: {
    flex: 1,
    backgroundColor: "#151C33",
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    marginRight: 8,
  },
  smallButtonText: {
    color: "#DCE5FF",
    fontSize: 12,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 4,
    marginRight: 6,
  },
  legendOld: {
    backgroundColor: "#2F80ED",
  },
  legendCurrent: {
    backgroundColor: "#8AB4FF",
  },
  legendNew: {
    backgroundColor: "#35E6B7",
  },
  legendText: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
  },
  compactInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 4,
  },
  compactInfoText: {
    color: "#AAB3D1",
    fontSize: 11,
    fontWeight: "800",
  },
  menuCard: {
    width: "100%",
    backgroundColor: "#10182D",
    borderRadius: 30,
    padding: 18,
  },
  menuLevelCard: {
    backgroundColor: "#151C33",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
  },
  accountCard: {
    backgroundColor: "#151C33",
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
  },
  accountLabel: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  accountEmail: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  menuActionButton: {
    backgroundColor: "#151C33",
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  menuActionTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  menuActionSubtitle: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  menuDangerButton: {
    backgroundColor: "rgba(235, 87, 87, 0.16)",
    borderRadius: 20,
    padding: 16,
    marginTop: 2,
  },
  menuDangerText: {
    color: "#FF8A8A",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  appDialogCard: {
    width: "100%",
    backgroundColor: "#10182D",
    borderRadius: 30,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  appDialogCardError: {
    borderColor: "rgba(235, 87, 87, 0.32)",
  },
  appDialogIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#1A2747",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  appDialogIconSuccess: {
    backgroundColor: "#152B34",
  },
  appDialogIconWarning: {
    backgroundColor: "rgba(242, 201, 76, 0.18)",
  },
  appDialogIconError: {
    backgroundColor: "rgba(235, 87, 87, 0.18)",
  },
  appDialogIconDanger: {
    backgroundColor: "rgba(235, 87, 87, 0.18)",
  },
  appDialogIcon: {
    color: "#35E6B7",
    fontSize: 30,
    fontWeight: "900",
  },
  appDialogTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  appDialogText: {
    color: "#AAB3D1",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  errorCopyBox: {
    backgroundColor: "#151C33",
    borderRadius: 18,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  errorCopyText: {
    color: "#DCE5FF",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  appDialogCopied: {
    color: "#35E6B7",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 10,
  },
  appDialogActionsRow: {
    flexDirection: "row",
    marginTop: 18,
  },
  appDialogButton: {
    flex: 1,
    backgroundColor: "#2F80ED",
    paddingVertical: 15,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  appDialogButtonGap: {
    marginRight: 8,
  },
  appDialogButtonSecondary: {
    backgroundColor: "#151C33",
  },
  appDialogButtonDanger: {
    backgroundColor: "#EB5757",
  },
  appDialogButtonCopy: {
    backgroundColor: "#35E6B7",
  },
  appDialogButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  appDialogButtonTextSecondary: {
    color: "#AAB3D1",
  },
  finishCard: {
    width: "100%",
    backgroundColor: "#10182D",
    borderRadius: 30,
    padding: 22,
  },
  finishIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#152B34",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  finishIcon: {
    color: "#35E6B7",
    fontSize: 30,
    fontWeight: "900",
  },
  finishTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginBottom: 8,
  },
  finishText: {
    color: "#AAB3D1",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 14,
  },
  finishStatsRow: {
    flexDirection: "row",
    marginHorizontal: -4,
    marginBottom: 14,
  },
  finishStatBox: {
    flex: 1,
    backgroundColor: "#151C33",
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 4,
  },
  finishStatLabel: {
    color: "#AAB3D1",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 5,
  },
  finishStatValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  finishConfirmButton: {
    backgroundColor: "#EB5757",
    paddingVertical: 17,
    borderRadius: 22,
    alignItems: "center",
  },
  finishCancelButton: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#151C33",
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#151C33",
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  profileAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#35E6B7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  profileAvatarText: {
    color: "#06111F",
    fontSize: 26,
    fontWeight: "900",
  },
  profileTextBlock: {
    flex: 1,
  },
  profileName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  profileEmail: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  profileLevel: {
    color: "#35E6B7",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
  },
  nicknameInput: {
    backgroundColor: "#10182D",
    borderRadius: 16,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  nicknameSaveButton: {
    borderRadius: 17,
    paddingVertical: 13,
    alignItems: "center",
  },
  nicknameSaveText: {
    fontSize: 14,
    fontWeight: "900",
  },
  settingsStatusCard: {
    backgroundColor: "#151C33",
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
  },
  accentCard: {
    backgroundColor: "#151C33",
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  accentCurrentName: {
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 12,
  },
  accentOptionsRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  accentOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 2,
  },
  accentSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  accentCheck: {
    fontSize: 17,
    fontWeight: "900",
  },
  settingsStatusTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backgroundStatusMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
  backgroundStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  backgroundStatusDotOff: {
    backgroundColor: "#AAB3D1",
  },
  backgroundStatusText: {
    fontSize: 13,
    fontWeight: "900",
  },
  backgroundStatusTextOff: {
    color: "#AAB3D1",
  },
  settingsHint: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 12,
  },
  backgroundActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 10,
  },
  backgroundActionButton: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: "center",
  },
  backgroundActionButtonSecondary: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#10182D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  backgroundActionText: {
    fontSize: 13,
    fontWeight: "900",
  },
  backgroundActionTextSecondary: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  resultCard: {
    width: "100%",
    maxHeight: height * 0.86,
    backgroundColor: "#10182D",
    borderRadius: 30,
    padding: 22,
  },
  resultTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginBottom: 18,
  },
  resultBigRow: {
    backgroundColor: "#151C33",
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
  },
  resultBigValue: {
    color: "#35E6B7",
    fontSize: 36,
    fontWeight: "900",
  },
  resultBigLabel: {
    color: "#AAB3D1",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  resultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginBottom: 12,
  },
  resultMiniBox: {
    width: "50%",
    padding: 4,
  },
  resultMiniLabel: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  resultMiniValue: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    backgroundColor: "#151C33",
    borderRadius: 18,
    padding: 12,
  },
  unlockedCard: {
    backgroundColor: "#151C33",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
  },
  unlockedTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
  },
  unlockedItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  unlockedIcon: {
    color: "#35E6B7",
    fontSize: 20,
    fontWeight: "900",
    marginRight: 10,
  },
  unlockedTextBlock: {
    flex: 1,
  },
  unlockedName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  unlockedDescription: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  sheetCard: {
    width: "100%",
    maxHeight: height * 0.82,
    backgroundColor: "#10182D",
    borderRadius: 30,
    padding: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sheetTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  sheetSubtitle: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#151C33",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 32,
  },
  emptyBox: {
    backgroundColor: "#151C33",
    borderRadius: 22,
    padding: 18,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  emptyText: {
    color: "#AAB3D1",
    fontSize: 14,
    lineHeight: 20,
  },
  historyItem: {
    backgroundColor: "#151C33",
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
  },
  historyTopRow: {
    marginBottom: 12,
  },
  historyTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  historyDate: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  historyStatsRow: {
    flexDirection: "row",
  },
  historyStat: {
    flex: 1,
  },
  historyStatLabel: {
    color: "#AAB3D1",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  historyStatValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  historyAchievementText: {
    color: "#35E6B7",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 10,
  },
  bigStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
  bigStatBox: {
    width: "50%",
    padding: 5,
  },
  bigStatValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    backgroundColor: "#151C33",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  bigStatLabel: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "800",
    backgroundColor: "#151C33",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  profileStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    marginBottom: 8,
  },
  profileStatBox: {
    width: "50%",
    padding: 4,
  },
  profileStatValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    backgroundColor: "#151C33",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 11,
  },
  profileStatLabel: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "800",
    backgroundColor: "#151C33",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 12,
    paddingBottom: 11,
    paddingTop: 3,
  },
  profileLinksList: {
    marginTop: 2,
  },
  profileLinkButton: {
    backgroundColor: "#151C33",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileLinkTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  profileLinkMeta: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 10,
  },
  areaCard: {
    backgroundColor: "#151C33",
    borderRadius: 24,
    padding: 16,
    marginTop: 12,
  },
  areaLabel: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "800",
  },
  areaValue: {
    color: "#35E6B7",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  areaHint: {
    color: "#AAB3D1",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  achievementItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
  },
  achievementUnlocked: {
    backgroundColor: "#152B34",
  },
  achievementLocked: {
    backgroundColor: "#151C33",
    opacity: 0.72,
  },
  achievementIcon: {
    color: "#35E6B7",
    fontSize: 28,
    fontWeight: "900",
    width: 40,
  },
  achievementTextBlock: {
    flex: 1,
  },
  achievementTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  achievementDescription: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
});

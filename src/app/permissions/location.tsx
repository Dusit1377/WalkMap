import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAccentTheme } from "@/features/app/accentStore";

type PermissionCheckState = "checking" | "missing" | "ready";

export default function LocationPermissionScreen() {
  const router = useRouter();
  const { accentTheme } = useAccentTheme();
  const [state, setState] = useState<PermissionCheckState>("checking");
  const [busy, setBusy] = useState(false);

  const isReady = state === "ready";

  const statusText = useMemo(() => {
    if (state === "checking") {
      return "Проверяем разрешение";
    }

    if (isReady) {
      return "Постоянный доступ включен";
    }

    return "Нужен постоянный доступ";
  }, [isReady, state]);

  const checkPermission = useCallback(async () => {
    setState("checking");

    const [foregroundPermission, backgroundPermission] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);

    setState(
      foregroundPermission.status === "granted" &&
        backgroundPermission.status === "granted"
        ? "ready"
        : "missing",
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission]),
  );

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void checkPermission();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [checkPermission]);

  async function handlePrimaryAction() {
    if (isReady) {
      router.replace("/permissions/battery");
      return;
    }

    setBusy(true);

    try {
      await Linking.openSettings();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Перед прогулкой</Text>
          <Text style={styles.title}>Разреши геолокацию всегда</Text>
          <Text style={styles.subtitle}>
            Так WalkMap сможет продолжать запись, когда экран заблокирован или
            приложение свернуто.
          </Text>
        </View>

        <View style={styles.screenshotFrame}>
          <Image
            resizeMode="contain"
            source={require("@/assets/Geo.png")}
            style={styles.screenshot}
          />
        </View>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isReady ? "#27AE60" : "#F6C343" },
            ]}
          />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        disabled={busy}
        onPress={handlePrimaryAction}
        style={[
          styles.primaryButton,
          { backgroundColor: isReady ? "#27AE60" : accentTheme.color },
          busy && styles.disabledButton,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {isReady ? "Далее" : "Разрешить доступ"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1020",
    paddingHorizontal: 22,
    paddingBottom: 28,
    paddingTop: 54,
  },
  content: {
    flex: 1,
    gap: 22,
  },
  header: {
    gap: 10,
  },
  eyebrow: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  subtitle: {
    color: "#D9E1FF",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
  },
  screenshotFrame: {
    alignItems: "center",
    backgroundColor: "#151C33",
    borderColor: "#263156",
    borderRadius: 8,
    borderWidth: 1,
    height: 320,
    justifyContent: "center",
    overflow: "hidden",
  },
  screenshot: {
    height: "100%",
    width: "100%",
  },
  statusCard: {
    alignItems: "center",
    backgroundColor: "#151C33",
    borderColor: "#263156",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  statusText: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 8,
    minHeight: 54,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
});

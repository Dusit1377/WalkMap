import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

  async function requestLocationAccess() {
    setBusy(true);

    try {
      const foregroundPermission =
        await Location.requestForegroundPermissionsAsync();

      if (foregroundPermission.status !== "granted") {
        setState("missing");
        return;
      }

      const backgroundPermission =
        await Location.requestBackgroundPermissionsAsync();

      setState(
        backgroundPermission.status === "granted" ? "ready" : "missing",
      );
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (!isReady) {
      return;
    }

    router.replace("/permissions/battery");
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

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Место для скриншота</Text>
          <Text style={styles.placeholderText}>
            Сюда можно добавить картинку с нужным пунктом настроек Android.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isReady ? accentTheme.color : "#F6C343" },
            ]}
          />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={busy}
          onPress={requestLocationAccess}
          style={[styles.secondaryButton, busy && styles.disabledButton]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.secondaryButtonText}>Разрешить доступ</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => Linking.openSettings()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Открыть настройки</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!isReady}
          onPress={goNext}
          style={[
            styles.primaryButton,
            { backgroundColor: accentTheme.color },
            !isReady && styles.disabledButton,
          ]}
        >
          <Text style={styles.primaryButtonText}>Дальше</Text>
        </TouchableOpacity>
      </View>
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
  placeholder: {
    minHeight: 280,
    borderColor: "#33406B",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 2,
    justifyContent: "center",
    padding: 24,
  },
  placeholderTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  placeholderText: {
    color: "#AAB3D1",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
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
  actions: {
    gap: 12,
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
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#202944",
    borderRadius: 8,
    minHeight: 50,
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
});

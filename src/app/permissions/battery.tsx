import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useAccentTheme } from "@/features/app/accentStore";
import { preferencesRepository } from "@/features/storage/repositories";

export default function BatteryPermissionScreen() {
  const router = useRouter();
  const { accentTheme } = useAccentTheme();
  const [openedSettings, setOpenedSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handlePrimaryAction() {
    if (!openedSettings) {
      setOpenedSettings(true);
      await Linking.openSettings();
      return;
    }

    setBusy(true);

    try {
      await preferencesRepository.writeBatteryInstructionAcknowledged(true);
      router.replace("/");
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
          <Text style={styles.title}>Отключи ограничение батареи</Text>
          <Text style={styles.subtitle}>
            Некоторые Android-смартфоны могут останавливать запись прогулки в
            фоне. Отключите ограничение батареи для WalkMap, затем вернитесь
            сюда и нажмите «Далее».
          </Text>
        </View>

        <View style={styles.screenshotFrame}>
          <Image
            resizeMode="contain"
            source={require("@/assets/Battery.png")}
            style={styles.screenshot}
          />
        </View>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: openedSettings ? "#27AE60" : "#F6C343" },
            ]}
          />
          <Text style={styles.statusText}>
            {openedSettings
              ? "Готово к продолжению"
              : "Откройте настройки батареи"}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        disabled={busy}
        onPress={handlePrimaryAction}
        style={[
          styles.primaryButton,
          { backgroundColor: openedSettings ? "#27AE60" : accentTheme.color },
          busy && styles.disabledButton,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {openedSettings ? "Далее" : "Открыть настройки"}
        </Text>
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
    lineHeight: 21,
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

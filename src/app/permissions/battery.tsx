import { useRouter } from "expo-router";
import { useState } from "react";
import {
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
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function goNext() {
    if (!confirmed) {
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
            На Android это помогает не прерывать запись маршрута, когда телефон
            лежит в кармане или экран выключен.
          </Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Место для скриншота</Text>
          <Text style={styles.placeholderText}>
            Сюда можно добавить картинку с настройкой батареи для WalkMap.
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => Linking.openSettings()}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Открыть настройки</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setConfirmed(true)}
          style={[
            styles.confirmRow,
            confirmed && {
              borderColor: accentTheme.color,
              backgroundColor: "#17233A",
            },
          ]}
        >
          <View
            style={[
              styles.checkbox,
              confirmed && {
                backgroundColor: accentTheme.color,
                borderColor: accentTheme.color,
              },
            ]}
          />
          <Text style={styles.confirmText}>
            Я отключил ограничение батареи для WalkMap
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        disabled={!confirmed || busy}
        onPress={goNext}
        style={[
          styles.primaryButton,
          { backgroundColor: accentTheme.color },
          (!confirmed || busy) && styles.disabledButton,
        ]}
      >
        <Text style={styles.primaryButtonText}>Дальше</Text>
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
  confirmRow: {
    alignItems: "center",
    backgroundColor: "#151C33",
    borderColor: "#263156",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  checkbox: {
    borderColor: "#AAB3D1",
    borderRadius: 5,
    borderWidth: 2,
    height: 22,
    width: 22,
  },
  confirmText: {
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

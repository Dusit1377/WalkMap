import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { useAccentTheme } from "@/features/app/accentStore";
import { createLocalProfile, normalizeNickname } from "@/features/app/profile";
import { ACCENT_THEMES, type AccentThemeId } from "@/features/app/theme";
import {
  activeWalkRepository,
  coverageRepository,
  historyRepository,
  profileRepository,
  progressRepository,
} from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import type { LocalProfile } from "@/features/walkmap/domain";

const BACKGROUND_LOCATION_TASK = "walkmap_background_location_task";

export default function SettingsScreen() {
  const router = useRouter();
  const { accentId, accentTheme, setAccentTheme } = useAccentTheme();
  const [backgroundRecordingEnabled, setBackgroundRecordingEnabled] =
    useState(false);
  const [backgroundRecordingLabel, setBackgroundRecordingLabel] =
    useState("Неизвестно");
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      await initializeSQLiteStorage();
      const savedProfile = await profileRepository.readProfile(normalizeNickname);

      if (!mounted) return;

      setProfile(savedProfile);
      setNicknameDraft(savedProfile?.nickname ?? "");
      await refreshBackgroundRecordingStatus();
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  async function refreshBackgroundRecordingStatus() {
    try {
      const backgroundPermission = await Location.getBackgroundPermissionsAsync();
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
      );
      setBackgroundRecordingEnabled(hasStarted);
      setBackgroundRecordingLabel(
        hasStarted
          ? "Активна"
          : backgroundPermission.status === "granted"
            ? "Включится во время прогулки"
            : "Нужно разрешение",
      );
    } catch {
      setBackgroundRecordingEnabled(false);
      setBackgroundRecordingLabel("Неизвестно");
    }
  }

  async function stopBackgroundLocation() {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
      );

      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } finally {
      setBackgroundRecordingEnabled(false);
      setBackgroundRecordingLabel("Включится во время прогулки");
    }
  }

  async function handleAccentThemeSelect(themeId: AccentThemeId) {
    try {
      await setAccentTheme(themeId);
    } catch {
      Alert.alert(
        "Не удалось сохранить цвет",
        "Цвет применён сейчас, но может не сохраниться после перезапуска.",
      );
    }
  }

  async function handleSaveNickname() {
    setBusy(true);

    try {
      const nextProfile = profile
        ? { ...profile, nickname: normalizeNickname(nicknameDraft) }
        : createLocalProfile(nicknameDraft);

      await profileRepository.writeProfile(nextProfile);
      setProfile(nextProfile);
      setNicknameDraft(nextProfile.nickname);
      Alert.alert("Ник изменён", "Прогресс и история остались на месте.");
    } catch {
      Alert.alert(
        "Не удалось сохранить ник",
        "Проверь память устройства и попробуй снова.",
      );
    } finally {
      setBusy(false);
    }
  }

  function showBatteryHelp() {
    Alert.alert(
      "Фоновая запись",
      "Чтобы WalkMap стабильнее записывал прогулку с заблокированным экраном, разреши геолокацию в фоне и отключи ограничение батареи для приложения в настройках Android.",
      [
        { text: "Позже", style: "cancel" },
        { text: "Открыть настройки", onPress: () => Linking.openSettings() },
      ],
    );
  }

  function askResetData() {
    Alert.alert(
      "Сбросить прогресс?",
      "Будут удалены прогулки, история и открытая территория. Профиль и цвет останутся.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить",
          style: "destructive",
          onPress: () => {
            void resetProgressData();
          },
        },
      ],
    );
  }

  function askResetApplication() {
    Alert.alert(
      "Сбросить всё приложение?",
      "Будут удалены прогулки, история, открытая территория, ник и выбранный цвет.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить всё",
          style: "destructive",
          onPress: () => {
            void resetApplication();
          },
        },
      ],
    );
  }

  async function resetApplication() {
    await resetProgressData();
    await profileRepository.clearProfileSettings();
    setProfile(null);
    setNicknameDraft("");
    const defaultAccent = ACCENT_THEMES[0].id;
    await setAccentTheme(defaultAccent);
  }

  async function resetProgressData() {
    await stopBackgroundLocation();
    await activeWalkRepository.clearActiveWalk();
    await progressRepository.clearProgressData();
    await coverageRepository.writeCoverageRoutes([]);
    await historyRepository.writeHistory([]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <View>
          <Text style={styles.title}>Настройки</Text>
          <Text style={styles.subtitle}>Профиль и запись прогулок</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.cardTitle}>Цвет приложения</Text>
              <Text style={styles.cardSubtitle}>Акцент применяется сразу</Text>
            </View>
            <Text style={[styles.currentAccent, { color: accentTheme.color }]}>
              {accentTheme.title}
            </Text>
          </View>

          <View style={styles.accentOptionsRow}>
            {ACCENT_THEMES.map((theme) => {
              const selected = theme.id === accentId;

              return (
                <TouchableOpacity
                  key={theme.id}
                  accessibilityLabel={`Выбрать ${theme.title}`}
                  style={[
                    styles.accentOption,
                    {
                      borderColor: selected
                        ? theme.color
                        : "rgba(255,255,255,0.12)",
                      backgroundColor: selected
                        ? theme.soft
                        : "rgba(21, 28, 51, 0.92)",
                    },
                  ]}
                  onPress={() => handleAccentThemeSelect(theme.id)}
                >
                  <View
                    style={[styles.accentSwatch, { backgroundColor: theme.color }]}
                  >
                    {selected ? (
                      <Text style={[styles.accentCheck, { color: theme.foreground }]}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Фоновая запись</Text>
            <View style={styles.backgroundStatusMeta}>
              <View
                style={[
                  styles.backgroundStatusDot,
                  backgroundRecordingEnabled
                    ? { backgroundColor: accentTheme.color }
                    : styles.backgroundStatusDotOff,
                ]}
              />
              <Text
                style={[
                  styles.backgroundStatusText,
                  backgroundRecordingEnabled
                    ? { color: accentTheme.color }
                    : styles.backgroundStatusTextOff,
                ]}
              >
                {backgroundRecordingLabel}
              </Text>
            </View>
          </View>

          {!backgroundRecordingEnabled && (
            <View style={styles.backgroundActionsRow}>
              <TouchableOpacity
                style={[
                  styles.backgroundActionButton,
                  { backgroundColor: accentTheme.color },
                ]}
                onPress={showBatteryHelp}
              >
                <Text
                  style={[
                    styles.backgroundActionText,
                    { color: accentTheme.foreground },
                  ]}
                >
                  Настроить
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backgroundActionButtonSecondary}
                onPress={refreshBackgroundRecordingStatus}
              >
                <Text style={styles.backgroundActionTextSecondary}>
                  Проверить
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Локальный профиль</Text>
          <Text style={styles.accountName} numberOfLines={1}>
            {profile?.nickname ?? "Гость"}
          </Text>
          <TextInput
            style={styles.nicknameInput}
            value={nicknameDraft}
            onChangeText={(value) => setNicknameDraft(value.slice(0, 220))}
            placeholder="Гость"
            placeholderTextColor="#6F7A99"
            maxLength={220}
          />
          <TouchableOpacity
            style={[
              styles.nicknameSaveButton,
              { backgroundColor: accentTheme.color },
              busy && styles.disabledButton,
            ]}
            onPress={handleSaveNickname}
            disabled={busy}
          >
            <Text
              style={[styles.nicknameSaveText, { color: accentTheme.foreground }]}
            >
              Изменить ник
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.dangerButton} onPress={askResetData}>
          <Text style={styles.dangerText}>Сбросить прогресс</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dangerButton} onPress={askResetApplication}>
          <Text style={styles.dangerText}>Сбросить всё приложение</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1020",
    paddingTop: 46,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: "#151C33",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  cardSubtitle: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  currentAccent: {
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
  backgroundStatusMeta: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
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
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
  },
  backgroundStatusTextOff: {
    color: "#AAB3D1",
  },
  backgroundActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 10,
  },
  backgroundActionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  backgroundActionButtonSecondary: {
    flex: 1,
    borderRadius: 8,
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
  accountName: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  nicknameInput: {
    backgroundColor: "#10182D",
    borderRadius: 8,
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
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  nicknameSaveText: {
    fontSize: 14,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.6,
  },
  dangerButton: {
    backgroundColor: "rgba(235, 87, 87, 0.16)",
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 10,
  },
  dangerText: {
    color: "#FF8A8A",
    fontSize: 14,
    fontWeight: "900",
  },
});

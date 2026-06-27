import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getAchievements } from "@/features/achievements/getAchievements";
import { getAccentTheme } from "@/features/app/theme";
import {
  historyRepository,
  preferencesRepository,
} from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import { getProgressStats } from "@/features/statistics/calculations";
import type { WalkHistoryItem } from "@/features/walkmap/domain";

export default function ProfileAchievementsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WalkHistoryItem[]>([]);
  const [accentId, setAccentId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAchievements() {
      try {
        await initializeSQLiteStorage();
        const [nextHistory, nextAccentId] = await Promise.all([
          historyRepository.readHistory(),
          preferencesRepository.readAccentColor(),
        ]);

        if (!mounted) return;

        setHistory(nextHistory);
        setAccentId(nextAccentId);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadAchievements();

    return () => {
      mounted = false;
    };
  }, []);

  const accentTheme = getAccentTheme(accentId);
  const achievements = getAchievements(getProgressStats([], history));
  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.isUnlocked,
  );

  if (loading) {
    return (
      <View style={styles.centeredScreen}>
        <ActivityIndicator color={accentTheme.color} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Достижения</Text>
          <Text style={styles.subtitle}>
            Открыто: {unlockedAchievements.length}/{achievements.length}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {achievements.map((achievement) => (
          <View
            key={achievement.id}
            style={[
              styles.achievementItem,
              achievement.isUnlocked
                ? styles.achievementUnlocked
                : styles.achievementLocked,
            ]}
          >
            <Text style={[styles.achievementIcon, { color: accentTheme.color }]}>
              {achievement.isUnlocked ? "★" : "☆"}
            </Text>
            <View style={styles.achievementTextBlock}>
              <Text style={styles.achievementTitle}>{achievement.title}</Text>
              <Text style={styles.achievementDescription}>
                {achievement.description}
              </Text>
            </View>
          </View>
        ))}
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
  centeredScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1020",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "#151C33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "800",
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
  achievementItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
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

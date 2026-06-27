import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { getAchievements } from "@/features/achievements/getAchievements";
import { useAccentTheme } from "@/features/app/accentStore";
import { historyRepository } from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import { getProgressStats } from "@/features/statistics/calculations";
import type { WalkHistoryItem } from "@/features/walkmap/domain";

export default function ProfileAchievementsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WalkHistoryItem[]>([]);
  const { accentTheme } = useAccentTheme();

  useEffect(() => {
    let mounted = true;

    async function loadAchievements() {
      try {
        await initializeSQLiteStorage();
        const nextHistory = await historyRepository.readHistory();

        if (!mounted) return;

        setHistory(nextHistory);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadAchievements();

    return () => {
      mounted = false;
    };
  }, []);

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
        <HeaderBackButton onPress={() => router.back()} />
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

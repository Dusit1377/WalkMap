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
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { getAchievements } from "@/features/achievements/getAchievements";
import { useAccentTheme } from "@/features/app/accentStore";
import { formatKm } from "@/features/app/format";
import {
  historyRepository,
  profileRepository,
} from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import { getProgressStats } from "@/features/statistics/calculations";
import { normalizeNickname } from "@/features/app/profile";
import type { LocalProfile, WalkHistoryItem } from "@/features/walkmap/domain";

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [history, setHistory] = useState<WalkHistoryItem[]>([]);
  const { accentTheme } = useAccentTheme();

  useEffect(() => {
    let mounted = true;

    async function loadProfileScreen() {
      try {
        await initializeSQLiteStorage();
        const [nextProfile, nextHistory] = await Promise.all([
          profileRepository.readProfile(normalizeNickname),
          historyRepository.readHistory(),
        ]);

        if (!mounted) return;

        setProfile(nextProfile);
        setHistory(nextHistory);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadProfileScreen();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = getProgressStats([], history);
  const achievements = getAchievements(stats);
  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.isUnlocked,
  );
  const nickname = profile?.nickname ?? "Гость";
  const initial = nickname.slice(0, 1).toUpperCase();

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
          <Text style={styles.title}>Профиль</Text>
          <Text style={styles.subtitle}>Твой прогресс WalkMap</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.avatar, { backgroundColor: accentTheme.color }]}>
            <Text style={[styles.avatarText, { color: accentTheme.foreground }]}>
              {initial}
            </Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.name}>{nickname}</Text>
            <Text style={styles.profileLabel}>Локальный профиль</Text>
            <Text style={[styles.level, { color: accentTheme.color }]}>
              Ур. {stats.levelInfo.level} · {stats.levelInfo.title}
            </Text>
          </View>
        </View>

        <View style={styles.levelCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Прогресс уровня</Text>
            <Text style={[styles.levelPercent, { color: accentTheme.color }]}>
              {stats.levelInfo.progressPercent}%
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${stats.levelInfo.progressPercent}%`,
                  backgroundColor: accentTheme.color,
                },
              ]}
            />
          </View>
          <Text style={styles.mutedText}>
            {stats.levelInfo.distanceToNextLevelKm > 0
              ? `До следующего уровня: ${stats.levelInfo.distanceToNextLevelKm} км`
              : "Максимальный уровень"}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatKm(stats.totalDistanceKm)}</Text>
            <Text style={styles.statLabel}>всего км</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{history.length}</Text>
            <Text style={styles.statLabel}>прогулок</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.streak}</Text>
            <Text style={styles.statLabel}>серия</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {unlockedAchievements.length}/{achievements.length}
            </Text>
            <Text style={styles.statLabel}>наград</Text>
          </View>
        </View>

        <View style={styles.menuList}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push("/profile/statistics")}
          >
            <Text style={styles.menuTitle}>Статистика</Text>
            <Text style={styles.menuMeta}>{formatKm(stats.totalDistanceKm)} км</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push("/profile/history")}
          >
            <Text style={styles.menuTitle}>История прогулок</Text>
            <Text style={styles.menuMeta}>{history.length}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push("/profile/achievements")}
          >
            <Text style={styles.menuTitle}>Достижения</Text>
            <Text style={styles.menuMeta}>
              {unlockedAchievements.length}/{achievements.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push("/settings")}
          >
            <Text style={styles.menuTitle}>Настройки профиля</Text>
            <Text style={styles.menuMeta}>›</Text>
          </TouchableOpacity>
        </View>
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
  hero: {
    backgroundColor: "#151C33",
    borderRadius: 8,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "900",
  },
  heroText: {
    flex: 1,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  profileLabel: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  level: {
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8,
  },
  levelCard: {
    backgroundColor: "#151C33",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
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
  levelPercent: {
    fontSize: 14,
    fontWeight: "900",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#26304D",
    overflow: "hidden",
    marginTop: 14,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  mutedText: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "48%",
    minHeight: 86,
    borderRadius: 8,
    padding: 14,
    justifyContent: "center",
    backgroundColor: "#151C33",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
  menuList: {
    marginTop: 12,
  },
  menuRow: {
    minHeight: 54,
    borderRadius: 8,
    backgroundColor: "#151C33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  menuMeta: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 12,
  },
});

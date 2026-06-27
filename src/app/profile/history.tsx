import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { getAchievements } from "@/features/achievements/getAchievements";
import { useAccentTheme } from "@/features/app/accentStore";
import { formatKm, formatTime } from "@/features/app/format";
import { historyRepository } from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import { getProgressStats } from "@/features/statistics/calculations";
import type { Achievement, WalkHistoryItem } from "@/features/walkmap/domain";

export default function ProfileHistoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WalkHistoryItem[]>([]);
  const { accentTheme } = useAccentTheme();

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      try {
        await initializeSQLiteStorage();
        const nextHistory = await historyRepository.readHistory();

        if (!mounted) return;

        setHistory(nextHistory);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      mounted = false;
    };
  }, []);

  const achievements = getAchievements(getProgressStats([], history));

  function getAchievementById(id: string) {
    return achievements.find((achievement) => achievement.id === id);
  }

  function renderHistoryItem({
    item,
    index,
  }: {
    item: WalkHistoryItem;
    index: number;
  }) {
    const itemAchievements = item.achievementsUnlocked
      ?.map(getAchievementById)
      .filter(Boolean) as Achievement[] | undefined;

    return (
      <View style={styles.historyItem}>
        <View style={styles.historyTopRow}>
          <Text style={styles.historyTitle}>
            Прогулка #{history.length - index}
          </Text>
          <Text style={styles.historyDate}>{item.date}</Text>
        </View>

        <View style={styles.historyStatsRow}>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Км</Text>
            <Text style={styles.historyStatValue}>
              {formatKm(item.distanceKm)}
            </Text>
          </View>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Время</Text>
            <Text style={styles.historyStatValue}>
              {formatTime(item.durationSec)}
            </Text>
          </View>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Новые</Text>
            <Text style={styles.historyStatValue}>-</Text>
          </View>
          <View style={styles.historyStat}>
            <Text style={styles.historyStatLabel}>Всего</Text>
            <Text style={styles.historyStatValue}>-</Text>
          </View>
        </View>

        {itemAchievements && itemAchievements.length > 0 && (
          <Text style={[styles.historyAchievementText, { color: accentTheme.color }]}>
            * {itemAchievements.map((achievement) => achievement.title).join(", ")}
          </Text>
        )}
      </View>
    );
  }

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
          <Text style={styles.title}>История прогулок</Text>
          <Text style={styles.subtitle}>Всего прогулок: {history.length}</Text>
        </View>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderHistoryItem}
        contentContainerStyle={[
          styles.content,
          history.length === 0 && styles.emptyContent,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Пока пусто</Text>
            <Text style={styles.emptyText}>
              Заверши первую прогулку, и она появится здесь.
            </Text>
          </View>
        }
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        showsVerticalScrollIndicator={false}
      />
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
  emptyContent: {
    flexGrow: 1,
  },
  emptyBox: {
    backgroundColor: "#151C33",
    borderRadius: 8,
    padding: 18,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyText: {
    color: "#AAB3D1",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  historyItem: {
    backgroundColor: "#151C33",
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  historyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  historyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  historyDate: {
    color: "#AAB3D1",
    fontSize: 12,
    fontWeight: "700",
  },
  historyStatsRow: {
    flexDirection: "row",
    gap: 10,
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
    fontSize: 12,
    fontWeight: "900",
    marginTop: 10,
  },
});

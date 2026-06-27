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
import { formatKm, formatSpeedKmh, formatTime } from "@/features/app/format";
import { getAccentTheme } from "@/features/app/theme";
import {
  historyRepository,
  preferencesRepository,
} from "@/features/storage/repositories";
import { initializeSQLiteStorage } from "@/features/storage/sqlite/bootstrap";
import { getProgressStats } from "@/features/statistics/calculations";
import type { WalkHistoryItem } from "@/features/walkmap/domain";

const UNLOCK_RADIUS_METERS = 48;

function formatArea(value: number) {
  if (value < 1) {
    return `${Math.round(value * 1_000_000)} м²`;
  }

  return `${value.toFixed(2).replace(".", ",")} км²`;
}

export default function ProfileStatisticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WalkHistoryItem[]>([]);
  const [accentId, setAccentId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStatistics() {
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

    void loadStatistics();

    return () => {
      mounted = false;
    };
  }, []);

  const accentTheme = getAccentTheme(accentId);
  const stats = getProgressStats([], history);
  const openedAreaKm2 = Math.max(
    0,
    stats.totalDistanceKm * ((UNLOCK_RADIUS_METERS * 2) / 1000),
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
          <Text style={styles.title}>Статистика</Text>
          <Text style={styles.subtitle}>Твой прогресс WalkMap</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{history.length}</Text>
            <Text style={styles.statLabel}>прогулок</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatKm(stats.totalDistanceKm)}</Text>
            <Text style={styles.statLabel}>км всего</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatTime(stats.totalDurationSec)}</Text>
            <Text style={styles.statLabel}>в пути</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatSpeedKmh(stats.avgSpeedKmh)}</Text>
            <Text style={styles.statLabel}>средняя скорость</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{formatKm(stats.longestWalkKm)}</Text>
            <Text style={styles.statLabel}>лучший маршрут</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{stats.streak}</Text>
            <Text style={styles.statLabel}>дней серия</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Примерная открытая площадь</Text>
          <Text style={[styles.infoValue, { color: accentTheme.color }]}>
            {formatArea(openedAreaKm2)}
          </Text>
          <Text style={styles.infoHint}>
            Расчёт приблизительный, потому что территория строится по GPS-радиусу.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Дневная цель</Text>
          <Text style={[styles.infoValue, { color: accentTheme.color }]}>
            {stats.dailyProgress.distanceGoalPercent}%
          </Text>
          <Text style={styles.infoHint}>
            Сегодня: {stats.dailyProgress.walks} прогулок ·{" "}
            {formatKm(stats.dailyProgress.distanceKm)} км
          </Text>
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "48%",
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: "#151C33",
    padding: 14,
    justifyContent: "center",
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
  infoCard: {
    backgroundColor: "#151C33",
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
  },
  infoLabel: {
    color: "#AAB3D1",
    fontSize: 13,
    fontWeight: "800",
  },
  infoValue: {
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  infoHint: {
    color: "#AAB3D1",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});

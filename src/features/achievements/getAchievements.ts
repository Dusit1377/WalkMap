import type { Achievement } from "@/features/walkmap/domain";
import type { getProgressStats } from "@/features/statistics/calculations";

type ProgressStats = ReturnType<typeof getProgressStats>;

export function getAchievements(stats: ProgressStats): Achievement[] {
  return [
    {
      id: "first_walk",
      title: "Первый след",
      description: "Заверши первую прогулку",
      isUnlocked: stats.totalWalks >= 1,
    },
    {
      id: "one_km_total",
      title: "Первый километр",
      description: "Пройди 1 км суммарно",
      isUnlocked: stats.totalDistanceKm >= 1,
    },
    {
      id: "five_km_total",
      title: "Уже райончик",
      description: "Пройди 5 км суммарно",
      isUnlocked: stats.totalDistanceKm >= 5,
    },
    {
      id: "five_walks",
      title: "Маршрут вошёл в привычку",
      description: "Заверши 5 прогулок",
      isUnlocked: stats.totalWalks >= 5,
    },
    {
      id: "ten_km_total",
      title: "Город начал открываться",
      description: "Пройди 10 км суммарно",
      isUnlocked: stats.totalDistanceKm >= 10,
    },
    {
      id: "twenty_minutes",
      title: "Нормальная прогулка",
      description: "Заверши прогулку на 20+ минут",
      isUnlocked: stats.longestWalkSec >= 20 * 60,
    },
    {
      id: "daily_goal",
      title: "Цель дня",
      description: "Выполни дневную цель",
      isUnlocked: stats.dailyProgress.isGoalDone,
    },
    {
      id: "three_day_streak",
      title: "Серия началась",
      description: "Гуляй 3 дня подряд",
      isUnlocked: stats.streak >= 3,
    },
  ];
}

export function getNewAchievements(
  previousStats: ProgressStats,
  nextStats: ProgressStats,
) {
  const previousUnlockedIds = getAchievements(previousStats)
    .filter((achievement) => achievement.isUnlocked)
    .map((achievement) => achievement.id);

  return getAchievements(nextStats).filter(
    (achievement) =>
      achievement.isUnlocked && !previousUnlockedIds.includes(achievement.id),
  );
}

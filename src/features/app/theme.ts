export const ACCENT_THEMES = [
  {
    id: "mint",
    title: "Бирюзовый",
    color: "#35E6B7",
    soft: "rgba(53, 230, 183, 0.16)",
    border: "rgba(53, 230, 183, 0.34)",
    foreground: "#06111F",
  },
  {
    id: "blue",
    title: "Синий",
    color: "#4D96FF",
    soft: "rgba(77, 150, 255, 0.16)",
    border: "rgba(77, 150, 255, 0.34)",
    foreground: "#FFFFFF",
  },
  {
    id: "violet",
    title: "Фиолетовый",
    color: "#9B7CFF",
    soft: "rgba(155, 124, 255, 0.17)",
    border: "rgba(155, 124, 255, 0.36)",
    foreground: "#FFFFFF",
  },
  {
    id: "orange",
    title: "Оранжевый",
    color: "#FFB84D",
    soft: "rgba(255, 184, 77, 0.17)",
    border: "rgba(255, 184, 77, 0.36)",
    foreground: "#201204",
  },
  {
    id: "rose",
    title: "Розовый",
    color: "#FF6B8A",
    soft: "rgba(255, 107, 138, 0.17)",
    border: "rgba(255, 107, 138, 0.36)",
    foreground: "#FFFFFF",
  },
] as const;

export type AccentThemeId = (typeof ACCENT_THEMES)[number]["id"];
export type AccentTheme = (typeof ACCENT_THEMES)[number];

export function getAccentTheme(themeId: string | null | undefined) {
  return ACCENT_THEMES.find((theme) => theme.id === themeId) ?? ACCENT_THEMES[0];
}

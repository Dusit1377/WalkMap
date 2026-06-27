import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  ACCENT_THEMES,
  type AccentThemeId,
  getAccentTheme,
} from "@/features/app/theme";
import { preferencesRepository } from "@/features/storage/repositories";

type AccentListener = () => void;

let currentAccentId: AccentThemeId = ACCENT_THEMES[0].id;
let loaded = false;
const listeners = new Set<AccentListener>();

function isAccentThemeId(value: string | null | undefined): value is AccentThemeId {
  return ACCENT_THEMES.some((theme) => theme.id === value);
}

function emitAccentChange() {
  listeners.forEach((listener) => listener());
}

function setMemoryAccent(themeId: string | null | undefined) {
  const nextAccentId = isAccentThemeId(themeId) ? themeId : ACCENT_THEMES[0].id;

  if (currentAccentId === nextAccentId && loaded) {
    return;
  }

  currentAccentId = nextAccentId;
  loaded = true;
  emitAccentChange();
}

export async function loadAccentTheme() {
  const savedAccent = await preferencesRepository.readAccentColor();
  setMemoryAccent(savedAccent);
  return currentAccentId;
}

export async function setAccentTheme(themeId: AccentThemeId) {
  setMemoryAccent(themeId);
  await preferencesRepository.writeAccentColor(themeId);
}

export function resetAccentThemeInMemory() {
  setMemoryAccent(ACCENT_THEMES[0].id);
}

function subscribe(listener: AccentListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentAccentId;
}

export function useAccentTheme() {
  const accentId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!loaded) {
      void loadAccentTheme();
    }
  }, []);

  const updateAccentTheme = useCallback((themeId: AccentThemeId) => {
    return setAccentTheme(themeId);
  }, []);

  return {
    accentId,
    accentTheme: getAccentTheme(accentId),
    setAccentTheme: updateAccentTheme,
  };
}

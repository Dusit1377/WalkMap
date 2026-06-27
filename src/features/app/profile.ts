import type { LocalProfile } from "@/features/walkmap/domain";

export function normalizeNickname(nickname: string) {
  const cleanNickname = nickname.trim().slice(0, 220);
  return cleanNickname.length > 0 ? cleanNickname : "Гость";
}

export function createLocalProfile(nickname: string): LocalProfile {
  return {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    nickname: normalizeNickname(nickname),
    createdAt: Date.now(),
  };
}

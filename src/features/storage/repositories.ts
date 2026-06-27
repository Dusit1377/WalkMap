import type {
  ActiveWalkData,
  CoverageRoute,
  LocalProfile,
  WalkHistoryItem,
  WalkPoint,
} from "@/features/walkmap/domain";
import {
  hasLegacyLocalProgressInStorage,
  readAccentColorFromStorage,
  readActiveWalkFromStorage,
  readCoverageRoutesFromStorage,
  readHistoryFromStorage,
  readLastLocationFromStorage,
  readLegacyProfileNicknameFromStorage,
  readLocalProfileFromStorage,
  readOpenedCellsFromStorage,
  readStorageVersionFromStorage,
  removeActiveWalkFromStorage,
  removeProfileSettingsFromStorage,
  removeProgressDataFromStorage,
  saveAccentColorToStorage,
  saveActiveWalkToStorage,
  saveCoverageRoutesToStorage,
  saveHistoryToStorage,
  saveLastLocationToStorage,
  writeLocalProfileToStorage,
  writeStorageVersionToStorage,
} from "@/features/storage/walkmapStorage";

export const preferencesRepository = {
  readAccentColor: readAccentColorFromStorage,
  writeAccentColor: saveAccentColorToStorage,
  readStorageVersion: readStorageVersionFromStorage,
  writeStorageVersion: writeStorageVersionToStorage,
};

export const activeWalkRepository = {
  readActiveWalk: readActiveWalkFromStorage,
  writeActiveWalk: saveActiveWalkToStorage,
  clearActiveWalk: removeActiveWalkFromStorage,
};

export const historyRepository = {
  async readHistory() {
    return readHistoryFromStorage() as Promise<WalkHistoryItem[]>;
  },
  writeHistory: saveHistoryToStorage,
};

export const coverageRepository = {
  async readCoverageRoutes() {
    return readCoverageRoutesFromStorage() as Promise<CoverageRoute[]>;
  },
  writeCoverageRoutes: saveCoverageRoutesToStorage,
};

export const profileRepository = {
  readProfile: readLocalProfileFromStorage,
  writeProfile: writeLocalProfileToStorage,
  hasLegacyLocalProgress: hasLegacyLocalProgressInStorage,
  readLegacyProfileNickname: readLegacyProfileNicknameFromStorage,
  clearProfileSettings: removeProfileSettingsFromStorage,
};

export const lastLocationRepository = {
  readLastLocation: readLastLocationFromStorage,
  writeLastLocation: saveLastLocationToStorage,
};

export const openedCellsRepository = {
  async readOpenedCells() {
    return readOpenedCellsFromStorage() as Promise<string[]>;
  },
};

export const progressRepository = {
  clearProgressData: removeProgressDataFromStorage,
};

export type {
  ActiveWalkData,
  CoverageRoute,
  LocalProfile,
  WalkHistoryItem,
  WalkPoint,
};

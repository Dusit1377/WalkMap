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
  readBatteryInstructionAckFromStorage,
  readCoverageRoutesFromStorage,
  readHistoryFromStorage,
  readLastLocationFromStorage,
  readLegacyProfileNicknameFromStorage,
  readLocalProfileFromStorage,
  readOpenedCellsFromStorage,
  readStorageVersionFromStorage,
  removeActiveWalkFromStorage,
  removeLocalProfileFromStorage,
  removeProfileSettingsFromStorage,
  removeProgressDataFromStorage,
  saveAccentColorToStorage,
  saveActiveWalkToStorage,
  saveBatteryInstructionAckToStorage,
  saveCoverageRoutesToStorage,
  saveHistoryToStorage,
  saveLastLocationToStorage,
  writeLocalProfileToStorage,
  writeStorageVersionToStorage,
} from "@/features/storage/walkmapStorage";
import {
  clearActiveWalkFromSQLite,
  readActiveWalkFromSQLite,
  saveActiveWalkToSQLite,
} from "@/features/storage/sqlite/activeWalkRepository";
import {
  clearCoverageRoutesFromSQLite,
  readCoverageRoutesFromSQLite,
  saveCoverageRoutesToSQLite,
} from "@/features/storage/sqlite/coverageRepository";
import {
  clearHistoryFromSQLite,
  readHistoryFromSQLite,
  saveHistoryToSQLite,
} from "@/features/storage/sqlite/historyRepository";
import { isAsyncStorageToSQLiteMigrationComplete } from "@/features/storage/sqlite/migrations";

export const preferencesRepository = {
  readAccentColor: readAccentColorFromStorage,
  writeAccentColor: saveAccentColorToStorage,
  readStorageVersion: readStorageVersionFromStorage,
  writeStorageVersion: writeStorageVersionToStorage,
  readBatteryInstructionAcknowledged: readBatteryInstructionAckFromStorage,
  writeBatteryInstructionAcknowledged: saveBatteryInstructionAckToStorage,
};

export const activeWalkRepository = {
  async readActiveWalk() {
    const sqliteActiveWalk = await readActiveWalkFromSQLite();

    if (sqliteActiveWalk || (await isAsyncStorageToSQLiteMigrationComplete())) {
      return sqliteActiveWalk;
    }

    return readActiveWalkFromStorage();
  },
  async writeActiveWalk(activeWalk: ActiveWalkData) {
    if (!(await saveActiveWalkToSQLite(activeWalk))) {
      await saveActiveWalkToStorage(activeWalk);
    }
  },
  async clearActiveWalk() {
    await clearActiveWalkFromSQLite();
    await removeActiveWalkFromStorage();
  },
};

export const historyRepository = {
  async readHistory() {
    const sqliteHistory = await readHistoryFromSQLite();

    if (sqliteHistory.length > 0 || (await isAsyncStorageToSQLiteMigrationComplete())) {
      return sqliteHistory;
    }

    return readHistoryFromStorage() as Promise<WalkHistoryItem[]>;
  },
  async writeHistory(nextHistory: WalkHistoryItem[]) {
    if (!(await saveHistoryToSQLite(nextHistory))) {
      await saveHistoryToStorage(nextHistory);
    }
  },
};

export const coverageRepository = {
  async readCoverageRoutes() {
    const sqliteRoutes = await readCoverageRoutesFromSQLite();

    if (sqliteRoutes.length > 0 || (await isAsyncStorageToSQLiteMigrationComplete())) {
      return sqliteRoutes;
    }

    return readCoverageRoutesFromStorage() as Promise<CoverageRoute[]>;
  },
  async writeCoverageRoutes(nextCoverageRoutes: CoverageRoute[]) {
    if (!(await saveCoverageRoutesToSQLite(nextCoverageRoutes))) {
      await saveCoverageRoutesToStorage(nextCoverageRoutes);
    }
  },
};

export const profileRepository = {
  readProfile: readLocalProfileFromStorage,
  writeProfile: writeLocalProfileToStorage,
  hasLegacyLocalProgress: hasLegacyLocalProgressInStorage,
  readLegacyProfileNickname: readLegacyProfileNicknameFromStorage,
  clearProfileSettings: removeProfileSettingsFromStorage,
  clearProfile: removeLocalProfileFromStorage,
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
  async clearProgressData() {
    await clearHistoryFromSQLite();
    await clearActiveWalkFromSQLite();
    await clearCoverageRoutesFromSQLite();
    await removeProgressDataFromStorage();
  },
};

export type {
  ActiveWalkData,
  CoverageRoute,
  LocalProfile,
  WalkHistoryItem,
  WalkPoint,
};

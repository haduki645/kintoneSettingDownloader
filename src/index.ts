import { CONSTANTS } from "./constants";
import fs from "fs/promises";
import path from "path";
import {
  getAuthHeaders,
  fetchKintoneApi,
} from "./kintone";
import { Setting, AppGroup, AppId } from "./types";
import {
  getTimestampedDirName,
  getPastResultDirs,
  cleanupOldResults,
  getReadmeContent,
  cleanJsonForComparison,
} from "./fileOps";
import {
  loadPromptTemplates,
  openWorkspace,
  resumeMain,
  processApp,
} from "./appProcessor";
import { safeRunAsync, toSafeFileName } from "./utils";

// メイン処理
const main = async () => {
  const isResumeMode = process.argv.length > 2;
  const settingPath = path.join(process.cwd(), CONSTANTS.FILE_SETTING_JSON);
  const result = await safeRunAsync({
    tryCallback: async () => {
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting: Setting = JSON.parse(settingContent);
      if (!setting.appIds && !setting.apps) {
        throw new Error("setting.json に appIds または apps パラメータが見つかりません。");
      }
      return { success: true, setting };
    },
    catchCallback: async (err) => {
      console.error("setting.json の読み取りに失敗しました:", err);
      return { success: false, setting: null as any };
    }
  });

  if (!result.success) return;
  const { setting } = result;

  const promptTemplates = await loadPromptTemplates();
  const headers = getAuthHeaders();
  const baseResultDir = path.join(process.cwd(), CONSTANTS.DIR_RESULT);

  // 過去の結果ディレクトリを取得
  const { maxCacheCount = CONSTANTS.DEFAULT_MAX_CACHE_COUNT } = setting;
  const pastDirsNames = await getPastResultDirs(baseResultDir);

  if (isResumeMode) {
    if (pastDirsNames.length === 0) {
      console.error("再開対象となる過去の結果ディレクトリが見つかりません。");
      return;
    }
    const latestDir = path.join(baseResultDir, pastDirsNames[0]);
    await resumeMain(latestDir, setting, promptTemplates);
    console.log(`\n=== 再開処理が完了しました ===`);
    return;
  }

  const pastResultDirs = pastDirsNames.slice(0, maxCacheCount).map(name => path.join(baseResultDir, name));

  // 今回の結果ディレクトリを作成
  const currentResultDirName = getTimestampedDirName();
  const resultDir = path.join(baseResultDir, currentResultDirName);

  await fs.mkdir(resultDir, { recursive: true });
  await fs.writeFile(path.join(resultDir, CONSTANTS.FILE_README_MD), getReadmeContent(), "utf-8");

  const { workspaceConfig } = setting;
  if (workspaceConfig) {
    const workspaceFileName = "kintone_settings" + CONSTANTS.SUFFIX_WORKSPACE;
    await fs.writeFile(
      path.join(resultDir, workspaceFileName),
      JSON.stringify(workspaceConfig, null, 2),
      "utf-8"
    );
    console.log(`[OK] ${workspaceFileName} を作成しました。`);
  }

  const appNameCache: Record<string, string> = {};

  // Phase 1: 全アプリのファイルをダウンロード
  const processAppsRecursive = async (ids?: AppId[], groups?: AppGroup[], currentDir?: string) => {
    const targetDir = currentDir || resultDir;
    if (ids) {
      for (const appId of ids) {
        if (typeof appId === "number") {
          await processApp(appId, setting, headers, targetDir, pastResultDirs, promptTemplates, appNameCache, true);
        } else {
          // Verify & Production Pair
          const prdId = appId.prd;
          const stgId = appId.stg;

          let prdAppName = "UnknownApp";
          if (prdId) {
            await safeRunAsync({
              tryCallback: async () => {
                const info = await fetchKintoneApi(CONSTANTS.API_APP, prdId, headers);
                prdAppName = info.name;
                appNameCache[prdId] = prdAppName;
              },
              catchCallback: async () => {
                console.warn(`[Warn] 本番アプリID: ${prdId} の名前取得に失敗しました。`);
              }
            });
          }

          const safePrdName = toSafeFileName(prdAppName);
          const pairDirName = `${prdId}_${safePrdName}`;
          const pairDir = path.join(targetDir, pairDirName);
          await fs.mkdir(pairDir, { recursive: true });

          if (stgId) {
            await processApp(stgId, setting, headers, pairDir, pastResultDirs, promptTemplates, appNameCache, true, CONSTANTS.ENV_STG);
          }
          if (prdId) {
            await processApp(prdId, setting, headers, pairDir, pastResultDirs, promptTemplates, appNameCache, true, CONSTANTS.ENV_PRD);
          }

          // WinMerge比較用に「customize」と「json」をまとめたフォルダを作成
          const stgCompareDir = path.join(pairDir, CONSTANTS.ENV_STG, CONSTANTS.DIR_WINMERGE_COMPARE);
          const prdCompareDir = path.join(pairDir, CONSTANTS.ENV_PRD, CONSTANTS.DIR_WINMERGE_COMPARE);

          await Promise.all([
            fs.mkdir(stgCompareDir, { recursive: true }).catch(() => {}),
            fs.mkdir(prdCompareDir, { recursive: true }).catch(() => {})
          ]);

          await Promise.all([
            fs.cp(path.join(pairDir, CONSTANTS.ENV_STG, CONSTANTS.DIR_CUSTOMIZE), path.join(stgCompareDir, CONSTANTS.DIR_CUSTOMIZE), { recursive: true }).catch(() => {}),
            fs.cp(path.join(pairDir, CONSTANTS.ENV_STG, CONSTANTS.DIR_JSON), path.join(stgCompareDir, CONSTANTS.DIR_JSON), { recursive: true }).catch(() => {}),
            fs.cp(path.join(pairDir, CONSTANTS.ENV_PRD, CONSTANTS.DIR_CUSTOMIZE), path.join(prdCompareDir, CONSTANTS.DIR_CUSTOMIZE), { recursive: true }).catch(() => {}),
            fs.cp(path.join(pairDir, CONSTANTS.ENV_PRD, CONSTANTS.DIR_JSON), path.join(prdCompareDir, CONSTANTS.DIR_JSON), { recursive: true }).catch(() => {})
          ]);

          // 比較用JSONから不要な属性（revision等）を除去
          await Promise.all([
            cleanJsonForComparison(path.join(stgCompareDir, CONSTANTS.DIR_JSON)),
            cleanJsonForComparison(path.join(prdCompareDir, CONSTANTS.DIR_JSON))
          ]);

          // WinMerge プロジェクトファイルの作成
          const winMergeContent = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <paths>
    <left>検証\\winmerge比較用\\</left>
    <right>本番\\winmerge比較用\\</right>
    <filter>*.*</filter>
    <subfolders>1</subfolders>
    <left-readonly>0</left-readonly>
    <right-readonly>0</right-readonly>
  </paths>
</project>`;
          await fs.writeFile(path.join(pairDir, CONSTANTS.FILE_WINMERGE_PROJECT), winMergeContent, "utf-8");
        }
      }
    }
    if (groups) {
      for (const g of groups) {
        const groupDir = path.join(targetDir, g.group);
        await fs.mkdir(groupDir, { recursive: true });
        await processAppsRecursive(g.ids, g.groups, groupDir);
      }
    }
  };

  if (setting.appIds) {
    await processAppsRecursive(setting.appIds);
  }
  if (setting.apps) {
    await processAppsRecursive(setting.apps.ids, setting.apps.groups);
  }

  // Phase 2: 全アプリのAI解析を一括実行
  const { enableAi } = setting;
  if (enableAi) {
    await resumeMain(resultDir, setting, promptTemplates);
  }

  // 古い結果を整理
  await cleanupOldResults(baseResultDir, maxCacheCount);

  console.log(`\n=== すべての処理が完了しました ===`);

  if (setting.workspaceConfig) {
    openWorkspace(path.join(resultDir, "kintone_settings" + CONSTANTS.SUFFIX_WORKSPACE));
  }
}

// 実行
main().catch(console.error);

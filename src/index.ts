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
  const settingPath = path.join(process.cwd(), "setting.json");
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
  const baseResultDir = path.join(process.cwd(), "result");

  // 過去の結果ディレクトリを取得
  const { maxCacheCount = 5 } = setting;
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
  await fs.writeFile(path.join(resultDir, "readme.md"), getReadmeContent(), "utf-8");

  const { workspaceConfig } = setting;
  if (workspaceConfig) {
    const workspaceFileName = "kintone_settings.code-workspace";
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
                const info = await fetchKintoneApi("/k/v1/app.json", prdId, headers);
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
            await processApp(stgId, setting, headers, pairDir, pastResultDirs, promptTemplates, appNameCache, true, "検証");
          }
          if (prdId) {
            await processApp(prdId, setting, headers, pairDir, pastResultDirs, promptTemplates, appNameCache, true, "本番");
          }

          // WinMerge プロジェクトファイルの作成
          const winMergeContent = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <paths>
    <left>検証\\</left>
    <right>本番\\</right>
    <filter>*.*</filter>
    <subfolders>1</subfolders>
    <left-readonly>0</left-readonly>
    <right-readonly>0</right-readonly>
  </paths>
</project>`;
          await fs.writeFile(path.join(pairDir, "検証_vs_本番.WinMerge"), winMergeContent, "utf-8");
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
    openWorkspace(path.join(resultDir, "kintone_settings.code-workspace"));
  }
}

// 実行
main().catch(console.error);

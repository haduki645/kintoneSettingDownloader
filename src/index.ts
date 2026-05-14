import fs from "fs/promises";
import path from "path";
import {
  getAuthHeaders,
} from "./kintone";
import { Setting, AppGroup } from "./types";
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
import { safeRunAsync } from "./utils";

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
    await fs.writeFile(
      path.join(resultDir, "result.code-workspace"),
      JSON.stringify(workspaceConfig, null, 2),
      "utf-8"
    );
    console.log(`[OK] result.code-workspace を作成しました。`);
  }

  const appNameCache: Record<string, string> = {};

  // Phase 1: 全アプリのファイルをダウンロード
  const processAppsRecursive = async (ids?: number[], groups?: AppGroup[], currentDir?: string) => {
    const targetDir = currentDir || resultDir;
    if (ids) {
      for (const appId of ids) {
        await processApp(appId, setting, headers, targetDir, pastResultDirs, promptTemplates, appNameCache, true);
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
    openWorkspace(path.join(resultDir, "result.code-workspace"));
  }
}

// 実行
main().catch(console.error);

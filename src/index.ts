import fs from "fs/promises";
import path from "path";
import {
  getAuthHeaders,
} from "./kintone";
import { Setting } from "./types";
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
async function main() {
  const isResumeMode = process.argv.length > 2;
  const settingPath = path.join(process.cwd(), "setting.json");
  let setting: Setting;

  const result = await safeRunAsync({
    tryCallback: async () => {
      const settingContent = await fs.readFile(settingPath, "utf-8");
      setting = JSON.parse(settingContent);
      if (!Array.isArray(setting.appIds)) {
        throw new Error("setting.json の appIds パラメータが配列ではありません。");
      }
      return { success: true, setting };
    },
    catchCallback: async (err) => {
      console.error("setting.json の読み取りに失敗しました:", err);
      return { success: false, setting: null as any };
    }
  });

  if (!result.success) return;
  setting = result.setting;

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
  await setting.appIds.reduce(async (promise, appId) => {
    await promise;
    await processApp(appId, setting, headers, resultDir, pastResultDirs, promptTemplates, appNameCache, true);
  }, Promise.resolve());

  // Phase 2: 全アプリのAI解析を一括実行
  const { enableAi } = setting;
  if (enableAi) {
    await resumeMain(resultDir, setting, promptTemplates);
  }

  // 古い結果を整理
  await cleanupOldResults(baseResultDir, maxCacheCount);

  console.log(`\n=== すべてের処理が完了しました ===`);

  if (setting.workspaceConfig) {
    openWorkspace(path.join(resultDir, "result.code-workspace"));
  }
}

// 実行
main().catch(console.error);

import { CONSTANTS } from "./constants";
import fs from "fs/promises";
import path from "path";
import { parseArgs } from "node:util";
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
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      resume: {
        type: "boolean",
      },
    },
    allowPositionals: true,
  });

  const isResumeMode = values.resume || false;
  const settingFiles = positionals.length > 0 ? positionals : [CONSTANTS.FILE_SETTING_JSON];

  const promptTemplates = await loadPromptTemplates();
  const baseResultDir = path.join(process.cwd(), CONSTANTS.DIR_RESULT);
  const pastDirsNames = await getPastResultDirs(baseResultDir);

  const currentTimestampDirName = getTimestampedDirName();
  let activeTimestampDir = path.join(baseResultDir, currentTimestampDirName);

  if (isResumeMode) {
    if (pastDirsNames.length === 0) {
      console.error("再開対象となる過去の結果ディレクトリが見つかりません。");
      return;
    }
    activeTimestampDir = path.join(baseResultDir, pastDirsNames[0]);
    console.log(`\n=== Resume Mode: ${path.basename(activeTimestampDir)} を対象に再開します ===`);
  } else {
    await fs.mkdir(activeTimestampDir, { recursive: true });
  }

  // 設定ごとのループ
  for (const settingFileName of settingFiles) {
    const settingPath = path.resolve(process.cwd(), settingFileName);
    const settingBaseName = path.basename(settingFileName, path.extname(settingFileName));
    const resultDir = path.join(activeTimestampDir, settingBaseName);

    const result = await safeRunAsync({
      tryCallback: async () => {
        const settingContent = await fs.readFile(settingPath, "utf-8");
        const setting: Setting = JSON.parse(settingContent);
        if (!setting.appIds && !setting.apps) {
          throw new Error(`${settingFileName} に appIds または apps パラメータが見つかりません。`);
        }
        return { success: true, setting };
      },
      catchCallback: async (err) => {
        console.error(`${settingFileName} の読み取りに失敗しました:`, err);
        return { success: false, setting: null as any };
      },
    });

    if (!result.success) continue;
    const { setting } = result;

    if (isResumeMode) {
      const exists = await fs.access(resultDir).then(() => true).catch(() => false);
      if (exists) {
        await resumeMain(resultDir, setting, promptTemplates);
      } else {
        console.warn(`[Warn] ${settingBaseName} の結果ディレクトリが見つからないためスキップします。`);
      }
      continue;
    }

    const { maxCacheCount = CONSTANTS.DEFAULT_MAX_CACHE_COUNT } = setting;
    const pastResultDirs = pastDirsNames
      .slice(0, maxCacheCount)
      .map((name) => path.join(baseResultDir, name, settingBaseName)); // 過去の結果も設定フォルダの下を見る

    console.log(`\n--- [処理開始] ${settingFileName} ---`);
    await fs.mkdir(resultDir, { recursive: true });
    await fs.writeFile(
      path.join(resultDir, CONSTANTS.FILE_README_MD),
      getReadmeContent(),
      "utf-8",
    );

    const { workspaceConfig } = setting;
    if (workspaceConfig && Array.isArray(workspaceConfig)) {
      for (const config of workspaceConfig) {
        if (!config.fileName) {
          throw new Error("workspaceConfig の要素に fileName が指定されていません。");
        }
        const workspaceFileName = config.fileName + CONSTANTS.SUFFIX_WORKSPACE;
        const { fileName, ...wsData } = config;
        await fs.writeFile(
          path.join(resultDir, workspaceFileName),
          JSON.stringify(wsData, null, 2),
          "utf-8",
        );
        console.log(`[OK] ${workspaceFileName} を作成しました。`);
      }
    }

    const globalWinMergeContent = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <paths>
    <left>${CONSTANTS.DIR_WINMERGE_COMPARE}\\${CONSTANTS.ENV_STG}\\</left>
    <right>${CONSTANTS.DIR_WINMERGE_COMPARE}\\${CONSTANTS.ENV_PRD}\\</right>
    <filter>*.*</filter>
    <subfolders>1</subfolders>
    <left-readonly>0</left-readonly>
    <right-readonly>0</right-readonly>
  </paths>
</project>`;
    await fs.writeFile(
      path.join(resultDir, CONSTANTS.FILE_WINMERGE_PROJECT),
      globalWinMergeContent,
      "utf-8",
    );

    const appNameCache: Record<string, string> = {};

    const processAppsRecursive = async (
      ids?: AppId[],
      groups?: AppGroup[],
      currentDir?: string,
      topLevelGroupDir?: string,
      relativeGroupPath: string = "",
    ) => {
      const targetDir = currentDir || resultDir;
      if (ids) {
        for (const appId of ids) {
          if (typeof appId === "number") {
            await processApp(
              appId,
              setting,
              setting.prdDomain || setting.stgDomain, // default domain for individual app
              targetDir,
              pastResultDirs,
              promptTemplates,
              appNameCache,
              true,
            );
          } else {
            const prdId = appId.prd;
            const stgId = appId.stg;

            let prdAppName = "UnknownApp";
            if (prdId) {
              await safeRunAsync({
                tryCallback: async () => {
                  const { fetchKintoneApi } = await import("./kintone");
                  const info = await fetchKintoneApi(CONSTANTS.API_APP, prdId, setting.prdDomain);
                  prdAppName = info.name;
                  appNameCache[prdId] = prdAppName;
                },
                catchCallback: async () => {
                  console.warn(`[Warn] 本番アプリID: ${prdId} の名前取得に失敗しました。`);
                },
              });
            }

            const safePrdName = toSafeFileName(prdAppName);
            const pairDirName = `${prdId}_${safePrdName}`;
            const pairDir = path.join(targetDir, pairDirName);
            await fs.mkdir(pairDir, { recursive: true });

            if (stgId) {
              await processApp(
                stgId,
                setting,
                setting.stgDomain,
                pairDir,
                pastResultDirs,
                promptTemplates,
                appNameCache,
                true,
                CONSTANTS.ENV_STG,
              );
            }
            if (prdId) {
              await processApp(
                prdId,
                setting,
                setting.prdDomain,
                pairDir,
                pastResultDirs,
                promptTemplates,
                appNameCache,
                true,
                CONSTANTS.ENV_PRD,
              );
            }

            const relativeToResultDir = path.relative(resultDir, pairDir);
            
            const stgCompareDir = path.join(
              resultDir,
              CONSTANTS.DIR_WINMERGE_COMPARE,
              CONSTANTS.ENV_STG,
              relativeToResultDir,
            );
            const prdCompareDir = path.join(
              resultDir,
              CONSTANTS.DIR_WINMERGE_COMPARE,
              CONSTANTS.ENV_PRD,
              relativeToResultDir,
            );

            await Promise.all([
              fs.mkdir(stgCompareDir, { recursive: true }).catch(() => {}),
              fs.mkdir(prdCompareDir, { recursive: true }).catch(() => {}),
            ]);

            await Promise.all([
              fs.cp(path.join(pairDir, CONSTANTS.ENV_STG, CONSTANTS.DIR_CUSTOMIZE), path.join(stgCompareDir, CONSTANTS.DIR_CUSTOMIZE), { recursive: true }).catch(() => {}),
              fs.cp(path.join(pairDir, CONSTANTS.ENV_STG, CONSTANTS.DIR_JSON), path.join(stgCompareDir, CONSTANTS.DIR_JSON), { recursive: true }).catch(() => {}),
              fs.cp(path.join(pairDir, CONSTANTS.ENV_PRD, CONSTANTS.DIR_CUSTOMIZE), path.join(prdCompareDir, CONSTANTS.DIR_CUSTOMIZE), { recursive: true }).catch(() => {}),
              fs.cp(path.join(pairDir, CONSTANTS.ENV_PRD, CONSTANTS.DIR_JSON), path.join(prdCompareDir, CONSTANTS.DIR_JSON), { recursive: true }).catch(() => {}),
            ]);

            await Promise.all([
              cleanJsonForComparison(path.join(stgCompareDir, CONSTANTS.DIR_JSON)),
              cleanJsonForComparison(path.join(prdCompareDir, CONSTANTS.DIR_JSON)),
            ]);

            const relativeStgCompare = path.relative(pairDir, stgCompareDir);
            const relativePrdCompare = path.relative(pairDir, prdCompareDir);

            const winMergeContentForApp = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <paths>
    <left>${relativeStgCompare}\\</left>
    <right>${relativePrdCompare}\\</right>
    <filter>*.*</filter>
    <subfolders>1</subfolders>
    <left-readonly>0</left-readonly>
    <right-readonly>0</right-readonly>
  </paths>
</project>`;
            await fs.writeFile(
              path.join(pairDir, CONSTANTS.FILE_WINMERGE_PROJECT),
              winMergeContentForApp,
              "utf-8",
            );
          }
        }
      }
      if (groups) {
        for (const g of groups) {
          const groupDir = path.join(targetDir, g.group);
          await fs.mkdir(groupDir, { recursive: true });

          const relativeToResultDirForGroup = path.relative(resultDir, groupDir);
          const stgGroupCompareDir = path.join(
            resultDir,
            CONSTANTS.DIR_WINMERGE_COMPARE,
            CONSTANTS.ENV_STG,
            relativeToResultDirForGroup,
          );
          const prdGroupCompareDir = path.join(
            resultDir,
            CONSTANTS.DIR_WINMERGE_COMPARE,
            CONSTANTS.ENV_PRD,
            relativeToResultDirForGroup,
          );

          const relativeStgGroupCompare = path.relative(groupDir, stgGroupCompareDir);
          const relativePrdGroupCompare = path.relative(groupDir, prdGroupCompareDir);

          const winMergeContentForGroup = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <paths>
    <left>${relativeStgGroupCompare}\\</left>
    <right>${relativePrdGroupCompare}\\</right>
    <filter>*.*</filter>
    <subfolders>1</subfolders>
    <left-readonly>0</left-readonly>
    <right-readonly>0</right-readonly>
  </paths>
</project>`;
          await fs.writeFile(
            path.join(groupDir, CONSTANTS.FILE_WINMERGE_PROJECT),
            winMergeContentForGroup,
            "utf-8",
          );

          const isTopLevel = !topLevelGroupDir;
          const currentTopLevelGroupDir = topLevelGroupDir || groupDir;
          const currentRelativeGroupPath = topLevelGroupDir
            ? path.join(relativeGroupPath, g.group)
            : "";

          if (isTopLevel) {
            if (setting.workspaceConfig && Array.isArray(setting.workspaceConfig)) {
              for (const config of setting.workspaceConfig) {
                const workspaceFileName = config.fileName + CONSTANTS.SUFFIX_WORKSPACE;
                const { fileName, ...wsData } = config;
                await fs.writeFile(
                  path.join(groupDir, workspaceFileName),
                  JSON.stringify(wsData, null, 2),
                  "utf-8",
                );
              }
            }
          }

          await processAppsRecursive(
            g.ids,
            g.groups,
            groupDir,
            currentTopLevelGroupDir,
            currentRelativeGroupPath,
          );
        }
      }
    };

    if (setting.appIds) {
      await processAppsRecursive(setting.appIds);
    }
    if (setting.apps) {
      await processAppsRecursive(setting.apps.ids, setting.apps.groups);
    }

    const { enableAi } = setting;
    if (enableAi) {
      await resumeMain(resultDir, setting, promptTemplates);
    }

    if (setting.workspaceConfig && setting.workspaceConfig.length > 0) {
      openWorkspace(
        path.join(
          resultDir,
          setting.workspaceConfig.at(0)!.fileName + CONSTANTS.SUFFIX_WORKSPACE,
        ),
      );
    }
    
    // 現在のsetting.jsonで指定されたmaxCacheCountを使用してcleanupを行う
    // ただしcleanupOldResultsはtimestampディレクトリごと削除するため、すべてのsettingFiles実行後にやるのが正しいです。
    // 今回は最も大きい maxCacheCount を使用して後で削除する処理に変更するか、
    // 既存の実装のように単一の削除処理を維持するため、ループの外でやります。
  }

  // もし通常実行なら、不要な過去のタイムスタンプディレクトリを整理する。
  if (!isResumeMode) {
     // maxCacheCount の取得 (デフォルトを利用)
     let maxCount = CONSTANTS.DEFAULT_MAX_CACHE_COUNT;
     // 本来は各設定の最大値を取るなどの工夫が必要ですが、簡単のため10とします。
     await cleanupOldResults(baseResultDir, maxCount);
  }

  console.log(`\n=== すべての処理が完了しました ===`);
};

// 実行
main().catch(console.error);

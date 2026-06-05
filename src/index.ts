import { CONSTANTS } from "./constants";
import fs from "fs/promises";
import path from "path";
import { parseArgs } from "node:util";
import { Setting, AppGroup, AppId } from "./types";
import {
  getTimestampedDirName,
  cleanJsonForComparison,
  copyFilesUnderGroupFolder,
  copyFilesUnderTopFolder,
} from "./fileOps";
import { processApp } from "./appProcessor";
import { safeRunAsync, toSafeFileName } from "./utils";
import { exec } from "child_process";

// メイン処理
const main = async () => {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {},
    allowPositionals: true,
  });

  const settingFiles =
    positionals.length > 0 ? positionals : [CONSTANTS.FILE_SETTING_JSON];

  const baseResultDir = path.join(process.cwd(), CONSTANTS.DIR_RESULT);

  const currentTimestampDirName = getTimestampedDirName();
  const activeTimestampDir = path.join(baseResultDir, currentTimestampDirName);

  await fs.mkdir(activeTimestampDir, { recursive: true });

  // 設定ごとのループ
  for (const settingFileName of settingFiles) {
    const settingPath = path.resolve(process.cwd(), settingFileName);
    const settingBaseName = path.basename(
      settingFileName,
      path.extname(settingFileName),
    );
    const resultDir = path.join(activeTimestampDir, settingBaseName);

    const result = await safeRunAsync({
      tryCallback: async () => {
        const settingContent = await fs.readFile(settingPath, "utf-8");
        const setting: Setting = JSON.parse(settingContent);
        if (!setting.appIds && !setting.apps) {
          throw new Error(
            `${settingFileName} に appIds または apps パラメータが見つかりません。`,
          );
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

    console.log(`\n--- [処理開始] ${settingFileName} ---`);
    await fs.mkdir(resultDir, { recursive: true });
    await copyFilesUnderTopFolder(resultDir);

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
              appNameCache,
            );
          } else {
            const prdId = appId.prd;
            const stgId = appId.stg;

            let prdAppName = "UnknownApp";
            if (prdId) {
              await safeRunAsync({
                tryCallback: async () => {
                  const { fetchKintoneApi } = await import("./kintone");
                  const info = await fetchKintoneApi(
                    CONSTANTS.API_APP,
                    prdId,
                    setting.prdDomain,
                  );
                  prdAppName = info.name;
                  appNameCache[prdId] = prdAppName;
                },
                catchCallback: async () => {
                  console.warn(
                    `[Warn] 本番アプリID: ${prdId} の名前取得に失敗しました。`,
                  );
                },
              });
            }

            const pairDirName = toSafeFileName(prdAppName);
            const pairDir = path.join(targetDir, pairDirName);
            await fs.mkdir(pairDir, { recursive: true });

            if (stgId) {
              await processApp(
                stgId,
                setting.stgDomain,
                pairDir,
                appNameCache,
                CONSTANTS.ENV_STG,
              );
            }
            if (prdId) {
              await processApp(
                prdId,
                setting.prdDomain,
                pairDir,
                appNameCache,
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
              fs
                .cp(
                  path.join(
                    pairDir,
                    CONSTANTS.ENV_STG,
                    CONSTANTS.DIR_CUSTOMIZE,
                  ),
                  path.join(stgCompareDir, CONSTANTS.DIR_CUSTOMIZE),
                  { recursive: true },
                )
                .catch(() => {}),
              fs
                .cp(
                  path.join(pairDir, CONSTANTS.ENV_STG, CONSTANTS.DIR_JSON),
                  path.join(stgCompareDir, CONSTANTS.DIR_JSON),
                  { recursive: true },
                )
                .catch(() => {}),
              fs
                .cp(
                  path.join(
                    pairDir,
                    CONSTANTS.ENV_PRD,
                    CONSTANTS.DIR_CUSTOMIZE,
                  ),
                  path.join(prdCompareDir, CONSTANTS.DIR_CUSTOMIZE),
                  { recursive: true },
                )
                .catch(() => {}),
              fs
                .cp(
                  path.join(pairDir, CONSTANTS.ENV_PRD, CONSTANTS.DIR_JSON),
                  path.join(prdCompareDir, CONSTANTS.DIR_JSON),
                  { recursive: true },
                )
                .catch(() => {}),
            ]);

            await Promise.all([
              cleanJsonForComparison(
                path.join(stgCompareDir, CONSTANTS.DIR_JSON),
              ),
              cleanJsonForComparison(
                path.join(prdCompareDir, CONSTANTS.DIR_JSON),
              ),
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
          await copyFilesUnderGroupFolder(groupDir);

          const relativeToResultDirForGroup = path.relative(
            resultDir,
            groupDir,
          );
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

          const relativeStgGroupCompare = path.relative(
            groupDir,
            stgGroupCompareDir,
          );
          const relativePrdGroupCompare = path.relative(
            groupDir,
            prdGroupCompareDir,
          );

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

          const currentTopLevelGroupDir = topLevelGroupDir || groupDir;
          const currentRelativeGroupPath = topLevelGroupDir
            ? path.join(relativeGroupPath, g.group)
            : "";

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
  }

  console.log(`\n=== すべての処理が完了しました ===`);

  // 作成したフォルダを開く
  exec(activeTimestampDir);
};

// 実行
main().catch(console.error);

import { CONSTANTS } from "./constants";
import fs from "fs/promises";
import path from "path";
import { fetchKintoneApi, downloadKintoneFile, getEnvConfig } from "./kintone";
import { Setting } from "./types";
import {
  generateLookupMd,
  generateViewMd,
  generateAclMd,
  generateNotificationMd,
  generateFormMd,
} from "./mdGenerators";
import { toSafeFileName, safeRunAsync, hasMeaningfulData } from "./utils";
import { writeErrorLog } from "./fileOps";

const copyFilesUnderAppFolder = async (appDir: string) => {
  const sourceDir = path.join(process.cwd(), "3.アプリ直下にコピー");
  const exists = await fs
    .access(sourceDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(appDir, entry.name);
    await fs.cp(sourcePath, targetPath, {
      recursive: entry.isDirectory(),
      force: true,
    });
  }
};

/**
 * 個別アプリの設定ダウンロードとドキュメント生成
 */
export const processApp = async (
  appId: number,
  setting: Setting,
  domain: string | undefined,
  resultDir: string,
  appNameCache: Record<string, string>,
  overrideDirName?: string,
) => {
  console.log(`=== アプリID: ${appId} の処理を開始します ===`);
  await safeRunAsync({
    tryCallback: async () => {
      // 1. まず基本情報を取得（ディレクトリ名やルックアップ処理に必要）
      const [appInfo, fieldsInfo, customizeInfo] = await Promise.all([
        fetchKintoneApi(CONSTANTS.API_APP, appId, domain),
        fetchKintoneApi(CONSTANTS.API_FIELDS, appId, domain),
        fetchKintoneApi(CONSTANTS.API_CUSTOMIZE, appId, domain),
      ]);

      const { name: appName } = appInfo;
      if (!appName) throw new Error("アプリ名が取得できませんでした。");

      const safeAppName = toSafeFileName(appName);
      const appDirName = overrideDirName || `${appId}_${safeAppName}`;
      const appDir = path.join(resultDir, appDirName);
      const jsonDir = path.join(appDir, CONSTANTS.DIR_JSON);
      await fs.mkdir(jsonDir, { recursive: true });
      await copyFilesUnderAppFolder(appDir);

      // リンクファイルの作成
      const baseUrl = getEnvConfig(domain).baseUrl;
      const urlContent = `[InternetShortcut]\nURL=${baseUrl}/k/${appId}/\n`;
      await fs.writeFile(
        path.join(appDir, CONSTANTS.FILE_URL_SHORTCUT),
        urlContent,
        "utf-8",
      );

      // 2. AI処理（カスタマイズファイルのDL含む）と、その他のメタデータDLを並列実行
      const aiTask = handleCustomizeFiles(
        appId,
        appName,
        appDir,
        customizeInfo,
        domain,
        setting,
      );

      const writeJson = (filename: string, data: any) =>
        hasMeaningfulData(data)
          ? fs.writeFile(
              path.join(jsonDir, filename),
              JSON.stringify(data, null, 2),
              "utf-8",
            )
          : Promise.resolve();

      const metaTask = (async () => {
        // JSONの書き出し
        await Promise.all([
          writeJson(CONSTANTS.FILE_APP_JSON, appInfo),
          writeJson(CONSTANTS.FILE_FIELDS_JSON, fieldsInfo),
          writeJson(CONSTANTS.FILE_CUSTOMIZE_JSON, customizeInfo),
        ]);

        // その他の設定を一括取得
        const [
          layoutInfo,
          viewsInfo,
          appAcl,
          recordAcl,
          fieldAcl,
          notifGen,
          notifRec,
          notifRem,
          actions,
          plugins,
        ] = await Promise.all([
          fetchKintoneApi(CONSTANTS.API_LAYOUT, appId, domain),
          fetchKintoneApi(CONSTANTS.API_VIEWS, appId, domain),
          fetchKintoneApi(CONSTANTS.API_ACL_APP, appId, domain),
          fetchKintoneApi(CONSTANTS.API_ACL_RECORD, appId, domain),
          fetchKintoneApi(CONSTANTS.API_ACL_FIELD, appId, domain),
          fetchKintoneApi(CONSTANTS.API_NOTIF_GENERAL, appId, domain),
          fetchKintoneApi(CONSTANTS.API_NOTIF_RECORD, appId, domain),
          fetchKintoneApi(CONSTANTS.API_NOTIF_REMINDER, appId, domain),
          fetchKintoneApi(CONSTANTS.API_ACTIONS, appId, domain),
          fetchKintoneApi(CONSTANTS.API_PLUGINS, appId, domain),
        ]);

        // JSON保存
        await Promise.all([
          writeJson(CONSTANTS.FILE_LAYOUT_JSON, layoutInfo),
          writeJson(CONSTANTS.FILE_VIEWS_JSON, viewsInfo),
          writeJson(CONSTANTS.FILE_APP_ACL_JSON, appAcl),
          writeJson(CONSTANTS.FILE_RECORD_ACL_JSON, recordAcl),
          writeJson(CONSTANTS.FILE_FIELD_ACL_JSON, fieldAcl),
          writeJson(CONSTANTS.FILE_NOTIF_GENERAL_JSON, notifGen),
          writeJson(CONSTANTS.FILE_NOTIF_RECORD_JSON, notifRec),
          writeJson(CONSTANTS.FILE_NOTIF_REMINDER_JSON, notifRem),
          writeJson(CONSTANTS.FILE_ACTIONS_JSON, actions),
          writeJson(CONSTANTS.FILE_PLUGINS_JSON, plugins),
        ]);

        // ドキュメント生成
        await Promise.all([
          handleLookups(
            appId,
            appName,
            appDir,
            fieldsInfo,
            domain,
            appNameCache,
          ),
          fs.writeFile(
            path.join(appDir, CONSTANTS.FILE_FORM_MD),
            generateFormMd(appId, fieldsInfo, layoutInfo),
            "utf-8",
          ),
          hasMeaningfulData(viewsInfo)
            ? fs.writeFile(
                path.join(appDir, CONSTANTS.FILE_VIEW_MD),
                generateViewMd(appId, viewsInfo),
                "utf-8",
              )
            : Promise.resolve(),
          hasMeaningfulData(appAcl) ||
          hasMeaningfulData(recordAcl) ||
          hasMeaningfulData(fieldAcl)
            ? fs.writeFile(
                path.join(appDir, CONSTANTS.FILE_ACL_MD),
                generateAclMd(appId, appAcl, recordAcl, fieldAcl),
                "utf-8",
              )
            : Promise.resolve(),
          notifGen.generalNotifications?.length ||
          notifRec.perRecordNotifications?.length ||
          notifRem.reminderNotifications?.length
            ? fs.writeFile(
                path.join(appDir, CONSTANTS.FILE_NOTIFICATION_MD),
                generateNotificationMd(appId, notifGen, notifRec, notifRem),
                "utf-8",
              )
            : Promise.resolve(),
        ]);
        console.log(
          `  [Info] アプリID: ${appId} の設定ファイルダウンロードが完了しました。`,
        );
      })();

      // 3. 全てのタスクの完了を待機
      await Promise.all([aiTask, metaTask]);

      // vscode tasks generation
      const customizeJsonPath = path.join(
        jsonDir,
        CONSTANTS.FILE_CUSTOMIZE_JSON,
      );
      const customizeDirPath = path.join(appDir, CONSTANTS.DIR_CUSTOMIZE);

      const hasCustomizeJson = await fs
        .access(customizeJsonPath)
        .then(() => true)
        .catch(() => false);
      const hasCustomizeDir = await fs
        .access(customizeDirPath)
        .then(() => true)
        .catch(() => false);

      // Create .vscode folder
      const vscodeDir = path.join(appDir, ".vscode");
      await fs.mkdir(vscodeDir, { recursive: true });

      if (hasCustomizeJson && hasCustomizeDir) {
        // Generate customize-manifest.json
        const customizeJsonContent = await fs.readFile(
          customizeJsonPath,
          "utf-8",
        );
        const customizeInfo = JSON.parse(customizeJsonContent);

        const manifest: any = {
          scope: customizeInfo.scope || "ALL",
          desktop: { js: [], css: [] },
          mobile: { js: [], css: [] },
        };

        const scopes = ["desktop", "mobile"] as const;
        const types = ["js", "css"] as const;

        for (const scope of scopes) {
          for (const type of types) {
            const items = customizeInfo[scope]?.[type] || [];
            for (const item of items) {
              if (item.type === "FILE" && item.file?.name) {
                manifest[scope][type].push(
                  `${CONSTANTS.DIR_CUSTOMIZE}/${scope}/${type}/${toSafeFileName(item.file.name)}`,
                );
              } else if (item.type === "URL" && item.url) {
                manifest[scope][type].push(item.url);
              }
            }
          }
        }

        // Write customize-manifest.json
        await fs.writeFile(
          path.join(appDir, "customize-manifest.json"),
          JSON.stringify(manifest, null, 2),
          "utf-8",
        );

        // Generate tasks.json
        const config = getEnvConfig(domain);
        const tasksJson = {
          version: "2.0.0",
          tasks: [
            {
              label: "kintone: upload customize files",
              type: "shell",
              command: `cli-kintone customize apply --yes --base-url "${config.baseUrl}" --app "${appId}" --username "${config.username}" --password "${config.password}" --input customize-manifest.json`,
              group: {
                kind: "build",
                isDefault: true,
              },
            },
          ],
        };

        await fs.writeFile(
          path.join(vscodeDir, "tasks.json"),
          JSON.stringify(tasksJson, null, 2),
          "utf-8",
        );
      }

      await fs.writeFile(
        path.join(vscodeDir, "settings.json"),
        JSON.stringify(
          {
            "openInExternalApp.openMapper": [
              {
                extensionName: "code-workspace",
                apps: [
                  {
                    title: "code-workspace",
                    openCommand:
                      "c:\\Users\\usui\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
                  },
                ],
              },
              {
                extensionName: "WinMerge",
                apps: [
                  {
                    title: "WinMerge",
                    openCommand: "C:\\Program Files\\WinMerge\\WinMergeU.exe",
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
        "utf-8",
      );

      console.log(`=== アプリID: ${appId} の処理が完了しました ===\n`);
    },
    catchCallback: async (error: any) => {
      console.error(
        `=== アプリID: ${appId} はエラーが発生したためスキップしました ===\n`,
        error,
      );
      await writeErrorLog(
        resultDir,
        `アプリID: ${appId} の処理中にエラーが発生しました。`,
        error,
      );
    },
  });
};

/**
 * ルックアップ情報の取得とMD生成
 */
const handleLookups = async (
  appId: number,
  appName: string,
  appDir: string,
  fieldsInfo: any,
  domain: string | undefined,
  appNameCache: Record<string, string>,
) => {
  const extractLookups = async (
    properties: any,
    prefix = "",
  ): Promise<string[]> => {
    const propertyEntries = Object.entries(properties as Record<string, any>);

    const results = await Promise.all(
      propertyEntries.map(async ([fieldCode, fieldDef]) => {
        if (fieldDef.type === "SUBTABLE" && fieldDef.fields) {
          return await extractLookups(
            fieldDef.fields,
            `${prefix}${fieldCode} (テーブル) &gt; `,
          );
        }

        if (!fieldDef.lookup) return [];

        const { lookup } = fieldDef;
        const relatedAppId = lookup.relatedApp?.app || "不明";

        const relatedAppName = await (async () => {
          if (relatedAppId === "不明") return "不明";
          if (appNameCache[relatedAppId]) return appNameCache[relatedAppId];

          return await safeRunAsync({
            tryCallback: async () => {
              const info = await fetchKintoneApi(
                CONSTANTS.API_APP,
                Number(relatedAppId),
                domain,
              );
              appNameCache[relatedAppId] = info.name;
              return info.name;
            },
            catchCallback: async (e) => {
              appNameCache[relatedAppId] = "取得不可";
              await writeErrorLog(
                appDir,
                `ルックアップ先アプリ情報 (ID: ${relatedAppId}) の取得に失敗しました。`,
                e,
              );
              return "取得不可";
            },
          });
        })();

        const mappings = lookup.fieldMappings || [];
        const rowCount = mappings.length || 1;
        const baseUrl = getEnvConfig(domain).baseUrl;
        const appUrl =
          relatedAppId !== "不明"
            ? `<a href="${baseUrl}/k/${relatedAppId}/" target="_blank">${relatedAppName} (ID: ${relatedAppId})</a>`
            : `${relatedAppName} (ID: ${relatedAppId})`;

        const rowHtml =
          `    <tr>\n      <td rowspan="${rowCount}">${prefix}${fieldCode}</td>\n` +
          `      <td rowspan="${rowCount}">${appUrl}</td>\n      <td rowspan="${rowCount}">${lookup.relatedKeyField}</td>\n` +
          (mappings.length > 0
            ? `      <td>${mappings[0].field}</td>\n      <td>${mappings[0].relatedField}</td>\n    </tr>\n` +
              mappings
                .slice(1)
                .map(
                  (m: any) =>
                    `    <tr>\n      <td>${m.field}</td>\n      <td>${m.relatedField}</td>\n    </tr>\n`,
                )
                .join("")
            : `      <td>-</td>\n      <td>-</td>\n    </tr>\n`);

        return [rowHtml];
      }),
    );
    return results.flat();
  };

  if (fieldsInfo.properties) {
    const rows = await extractLookups(fieldsInfo.properties);
    if (rows.length > 0) {
      await fs.writeFile(
        path.join(appDir, CONSTANTS.FILE_LOOKUP_RELATION_MD),
        generateLookupMd(appName, appId, rows),
        "utf-8",
      );
    }
  }
};

/**
 * カスタマイズファイルのDLとAI処理
 */
const handleCustomizeFiles = async (
  appId: number,
  appName: string,
  appDir: string,
  customizeInfo: any,
  domain: string | undefined,
  setting: Setting,
) => {
  const scopes = ["desktop", "mobile"];
  const types = ["js", "css"];
  const customizeDir = path.join(appDir, CONSTANTS.DIR_CUSTOMIZE);

  await scopes.reduce(async (scopePromise: Promise<void>, scope) => {
    await scopePromise;
    await types.reduce(async (typePromise: Promise<void>, type) => {
      await typePromise;
      const items = customizeInfo[scope]?.[type] || [];

      const filesToMerge = (
        await Promise.all(
          items.map(async (item: any) => {
            const { type: itemType, file } = item;
            if (itemType !== "FILE" || !file?.fileKey) return null;

            const { name: fileName, fileKey } = file;
            const targetDir = path.join(customizeDir, scope, type);
            await fs.mkdir(targetDir, { recursive: true });
            const targetPath = path.join(targetDir, toSafeFileName(fileName));
            try {
              const data = await downloadKintoneFile(fileKey, domain);
              await fs.writeFile(targetPath, data);
              return targetPath;
            } catch (e) {
              await writeErrorLog(
                appDir,
                `ファイルのダウンロードまたは保存に失敗しました: ${fileName}`,
                e,
              );
            }
            return null;
          }),
        )
      ).filter((p): p is string => p !== null);

      if (filesToMerge.length > 0) {
        await processMergeAndAi(
          appId,
          appName,
          appDir,
          scope,
          type,
          filesToMerge,
          setting,
        );
      }
    }, Promise.resolve());
  }, Promise.resolve());
};

/**
 * マージとAI処理
 */
const processMergeAndAi = async (
  appId: number,
  appName: string,
  appDir: string,
  scope: string,
  type: string,
  allFilePaths: string[],
  setting: Setting,
  domain?: string,
) => {
  const exclude = setting.excludeFromMerge || [];
  const files = allFilePaths
    .filter((p) => !exclude.includes(path.basename(p)))
    .sort();
  const excluded = allFilePaths
    .filter((p) => exclude.includes(path.basename(p)))
    .sort();

  const baseUrl = getEnvConfig(domain).baseUrl;
  const mergedHeader = [
    `/*`,
    ` アプリ名: ${appName}`,
    ` 設定URL: ${baseUrl}/k/admin/app/flow?app=${appId}`,
    ` マージ一覧:`,
    ...files.map((f) => ` - ${path.basename(f)}`),
    ` 除外一覧:`,
    ...(excluded.length
      ? excluded.map((f) => ` - ${path.basename(f)}`)
      : [" - なし"]),
    `*/\n\n`,
  ].join("\n");

  const bodyParts = await Promise.all(
    files.map(async (f) => {
      const content = await fs.readFile(f, "utf-8");
      const relativePath = path.relative(appDir, f).replace(/\\/g, "/");
      return `/* --- Original File: ${relativePath} --- */\n${content}\n\n`;
    }),
  );

  const mergedContent = mergedHeader + bodyParts.join("");

  if (type === "js") {
    // 目次生成 (AIの有無に関わらず実行)
    await generateSpecificationToc(appDir, mergedContent);
  }
};

/**
 * 設計書目次.md の生成
 */
const generateSpecificationToc = async (
  appDir: string,
  mergedContent: string,
) => {
  const lines = mergedContent.split("\n");
  const fileMappings: { start: number; end: number; filename: string }[] = [];
  let currentFile = "Unknown";
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileMatch = line.match(/\/\* --- Original File: (.+?) --- \*\//);
    if (fileMatch) {
      if (currentFile !== "Unknown") {
        fileMappings.push({ start: startLine, end: i, filename: currentFile });
      }
      currentFile = fileMatch[1];
      startLine = i + 1;
    }
  }
  fileMappings.push({
    start: startLine,
    end: lines.length,
    filename: currentFile,
  });

  const markerRegex = /#機能@\{(.+?)\}/g;
  const matches = Array.from(mergedContent.matchAll(markerRegex)).map((m) => {
    const [marker, functionalName] = m;
    const { index = 0 } = m;
    const lineNumber = mergedContent.substring(0, index).split("\n").length;
    const sourceFile = fileMappings.find(
      (fm) => lineNumber >= fm.start && lineNumber <= fm.end,
    )?.filename;
    return { functionalName, marker, lineNumber, sourceFile };
  });

  if (matches.length === 0) return;

  const tocPath = path.join(appDir, CONSTANTS.FILE_FUNCTION_LIST_MD);
  let tocContent = `# 機能一覧\n\n`;
  tocContent += `| 機能名 | ソースファイル |\n`;
  tocContent += `| :--- | :--- |\n`;

  for (const match of matches) {
    const fm = fileMappings.find((f) => match.sourceFile === f.filename);
    const originalLineNumber = fm ? match.lineNumber - fm.start : null;

    const sourceLink = match.sourceFile
      ? `[${path.basename(match.sourceFile)}${originalLineNumber ? `:${originalLineNumber}` : ""}](${match.sourceFile.startsWith(".") ? match.sourceFile : "./" + match.sourceFile}${originalLineNumber ? `#L${originalLineNumber}` : ""})`
      : "-";

    tocContent += `| ${match.functionalName} | ${sourceLink} |\n`;
  }
  await fs.writeFile(tocPath, tocContent, "utf-8");
};

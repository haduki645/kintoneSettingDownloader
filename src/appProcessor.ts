import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import {
  fetchKintoneApi,
  downloadKintoneFile,
  KINTONE_BASE_URL,
} from "./kintone";
import { Setting, MarkerMatch, PromptTemplate } from "./types";
import { callAiApi, getCachedResult } from "./ai";
import {
  generateLookupMd,
  generateViewMd,
  generateAclMd,
  generateNotificationMd,
  generateFormMd,
} from "./mdGenerators";
import { toSafeFileName, safeRunAsync, hasMeaningfulData } from "./utils";
import {
  getPastResultDirs,
  minifyJs,
  writeErrorLog,
} from "./fileOps";


/**
 * プロンプトテンプレートの読み込み
 */
export const loadPromptTemplates = async (): Promise<PromptTemplate[]> => {
  const promptTemplates: PromptTemplate[] = [];
  const promptTemplatesDir = path.join(process.cwd(), "prompt_templates");
  await safeRunAsync({
    tryCallback: async () => {
      const files = await fs.readdir(promptTemplatesDir);
      const templateFiles = files.filter(f => f.endsWith(".md") || f.endsWith(".txt")).sort();
      const templates = await Promise.all(templateFiles.map(async f => ({
        name: path.parse(f).name,
        content: await fs.readFile(path.join(promptTemplatesDir, f), "utf-8")
      })));
      promptTemplates.push(...templates);
    },
    catchCallback: async () => {
      // ディレクトリが存在しない場合は無視して個別プロンプトの読み込みへ
    }
  });

  if (promptTemplates.length === 0) {
    const promptTemplatePath = path.join(process.cwd(), "prompt.md");
    await safeRunAsync({
      tryCallback: async () => {
        promptTemplates.push({
          name: "prompt",
          content: await fs.readFile(promptTemplatePath, "utf-8")
        });
      },
      catchCallback: async () => {
        console.warn("プロンプトテンプレートが見つからないため、プロンプト生成はスキップされます。");
      }
    });
  }
  return promptTemplates;
}

/**
 * ワークスペースを開く
 */
export const openWorkspace = (workspacePath: string) => {
  console.log(`[Info] ${path.basename(workspacePath)} を開きます...`);
  exec(`code "${workspacePath}"`, (err) => {
    if (err) exec(`start "" "${workspacePath}"`);
  });
}

/**
 * 既存の結果フォルダに対してAI処理のみを再開する
 */
export const resumeMain = async (resultDir: string, setting: Setting, promptTemplates: PromptTemplate[]) => {
  console.log(`=== 既存の結果ディレクトリ (${path.basename(resultDir)}) を対象にAI処理を再開します ===`);
  const baseResultDir = path.dirname(resultDir);

  // 今回のディレクトリを除いた過去のディレクトリをキャッシュ対象にする
  const pastDirsNames = await getPastResultDirs(baseResultDir);
  const pastResultDirs = pastDirsNames
    .filter(name => name !== path.basename(resultDir))
    .slice(0, setting.maxCacheCount || 5)
    .map(name => path.join(baseResultDir, name));

  const processDirectory = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    // mergeFiles ディレクトリがある場合は、ここがアプリディレクトリであると判断
    const mergeDir = path.join(dir, "mergeFiles");
    const hasMergeFiles = entries.some(e => e.isDirectory() && e.name === "mergeFiles");

    if (hasMergeFiles) {
      let appId: number | null = null;
      const dirName = path.basename(dir);

      // 1. ディレクトリ名から ID 取得を試みる
      if (/^\d+_/.test(dirName)) {
        appId = parseInt(dirName.split("_")[0]);
      } else {
        // 2. ディレクトリ名に ID がない場合（検証/本番フォルダなど）、json/app.json から取得を試みる
        const appJsonPath = path.join(dir, "json", "app.json");
        await safeRunAsync({
          tryCallback: async () => {
            const content = await fs.readFile(appJsonPath, "utf-8");
            const appInfo = JSON.parse(content);
            appId = parseInt(appInfo.appId || appInfo.id);
          },
          catchCallback: async () => {
            // 取得失敗
          }
        });
      }

      if (appId) {
        const appDirName = dirName;
        const safeAppName = appDirName.includes("_") ? appDirName.substring(appDirName.indexOf("_") + 1) : appDirName;

        await safeRunAsync({
          tryCallback: async () => {
            const files = await fs.readdir(mergeDir);
            const jsFiles = files.filter(f => f.endsWith(".js") && !f.endsWith(".min.js"));

            for (const jsFile of jsFiles) {
              console.log(`[Resume] アプリ: ${appDirName}, ファイル: ${jsFile}`);
              const mergedContent = await fs.readFile(path.join(mergeDir, jsFile), "utf-8");
              const aiGen = handleAiGeneration(appId!, dir, jsFile, mergedContent, setting, promptTemplates, pastResultDirs, safeAppName);
              for await (const _ of aiGen) { /* 完了を待機 */ }
            }
          }
        });
        // アプリディレクトリとして処理した場合は、その下は探索しない
        return;
      }
    }

    // アプリディレクトリでない、または appId が取得できなかった場合は、サブディレクトリを探索
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await processDirectory(path.join(dir, entry.name));
      }
    }
  };

  await processDirectory(resultDir);
}


/**
 * 個別アプリの設定ダウンロードとドキュメント生成
 */
export const processApp = async (
  appId: number,
  setting: Setting,
  headers: any,
  resultDir: string,
  pastResultDirs: string[],
  promptTemplates: PromptTemplate[],
  appNameCache: Record<string, string>,
  skipAi = false,
  overrideDirName?: string
) => {
  console.log(`=== アプリID: ${appId} の処理を開始します ===`);
  await safeRunAsync({
    tryCallback: async () => {
      // 1. まず基本情報を取得（ディレクトリ名やルックアップ処理に必要）
      const [appInfo, fieldsInfo, customizeInfo] = await Promise.all([
        fetchKintoneApi("/k/v1/app.json", appId, headers),
        fetchKintoneApi("/k/v1/app/form/fields.json", appId, headers),
        fetchKintoneApi("/k/v1/app/customize.json", appId, headers),
      ]);

      const { name: appName } = appInfo;
      if (!appName) throw new Error("アプリ名が取得できませんでした。");

      const safeAppName = toSafeFileName(appName);
      const appDirName = overrideDirName || `${appId}_${safeAppName}`;
      const appDir = path.join(resultDir, appDirName);
      const jsonDir = path.join(appDir, "json");
      await fs.mkdir(jsonDir, { recursive: true });

      // リンクファイルの作成
      const urlContent = `[InternetShortcut]\nURL=${KINTONE_BASE_URL}/k/${appId}/\n`;
      await fs.writeFile(path.join(appDir, "kintoneアプリへ移動.url"), urlContent, "utf-8");

      // .code-workspace の作成
      if (setting.workspaceConfig) {
        const workspaceFileName = `${safeAppName}.code-workspace`;
        await fs.writeFile(
          path.join(appDir, workspaceFileName),
          JSON.stringify(setting.workspaceConfig, null, 2),
          "utf-8"
        );
      }


      // 2. AI処理（カスタマイズファイルのDL含む）と、その他のメタデータDLを並列実行
      const aiTask = handleCustomizeFiles(appId, appName, appDir, customizeInfo, headers, setting, promptTemplates, pastResultDirs, safeAppName, skipAi);

      const writeJson = (filename: string, data: any) =>
        hasMeaningfulData(data)
          ? fs.writeFile(path.join(jsonDir, filename), JSON.stringify(data, null, 2), "utf-8")
          : Promise.resolve();

      const metaTask = (async () => {
        // JSONの書き出し
        await Promise.all([
          writeJson("app.json", appInfo),
          writeJson("fields.json", fieldsInfo),
          writeJson("customize.json", customizeInfo),
        ]);

        // その他の設定を一括取得
        const [layoutInfo, viewsInfo, appAcl, recordAcl, fieldAcl, notifGen, notifRec, notifRem, actions, plugins] = await Promise.all([
          fetchKintoneApi("/k/v1/app/form/layout.json", appId, headers),
          fetchKintoneApi("/k/v1/app/views.json", appId, headers),
          fetchKintoneApi("/k/v1/app/acl.json", appId, headers),
          fetchKintoneApi("/k/v1/record/acl.json", appId, headers),
          fetchKintoneApi("/k/v1/field/acl.json", appId, headers),
          fetchKintoneApi("/k/v1/app/notifications/general.json", appId, headers),
          fetchKintoneApi("/k/v1/app/notifications/perRecord.json", appId, headers),
          fetchKintoneApi("/k/v1/app/notifications/reminder.json", appId, headers),
          fetchKintoneApi("/k/v1/app/actions.json", appId, headers),
          fetchKintoneApi("/k/v1/app/plugins.json", appId, headers),
        ]);

        // JSON保存
        await Promise.all([
          writeJson("layout.json", layoutInfo),
          writeJson("views.json", viewsInfo),
          writeJson("appAcl.json", appAcl),
          writeJson("recordAcl.json", recordAcl),
          writeJson("fieldAcl.json", fieldAcl),
          writeJson("notificationsGeneral.json", notifGen),
          writeJson("notificationsPerRecord.json", notifRec),
          writeJson("notificationsReminder.json", notifRem),
          writeJson("actions.json", actions),
          writeJson("plugins.json", plugins),
        ]);

        // ドキュメント生成
        await Promise.all([
          handleLookups(appId, appName, appDir, fieldsInfo, headers, appNameCache),
          fs.writeFile(path.join(appDir, "form.md"), generateFormMd(appId, fieldsInfo, layoutInfo), "utf-8"),
          hasMeaningfulData(viewsInfo)
            ? fs.writeFile(path.join(appDir, "view.md"), generateViewMd(appId, viewsInfo), "utf-8")
            : Promise.resolve(),
          (hasMeaningfulData(appAcl) || hasMeaningfulData(recordAcl) || hasMeaningfulData(fieldAcl))
            ? fs.writeFile(path.join(appDir, "acl.md"), generateAclMd(appId, appAcl, recordAcl, fieldAcl), "utf-8")
            : Promise.resolve(),
          (notifGen.generalNotifications?.length || notifRec.perRecordNotifications?.length || notifRem.reminderNotifications?.length)
            ? fs.writeFile(path.join(appDir, "notification.md"), generateNotificationMd(appId, notifGen, notifRec, notifRem), "utf-8")
            : Promise.resolve(),
        ]);
        console.log(`  [Info] アプリID: ${appId} の設定ファイルダウンロードが完了しました。`);
      })();

      // 3. 全てのタスクの完了を待機
      await Promise.all([aiTask, metaTask]);

      console.log(`=== アプリID: ${appId} の処理が完了しました ===\n`);
    },
    catchCallback: async (error: any) => {
      console.error(`=== アプリID: ${appId} はエラーが発生したためスキップしました ===\n`, error);
      await writeErrorLog(resultDir, `アプリID: ${appId} の処理中にエラーが発生しました。`, error);
    }
  });
}

/**
 * ルックアップ情報の取得とMD生成
 */
const handleLookups = async (
  appId: number,
  appName: string,
  appDir: string,
  fieldsInfo: any,
  headers: any,
  appNameCache: Record<string, string>
) => {
  const extractLookups = async (properties: any, prefix = ""): Promise<string[]> => {
    const propertyEntries = Object.entries(properties as Record<string, any>);

    const results = await Promise.all(propertyEntries.map(async ([fieldCode, fieldDef]) => {
      if (fieldDef.type === "SUBTABLE" && fieldDef.fields) {
        return await extractLookups(fieldDef.fields, `${prefix}${fieldCode} (テーブル) &gt; `);
      }

      if (!fieldDef.lookup) return [];

      const { lookup } = fieldDef;
      const relatedAppId = lookup.relatedApp?.app || "不明";

      const relatedAppName = await (async () => {
        if (relatedAppId === "不明") return "不明";
        if (appNameCache[relatedAppId]) return appNameCache[relatedAppId];

        return await safeRunAsync({
          tryCallback: async () => {
            const info = await fetchKintoneApi("/k/v1/app.json", Number(relatedAppId), headers);
            appNameCache[relatedAppId] = info.name;
            return info.name;
          },
          catchCallback: async (e) => {
            appNameCache[relatedAppId] = "取得不可";
            await writeErrorLog(appDir, `ルックアップ先アプリ情報 (ID: ${relatedAppId}) の取得に失敗しました。`, e);
            return "取得不可";
          }
        });
      })();

      const mappings = lookup.fieldMappings || [];
      const rowCount = mappings.length || 1;
      const appUrl = relatedAppId !== "不明" ? `<a href="${KINTONE_BASE_URL}/k/${relatedAppId}/" target="_blank">${relatedAppName} (ID: ${relatedAppId})</a>` : `${relatedAppName} (ID: ${relatedAppId})`;

      const rowHtml = `    <tr>\n      <td rowspan="${rowCount}">${prefix}${fieldCode}</td>\n` +
        `      <td rowspan="${rowCount}">${appUrl}</td>\n      <td rowspan="${rowCount}">${lookup.relatedKeyField}</td>\n` +
        (mappings.length > 0
          ? `      <td>${mappings[0].field}</td>\n      <td>${mappings[0].relatedField}</td>\n    </tr>\n` +
          mappings.slice(1).map((m: any) => `    <tr>\n      <td>${m.field}</td>\n      <td>${m.relatedField}</td>\n    </tr>\n`).join("")
          : `      <td>-</td>\n      <td>-</td>\n    </tr>\n`);

      return [rowHtml];
    }));
    return results.flat();
  };

  if (fieldsInfo.properties) {
    const rows = await extractLookups(fieldsInfo.properties);
    if (rows.length > 0) {
      await fs.writeFile(path.join(appDir, "lookup_relation.md"), generateLookupMd(appName, appId, rows), "utf-8");
    }
  }
}

/**
 * カスタマイズファイルのDLとAI処理
 */
const handleCustomizeFiles = async (
  appId: number,
  appName: string,
  appDir: string,
  customizeInfo: any,
  headers: any,
  setting: Setting,
  promptTemplates: PromptTemplate[],
  pastResultDirs: string[],
  safeAppName: string,
  skipAi = false
) => {
  const scopes = ["desktop", "mobile"];
  const types = ["js", "css"];
  const customizeDir = path.join(appDir, "customize");

  await scopes.reduce(async (scopePromise: Promise<void>, scope) => {
    await scopePromise;
    await types.reduce(async (typePromise: Promise<void>, type) => {
      await typePromise;
      const items = customizeInfo[scope]?.[type] || [];

      const filesToMerge = (await Promise.all(items.map(async (item: any) => {
        const { type: itemType, file } = item;
        if (itemType !== "FILE" || !file?.fileKey) return null;

        const { name: fileName, fileKey } = file;
        const targetDir = path.join(customizeDir, scope, type);
        await fs.mkdir(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, toSafeFileName(fileName));
        try {
          const data = await downloadKintoneFile(fileKey, headers);
          await fs.writeFile(targetPath, data);
          return targetPath;
        } catch (e) {
          await writeErrorLog(appDir, `ファイルのダウンロードまたは保存に失敗しました: ${fileName}`, e);
        }
        return null;
      }))).filter((p): p is string => p !== null);

      if (filesToMerge.length > 0) {
        await processMergeAndAi(appId, appName, appDir, scope, type, filesToMerge, setting, promptTemplates, pastResultDirs, safeAppName, skipAi);
      }
    }, Promise.resolve());
  }, Promise.resolve());
}

/**
 * マージとAI処理
 */
const processMergeAndAi = async (
  appId: number, appName: string, appDir: string, scope: string, type: string,
  allFilePaths: string[], setting: Setting, promptTemplates: PromptTemplate[], pastResultDirs: string[], safeAppName: string,
  skipAi = false
) => {
  const exclude = setting.excludeFromMerge || [];
  const files = allFilePaths.filter(p => !exclude.includes(path.basename(p))).sort();
  const excluded = allFilePaths.filter(p => exclude.includes(path.basename(p))).sort();

  const mergedHeader = [
    `/*`,
    ` アプリ名: ${appName}`,
    ` 設定URL: ${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}`,
    ` マージ一覧:`,
    ...files.map(f => ` - ${path.basename(f)}`),
    ` 除外一覧:`,
    ...(excluded.length ? excluded.map(f => ` - ${path.basename(f)}`) : [" - なし"]),
    `*/\n\n`
  ].join("\n");

  const bodyParts = await Promise.all(files.map(async f => {
    const content = await fs.readFile(f, "utf-8");
    const relativePath = path.relative(appDir, f).replace(/\\/g, "/");
    return `/* --- Original File: ${relativePath} --- */\n${content}\n\n`;
  }));

  const mergedContent = mergedHeader + bodyParts.join("");

  const mergeDir = path.join(appDir, "mergeFiles");
  await fs.mkdir(mergeDir, { recursive: true });
  const outputFileName = `${scope}_merge.${type}`;
  await fs.writeFile(path.join(mergeDir, outputFileName), mergedContent, "utf-8");

  if (type === "js") {
    // 目次生成 (AIの有無に関わらず実行)
    await generateSpecificationToc(appDir, mergedContent);

    if (promptTemplates.length > 0 && !skipAi) {
      const aiGen = handleAiGeneration(appId, appDir, outputFileName, mergedContent, setting, promptTemplates, pastResultDirs, safeAppName);
      for await (const status of aiGen) {
        // AIの各ステップ完了を待機
      }
    }
    await minifyJs(mergedContent, path.join(mergeDir, `${scope}_merge.min.js`));
  }
}

/**
 * 設計書目次.md の生成
 */
const generateSpecificationToc = async (appDir: string, mergedContent: string) => {
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
  fileMappings.push({ start: startLine, end: lines.length, filename: currentFile });

  const markerRegex = /#仕様書@\{(.+?)\}/g;
  const matches = Array.from(mergedContent.matchAll(markerRegex)).map(m => {
    const [marker, functionalName] = m;
    const { index = 0 } = m;
    const lineNumber = mergedContent.substring(0, index).split("\n").length;
    const sourceFile = fileMappings.find(fm => lineNumber >= fm.start && lineNumber <= fm.end)?.filename;
    return { functionalName, marker, lineNumber, sourceFile };
  });

  if (matches.length === 0) return;

  const tocPath = path.join(appDir, "機能一覧.md");
  let tocContent = `# 機能一覧\n\n`;
  tocContent += `| 機能名 | ソースファイル |\n`;
  tocContent += `| :--- | :--- |\n`;

  for (const match of matches) {
    const fm = fileMappings.find(f => match.sourceFile === f.filename);
    const originalLineNumber = fm ? match.lineNumber - fm.start : null;

    const sourceLink = match.sourceFile
      ? `[${path.basename(match.sourceFile)}${originalLineNumber ? `:${originalLineNumber}` : ""}](${match.sourceFile.startsWith(".") ? match.sourceFile : "./" + match.sourceFile}${originalLineNumber ? `#L${originalLineNumber}` : ""})`
      : "-";

    tocContent += `| ${match.functionalName} | ${sourceLink} |\n`;
  }
  await fs.writeFile(tocPath, tocContent, "utf-8");
}

/**
 * AIによる解析処理
 */
const handleAiGeneration = async function* (
  appId: number,
  appDir: string,
  outputFileName: string,
  mergedContent: string,
  setting: Setting,
  promptTemplates: PromptTemplate[],
  pastResultDirs: string[],
  safeAppName: string
): AsyncGenerator<string, void, void> {
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
  fileMappings.push({ start: startLine, end: lines.length, filename: currentFile });

  const markerRegex = /#仕様書@\{(.+?)\}/g;
  const matches: MarkerMatch[] = Array.from(mergedContent.matchAll(markerRegex)).map(m => {
    const [marker, functionalName] = m;
    const { index = 0 } = m;
    const lineNumber = mergedContent.substring(0, index).split("\n").length;
    const sourceFile = fileMappings.find(fm => lineNumber >= fm.start && lineNumber <= fm.end)?.filename;
    return { functionalName, marker, lineNumber, sourceFile };
  });

  if (matches.length === 0) return;

  const resultsDir = path.join(appDir, "prompts_results");
  const promptsDir = path.join(appDir, "prompts");
  await Promise.all([
    fs.mkdir(resultsDir, { recursive: true }),
    fs.mkdir(promptsDir, { recursive: true }),
  ]);

  const aiMessages: any[] = [];
  const { enableAi, aiConfig } = setting;
  if (!enableAi || !aiConfig) return;

  const hasAiTemplates = promptTemplates.some(({ name }) => !name.startsWith("00_"));

  if (hasAiTemplates) {
    aiMessages.push({
      role: "user",
      content: `以下のJavaScriptコードを解析対象として読み込んでください。以降のメッセージで、このコード内の特定の箇所についての設計書作成を個別に依頼します。\n\n\`\`\`javascript\n${mergedContent}\n\`\`\``
    });

    console.log(`  [AI] コードの初期解析を開始します...`);
    const analysisGen = callAiApi(aiMessages, aiConfig);
    let firstResponse = "";
    for await (const chunk of analysisGen) {
      firstResponse += chunk;
    }

    if (firstResponse.startsWith("AI APIサーバーに接続できませんでした。") || firstResponse.startsWith("AI APIの呼び出しに失敗しました")) {
      console.error(`  [Error] AIの初期解析に失敗したため、アプリID: ${appId} のAI処理を中止します。`);
      await writeErrorLog(appDir, `AIの初期解析中にエラーが発生しました。`, firstResponse);
      yield firstResponse;
      return;
    }
    aiMessages.push({ role: "assistant", content: firstResponse });
    yield "初期解析完了";
  }

  await matches.reduce(async (promise, { functionalName, lineNumber }) => {
    await promise;
    const markerLink = `[${lineNumber}行目へ移動](../mergeFiles/${outputFileName}#L${lineNumber})`;
    const fullPrompt = promptTemplates.map(t =>
      t.content.split("{{fileName}}").join(outputFileName).split("{{marker}}").join(markerLink)
        .split("{{functionalName}}").join(functionalName).split("{{content}}").join(mergedContent)
    ).join("\n\n---\n\n");

    const safeFunctionalName = toSafeFileName(functionalName);
    const resultFileName = `${safeFunctionalName}_result.md`;
    const resultFilePath = path.join(resultsDir, resultFileName);

    const exists = await safeRunAsync({
      tryCallback: async () => {
        await fs.access(resultFilePath);
        return true;
      },
      catchCallback: async () => false
    });

    if (exists) {
      console.log(`  [Skip] ${functionalName} の回答は既に存在します。`);
      return;
    }

    const appFolderName = `${appId}_${safeAppName}`;
    const cached = await getCachedResult(pastResultDirs, appFolderName, resultFileName, resultFileName, fullPrompt);

    if (cached) {
      await Promise.all([
        fs.writeFile(path.join(resultsDir, resultFileName), cached, "utf-8"),
        fs.writeFile(path.join(promptsDir, resultFileName), fullPrompt, "utf-8"),
      ]);
      aiMessages.push({ role: "assistant", content: cached });
      console.log(`  [Cache] ${functionalName} の回答を再利用しました。`);

      const parts = cached.split("\n\n").filter(p => p.trim().length > 0);
      if (parts.length === promptTemplates.length) {
        await Promise.all(promptTemplates.map((pt, i) => {
          const individualResultFileName = `${safeFunctionalName}_${pt.name}_result.md`;
          return fs.writeFile(path.join(resultsDir, individualResultFileName), parts[i], "utf-8");
        }));
      }
      return;
    }

    const markerResults: string[] = [];
    let markerFailed = false;

    for (let i = 0; i < promptTemplates.length; i++) {
      const { name, content } = promptTemplates[i];
      const markerLink = `[${lineNumber}行目へ移動](../mergeFiles/${outputFileName}#L${lineNumber})`;

      if (name.startsWith("00_")) {
        const res = content
          .split("{{fileName}}").join(outputFileName)
          .split("{{marker}}").join(markerLink)
          .split("{{functionalName}}").join(functionalName)
          .split("{{content}}").join(mergedContent);
        markerResults.push(res);
        continue;
      }

      const prompt = content
        .split("{{fileName}}").join(outputFileName).split("{{marker}}").join(markerLink)
        .split("{{functionalName}}").join(functionalName).split("{{content}}").join("提示済みのコードを参照してください。");

      aiMessages.push({ role: "user", content: prompt });
      console.log(`  [AI] ${functionalName} の回答を生成中 (${i + 1}/${promptTemplates.length})...`);

      const markerGen = callAiApi(aiMessages, aiConfig);
      let res = "";
      for await (const chunk of markerGen) {
        res += chunk;
      }

      if (res.startsWith("AI APIサーバーに接続できませんでした。") || res.startsWith("AI APIの呼び出しに失敗しました")) {
        console.error(`  [Error] ${functionalName} の回答生成に失敗しました (${name})。このマーカーの処理を中断し、ファイルは保存しません。`);
        await writeErrorLog(appDir, `${functionalName} の回答生成中にAIエラーが発生しました (${name})`, res);
        aiMessages.pop(); // 失敗したプロンプトを履歴から削除
        markerFailed = true;
        break;
      }

      aiMessages.push({ role: "assistant", content: res });
      markerResults.push(res);
    }

    if (!markerFailed && markerResults.length > 0) {
      // 全てのプロンプトが成功した場合のみファイルを保存
      await Promise.all(promptTemplates.map((pt, i) => {
        const individualResultFileName = `${safeFunctionalName}_${pt.name}_result.md`;
        return fs.writeFile(path.join(resultsDir, individualResultFileName), markerResults[i], "utf-8");
      }));

      const combinedResult = markerResults.join("\n\n") + "\n\n";
      await Promise.all([
        fs.writeFile(path.join(resultsDir, resultFileName), combinedResult, "utf-8"),
        fs.writeFile(path.join(promptsDir, resultFileName), fullPrompt, "utf-8"),
      ]);
      console.log(`  [OK] AIの結果を保存しました: prompts_results/${resultFileName}`);
    }
  }, Promise.resolve());

  yield "AI処理完了";
}

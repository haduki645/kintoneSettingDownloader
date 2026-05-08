import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import {
  getAuthHeaders,
  fetchKintoneApi,
  downloadKintoneFile,
  KINTONE_BASE_URL,
} from "./kintone";
import { Setting, MarkerMatch } from "./types";
import { callAiApi, getCachedResult } from "./ai";
import {
  generateLookupMd,
  generateViewMd,
  generateAclMd,
  generateNotificationMd,
} from "./mdGenerators";
import {
  getTimestampedDirName,
  getPastResultDirs,
  cleanupOldResults,
  minifyJs,
  getReadmeContent,
} from "./fileOps";

// メイン処理
async function main() {
  const settingPath = path.join(process.cwd(), "setting.json");
  let setting: Setting;

  try {
    const settingContent = await fs.readFile(settingPath, "utf-8");
    setting = JSON.parse(settingContent);
    if (!Array.isArray(setting.appIds)) {
      throw new Error("setting.json の appIds パラメータが配列ではありません。");
    }
  } catch (err) {
    console.error("setting.json の読み取りに失敗しました:", err);
    return;
  }

  const promptTemplates = await loadPromptTemplates();
  const headers = getAuthHeaders();
  const baseResultDir = path.join(process.cwd(), "result");
  
  // 過去の結果ディレクトリを取得
  const maxCacheCount = setting.maxCacheCount || 5;
  const pastDirsNames = await getPastResultDirs(baseResultDir);
  const pastResultDirs = pastDirsNames.slice(0, maxCacheCount).map(name => path.join(baseResultDir, name));

  // 今回の結果ディレクトリを作成
  const currentResultDirName = getTimestampedDirName();
  const resultDir = path.join(baseResultDir, currentResultDirName);

  await fs.mkdir(resultDir, { recursive: true });
  await fs.writeFile(path.join(resultDir, "readme.md"), getReadmeContent(), "utf-8");

  if (setting.workspaceConfig) {
    await fs.writeFile(
      path.join(resultDir, "result.code-workspace"),
      JSON.stringify(setting.workspaceConfig, null, 2),
      "utf-8"
    );
    console.log(`[OK] result.code-workspace を作成しました。`);
  }

  const appNameCache: Record<string, string> = {};

  for (const appId of setting.appIds) {
    await processApp(appId, setting, headers, resultDir, pastResultDirs, promptTemplates, appNameCache);
  }

  // 古い結果を整理
  await cleanupOldResults(baseResultDir, maxCacheCount);

  console.log(`\n=== すべての処理が完了しました ===`);

  if (setting.workspaceConfig) {
    openWorkspace(path.join(resultDir, "result.code-workspace"));
  }
}

/**
 * プロンプトテンプレートの読み込み
 */
async function loadPromptTemplates(): Promise<string[]> {
  const promptTemplates: string[] = [];
  const promptTemplatesDir = path.join(process.cwd(), "prompt_templates");
  try {
    const files = await fs.readdir(promptTemplatesDir);
    const templateFiles = files.filter(f => f.endsWith(".md") || f.endsWith(".txt")).sort();
    for (const f of templateFiles) {
      promptTemplates.push(await fs.readFile(path.join(promptTemplatesDir, f), "utf-8"));
    }
  } catch (err) {}

  if (promptTemplates.length === 0) {
    const promptTemplatePath = path.join(process.cwd(), "prompt.md");
    try {
      promptTemplates.push(await fs.readFile(promptTemplatePath, "utf-8"));
    } catch (err) {
      console.warn("プロンプトテンプレートが見つからないため、プロンプト生成はスキップされます。");
    }
  }
  return promptTemplates;
}

/**
 * ワークスペースを開く
 */
function openWorkspace(workspacePath: string) {
  console.log(`[Info] result.code-workspace を開きます...`);
  exec(`code "${workspacePath}"`, (err) => {
    if (err) exec(`start "" "${workspacePath}"`);
  });
}

/**
 * アプリごとのメイン処理
 */
async function processApp(
  appId: number,
  setting: Setting,
  headers: any,
  resultDir: string,
  pastResultDirs: string[],
  promptTemplates: string[],
  appNameCache: Record<string, string>
) {
  console.log(`=== アプリID: ${appId} の処理を開始します ===`);
  try {
    const appInfo = await fetchKintoneApi("/k/v1/app.json", appId, headers);
    const appName = appInfo.name;
    if (!appName) throw new Error("アプリ名が取得できませんでした。");

    const safeAppName = appName.replace(/[\\/:*?"<>|]/g, "_");
    const appDir = path.join(resultDir, `${appId}_${safeAppName}`);
    const jsonDir = path.join(appDir, "json");

    await fs.mkdir(jsonDir, { recursive: true });
    await fs.writeFile(path.join(jsonDir, "app.json"), JSON.stringify(appInfo, null, 2), "utf-8");

    // 各種設定の取得と保存
    const fieldsInfo = await fetchKintoneApi("/k/v1/app/form/fields.json", appId, headers);
    await fs.writeFile(path.join(jsonDir, "fields.json"), JSON.stringify(fieldsInfo, null, 2), "utf-8");

    // ルックアップ情報の抽出とMD生成
    await handleLookups(appId, appName, appDir, fieldsInfo, headers, appNameCache);

    const viewsInfo = await fetchKintoneApi("/k/v1/app/views.json", appId, headers);
    await fs.writeFile(path.join(jsonDir, "views.json"), JSON.stringify(viewsInfo, null, 2), "utf-8");
    if (viewsInfo.views) {
      await fs.writeFile(path.join(appDir, "view.md"), generateViewMd(appId, viewsInfo), "utf-8");
    }

    const customizeInfo = await fetchKintoneApi("/k/v1/app/customize.json", appId, headers);
    await fs.writeFile(path.join(jsonDir, "customize.json"), JSON.stringify(customizeInfo, null, 2), "utf-8");

    // 権限設定
    const appAcl = await fetchKintoneApi("/k/v1/app/acl.json", appId, headers);
    const recordAcl = await fetchKintoneApi("/k/v1/record/acl.json", appId, headers);
    const fieldAcl = await fetchKintoneApi("/k/v1/field/acl.json", appId, headers);
    await fs.writeFile(path.join(jsonDir, "appAcl.json"), JSON.stringify(appAcl, null, 2), "utf-8");
    await fs.writeFile(path.join(jsonDir, "recordAcl.json"), JSON.stringify(recordAcl, null, 2), "utf-8");
    await fs.writeFile(path.join(jsonDir, "fieldAcl.json"), JSON.stringify(fieldAcl, null, 2), "utf-8");
    if (appAcl.rights?.length || recordAcl.rights?.length || fieldAcl.rights?.length) {
      await fs.writeFile(path.join(appDir, "acl.md"), generateAclMd(appId, appAcl, recordAcl, fieldAcl), "utf-8");
    }

    // 通知設定
    const notifGen = await fetchKintoneApi("/k/v1/app/notifications/general.json", appId, headers);
    const notifRec = await fetchKintoneApi("/k/v1/app/notifications/perRecord.json", appId, headers);
    const notifRem = await fetchKintoneApi("/k/v1/app/notifications/reminder.json", appId, headers);
    await fs.writeFile(path.join(jsonDir, "notificationsGeneral.json"), JSON.stringify(notifGen, null, 2), "utf-8");
    await fs.writeFile(path.join(jsonDir, "notificationsPerRecord.json"), JSON.stringify(notifRec, null, 2), "utf-8");
    await fs.writeFile(path.join(jsonDir, "notificationsReminder.json"), JSON.stringify(notifRem, null, 2), "utf-8");
    if (notifGen.generalNotifications?.length || notifRec.perRecordNotifications?.length || notifRem.reminderNotifications?.length) {
      await fs.writeFile(path.join(appDir, "notification.md"), generateNotificationMd(appId, notifGen, notifRec, notifRem), "utf-8");
    }

    // アクション・プラグイン
    const actions = await fetchKintoneApi("/k/v1/app/actions.json", appId, headers);
    const plugins = await fetchKintoneApi("/k/v1/app/plugins.json", appId, headers);
    await fs.writeFile(path.join(jsonDir, "actions.json"), JSON.stringify(actions, null, 2), "utf-8");
    await fs.writeFile(path.join(jsonDir, "plugins.json"), JSON.stringify(plugins, null, 2), "utf-8");

    // カスタマイズファイルのダウンロードとマージ
    await handleCustomizeFiles(appId, appName, appDir, customizeInfo, headers, setting, promptTemplates, pastResultDirs, safeAppName);

    console.log(`=== アプリID: ${appId} の処理が完了しました ===\n`);
  } catch (error) {
    console.error(`=== アプリID: ${appId} はエラーが発生したためスキップしました ===\n`, error);
  }
}

/**
 * ルックアップ関係の処理
 */
async function handleLookups(appId: number, appName: string, appDir: string, fieldsInfo: any, headers: any, appNameCache: Record<string, string>) {
  const extractLookups = async (properties: any, prefix = ""): Promise<string[]> => {
    let rows: string[] = [];
    for (const [fieldCode, fieldDef] of Object.entries(properties as Record<string, any>)) {
      if (fieldDef.type === "SUBTABLE" && fieldDef.fields) {
        rows = rows.concat(await extractLookups(fieldDef.fields, `${prefix}${fieldCode} (テーブル) &gt; `));
      } else if (fieldDef.lookup) {
        const lookup = fieldDef.lookup;
        const relatedAppId = lookup.relatedApp?.app || "不明";
        let relatedAppName = "不明";
        if (relatedAppId !== "不明") {
          if (appNameCache[relatedAppId]) {
            relatedAppName = appNameCache[relatedAppId];
          } else {
            try {
              const info = await fetchKintoneApi("/k/v1/app.json", Number(relatedAppId), headers);
              relatedAppName = info.name;
              appNameCache[relatedAppId] = relatedAppName;
            } catch (e) {
              relatedAppName = "取得不可";
              appNameCache[relatedAppId] = relatedAppName;
            }
          }
        }
        const mappings = lookup.fieldMappings || [];
        const rowCount = mappings.length || 1;
        let rowHtml = `    <tr>\n      <td rowspan="${rowCount}">${prefix}${fieldCode}</td>\n`;
        const appUrl = relatedAppId !== "不明" ? `<a href="${KINTONE_BASE_URL}/k/${relatedAppId}/" target="_blank">${relatedAppName} (ID: ${relatedAppId})</a>` : `${relatedAppName} (ID: ${relatedAppId})`;
        rowHtml += `      <td rowspan="${rowCount}">${appUrl}</td>\n      <td rowspan="${rowCount}">${lookup.relatedKeyField}</td>\n`;
        if (mappings.length > 0) {
          rowHtml += `      <td>${mappings[0].field}</td>\n      <td>${mappings[0].relatedField}</td>\n    </tr>\n`;
          for (let i = 1; i < mappings.length; i++) {
            rowHtml += `    <tr>\n      <td>${mappings[i].field}</td>\n      <td>${mappings[i].relatedField}</td>\n    </tr>\n`;
          }
        } else {
          rowHtml += `      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
        }
        rows.push(rowHtml);
      }
    }
    return rows;
  };

  if (fieldsInfo.properties) {
    const rows = await extractLookups(fieldsInfo.properties);
    if (rows.length > 0) {
      await fs.writeFile(path.join(appDir, "lookup_relation.md"), generateLookupMd(appName, appId, rows), "utf-8");
    }
  }
}

/**
 * カスタマイズファイルの処理
 */
async function handleCustomizeFiles(
  appId: number, appName: string, appDir: string, customizeInfo: any, headers: any,
  setting: Setting, promptTemplates: string[], pastResultDirs: string[], safeAppName: string
) {
  const scopes = ["desktop", "mobile"];
  const types = ["js", "css"];
  const customizeDir = path.join(appDir, "customize");

  for (const scope of scopes) {
    for (const type of types) {
      const items = customizeInfo[scope]?.[type] || [];
      const filesToMerge: string[] = [];
      for (const item of items) {
        if (item.type === "FILE" && item.file?.fileKey) {
          const targetDir = path.join(customizeDir, scope, type);
          await fs.mkdir(targetDir, { recursive: true });
          const targetPath = path.join(targetDir, item.file.name.replace(/[\\/:*?"<>|]/g, "_"));
          try {
            const data = await downloadKintoneFile(item.file.fileKey, headers);
            await fs.writeFile(targetPath, data);
            filesToMerge.push(targetPath);
          } catch (e) {}
        }
      }

      if (filesToMerge.length > 0) {
        await processMergeAndAi(appId, appName, appDir, scope, type, filesToMerge, setting, promptTemplates, pastResultDirs, safeAppName);
      }
    }
  }
}

/**
 * マージとAI処理
 */
async function processMergeAndAi(
  appId: number, appName: string, appDir: string, scope: string, type: string,
  allFilePaths: string[], setting: Setting, promptTemplates: string[], pastResultDirs: string[], safeAppName: string
) {
  const exclude = setting.excludeFromMerge || [];
  const files = allFilePaths.filter(p => !exclude.includes(path.basename(p))).sort();
  const excluded = allFilePaths.filter(p => exclude.includes(path.basename(p))).sort();

  let mergedContent = `/*\n アプリ名: ${appName}\n アプリURL: ${KINTONE_BASE_URL}/k/${appId}/\n マージ一覧:\n`;
  files.forEach(f => mergedContent += ` - ${path.basename(f)}\n`);
  mergedContent += ` 除外一覧:\n${excluded.length ? excluded.map(f => ` - ${path.basename(f)}`).join("\n") : " - なし"}\n*/\n\n`;

  for (const f of files) {
    const content = await fs.readFile(f, "utf-8");
    mergedContent += `/* --- Original File: ${path.basename(f)} --- */\n${content}\n\n`;
  }

  const mergeDir = path.join(appDir, "mergeFiles");
  await fs.mkdir(mergeDir, { recursive: true });
  const outputFileName = `${scope}_merge.${type}`;
  await fs.writeFile(path.join(mergeDir, outputFileName), mergedContent, "utf-8");

  if (type === "js") {
    if (promptTemplates.length > 0) {
      await handleAiGeneration(appId, appDir, outputFileName, mergedContent, setting, promptTemplates, pastResultDirs, safeAppName);
    }
    await minifyJs(mergedContent, path.join(mergeDir, `${scope}_merge.min.js`));
  }
}

/**
 * AI生成処理
 */
async function handleAiGeneration(
  appId: number, appDir: string, outputFileName: string, mergedContent: string,
  setting: Setting, promptTemplates: string[], pastResultDirs: string[], safeAppName: string
) {
  const markerRegex = /#仕様書@\{(.+?)\}/g;
  const matches: MarkerMatch[] = [];
  let m;
  while ((m = markerRegex.exec(mergedContent)) !== null) {
    matches.push({ functionalName: m[1], marker: m[0] });
  }

  if (matches.length > 0) {
    const promptsDir = path.join(appDir, "prompts");
    const resultsDir = path.join(appDir, "prompts_results");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.mkdir(resultsDir, { recursive: true });

    let aiMessages: any[] = [];
    if (setting.enableAi && setting.aiConfig) {
      aiMessages.push({
        role: "user",
        content: `以下のJavaScriptコードを解析対象として読み込んでください。以降のメッセージで、このコード内の特定の箇所についての設計書作成を個別に依頼します。\n\n\`\`\`javascript\n${mergedContent}\n\`\`\``
      });
      const firstResponse = await callAiApi(aiMessages, setting.aiConfig);
      aiMessages.push({ role: "assistant", content: firstResponse });

      for (const { functionalName, marker } of matches) {
        const fullPrompt = promptTemplates.map(t =>
          t.split("{{fileName}}").join(outputFileName).split("{{marker}}").join(marker)
            .split("{{functionalName}}").join(functionalName).split("{{content}}").join(mergedContent)
        ).join("\n\n---\n\n");

        await fs.writeFile(path.join(promptsDir, `${functionalName}.md`), fullPrompt, "utf-8");

        const resultFileName = `${functionalName}_result.md`;
        const appFolderName = `${appId}_${safeAppName}`;
        const cached = await getCachedResult(pastResultDirs, appFolderName, `${functionalName}.md`, resultFileName, fullPrompt);

        if (cached) {
          await fs.writeFile(path.join(resultsDir, resultFileName), cached, "utf-8");
          aiMessages.push({ role: "assistant", content: cached });
          console.log(`  [Cache] ${functionalName} の回答を再利用しました。`);
        } else {
          let combinedResult = "";
          for (let i = 0; i < promptTemplates.length; i++) {
            const prompt = promptTemplates[i]
              .split("{{fileName}}").join(outputFileName).split("{{marker}}").join(marker)
              .split("{{functionalName}}").join(functionalName).split("{{content}}").join("提示済みのコードを参照してください。");
            
            aiMessages.push({ role: "user", content: prompt });
            console.log(`  [AI] ${functionalName} の回答を生成中 (${i + 1}/${promptTemplates.length})...`);
            const res = await callAiApi(aiMessages, setting.aiConfig);
            aiMessages.push({ role: "assistant", content: res });
            combinedResult += res + "\n\n";
          }
          await fs.writeFile(path.join(resultsDir, resultFileName), combinedResult, "utf-8");
          console.log(`  [OK] AIの結果を保存しました: prompts_results/${resultFileName}`);
        }
      }
    }
  }
}

// 実行
main().catch(console.error);

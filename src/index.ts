import fs from "fs/promises";
import path from "path";
import {
  getAuthHeaders,
  fetchKintoneApi,
  downloadKintoneFile,
  KINTONE_BASE_URL,
} from "./kintone";
import { minify } from "terser";
import axios from "axios";
import { exec } from "child_process";


// メイン処理
async function main() {
  // 外部の JSON ファイルから設定を読み込む
  const settingPath = path.join(process.cwd(), "setting.json");
  let appIds: number[] = [];
  let excludeFromMerge: string[] = [];
  let enableAi = false;
  let aiConfig = { baseUrl: "http://localhost:1234/v1", model: "local-model" };
  let workspaceConfig: any = null;

  try {
    const settingContent = await fs.readFile(settingPath, "utf-8");
    const setting = JSON.parse(settingContent);
    appIds = setting.appIds;
    excludeFromMerge = setting.excludeFromMerge || [];
    enableAi = setting.enableAi || false;
    aiConfig = setting.aiConfig || { baseUrl: "http://localhost:1234/v1", model: "local-model" };
    workspaceConfig = setting.workspaceConfig || null;

    if (!Array.isArray(appIds)) {
      throw new Error("setting.json の appIds パラメータが配列ではありません。");
    }
  } catch (err) {
    console.error("setting.json の読み取りに失敗しました:", err);
    return;
  }

  // プロンプトテンプレートの読み込み
  const promptTemplates: string[] = [];
  const promptTemplatesDir = path.join(process.cwd(), "prompt_templates");
  try {
    const files = await fs.readdir(promptTemplatesDir);
    const mdFiles = files.filter(f => f.endsWith(".md")).sort();
    for (const f of mdFiles) {
      const content = await fs.readFile(path.join(promptTemplatesDir, f), "utf-8");
      promptTemplates.push(content);
    }
  } catch (err) {
    // フォルダがない場合は従来の prompt.md を使用
  }

  if (promptTemplates.length === 0) {
    const promptTemplatePath = path.join(process.cwd(), "prompt.md");
    try {
      const content = await fs.readFile(promptTemplatePath, "utf-8");
      promptTemplates.push(content);
    } catch (err) {
      console.warn("プロンプトテンプレートが見つからないため、プロンプト生成はスキップされます。");
    }
  }

  // API呼び出し用のヘッダーを取得
  const headers = getAuthHeaders();

  // 実行ディレクトリ直下に result フォルダを作成
  const resultDir = path.join(process.cwd(), "result");

  // resultフォルダを初期化 (既存の場合は削除して再作成)
  try {
    await fs.rm(resultDir, { recursive: true, force: true });
    await fs.mkdir(resultDir, { recursive: true });

    // readme.md の作成
    const readmeContent = `# ダウンロードされたファイルの説明

各アプリフォルダ内にダウンロードされるJSONファイルおよびディレクトリの意味は以下の通りです。

- \`json/app.json\`: アプリの基本情報（アプリ名、説明、アイコンなど） / API: \`/k/v1/app.json\`
- \`json/fields.json\`: フォームフィールド情報（各フィールドのタイプ、コード、設定など） / API: \`/k/v1/app/form/fields.json\`
- \`json/views.json\`: 一覧設定情報（各一覧の表示形式、条件、フィールドなど） / API: \`/k/v1/app/views.json\`
- \`json/customize.json\`: カスタマイズ情報（適用されているJavaScript/CSSファイルの設定など） / API: \`/k/v1/app/customize.json\`
- \`json/appAcl.json\`: アプリのアクセス権設定 / API: \`/k/v1/app/acl.json\`
- \`json/recordAcl.json\`: レコードのアクセス権設定 / API: \`/k/v1/record/acl.json\`
- \`json/fieldAcl.json\`: フィールドのアクセス権設定 / API: \`/k/v1/field/acl.json\`
- \`json/notificationsGeneral.json\`: アプリの条件通知設定 / API: \`/k/v1/app/notifications/general.json\`
- \`json/notificationsPerRecord.json\`: レコードの条件通知設定 / API: \`/k/v1/app/notifications/perRecord.json\`
- \`json/notificationsReminder.json\`: リマインダーの条件通知設定 / API: \`/k/v1/app/notifications/reminder.json\`
- \`json/actions.json\`: アプリアクション設定 / API: \`/k/v1/app/actions.json\`
- \`json/plugins.json\`: プラグイン設定 / API: \`/k/v1/app/plugins.json\`
- \`lookup_relation.md\`: ルックアップ設定がされている場合に作成される関係一覧
- \`view.md\`: アプリの一覧設定（絞り込み条件など）と各一覧へのリンク
- \`acl.md\`: アプリ、レコード、フィールドのアクセス権設定一覧（設定が無い場合は未出力）
- \`notification.md\`: アプリ、レコード、リマインダーの通知設定一覧（設定が無い場合は未出力）
- \`customize/\`: \`customize.json\` で設定されているJavaScript/CSSファイルの実体が保存されるフォルダ / API: \`/k/v1/file.json\`
- \`mergeFiles/\`: マージおよびミニファイされたJavaScript/CSSファイルが保存されるフォルダ
- \`prompts/\`: 仕様書マーカーから生成された AI へのプロンプトファイルが保存されるフォルダ
- \`prompts_results/\`: AI によって生成された回答（仕様書）が保存されるフォルダ
`;
    await fs.writeFile(path.join(resultDir, "readme.md"), readmeContent, "utf-8");

    // .code-workspace の作成
    if (workspaceConfig) {
      const workspacePath = path.join(resultDir, "result.code-workspace");
      await fs.writeFile(workspacePath, JSON.stringify(workspaceConfig, null, 2), "utf-8");
      console.log(`[OK] result.code-workspace を作成しました。`);
    }
  } catch (err) {
    console.error("resultディレクトリの初期化に失敗しました:", err);
    return;
  }

  // 取得したアプリ名をキャッシュしてAPI呼び出しを減らす
  const appNameCache: Record<string, string> = {};

  for (const appId of appIds) {
    console.log(`=== アプリID: ${appId} の処理を開始します ===`);
    try {
      // 1. アプリ情報の取得 (GET /k/v1/app.json)
      const appInfo = await fetchKintoneApi("/k/v1/app.json", appId, headers);
      const appName = appInfo.name;

      if (!appName) {
        throw new Error(
          "アプリ名が取得できませんでした。権限等を確認してください。",
        );
      }

      // フォルダ名: 「アプリID_アプリ名」 (ファイル名に使用できない文字を置換)
      const safeAppName = appName.replace(/[\\/:*?"<>|]/g, "_");
      const appDir = path.join(resultDir, `${appId}_${safeAppName}`);

      // アプリ固有のフォルダを作成
      await fs.mkdir(appDir, { recursive: true });
      const jsonDir = path.join(appDir, "json");
      await fs.mkdir(jsonDir, { recursive: true });

      // app.json を保存
      await fs.writeFile(
        path.join(jsonDir, "app.json"),
        JSON.stringify(appInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] app.json を保存しました。`);

      // 2. フォームフィールド情報の取得 (GET /k/v1/app/form/fields.json)
      const fieldsInfo = await fetchKintoneApi(
        "/k/v1/app/form/fields.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "fields.json"),
        JSON.stringify(fieldsInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] fields.json を保存しました。`);

      // ルックアップ情報の抽出
      const extractLookups = async (properties: any, prefix = ""): Promise<string[]> => {
        let rows: string[] = [];
        for (const [fieldCode, fieldDef] of Object.entries(properties as Record<string, any>)) {
          if (fieldDef.type === "SUBTABLE" && fieldDef.fields) {
            const subRows = await extractLookups(fieldDef.fields, `${prefix}${fieldCode} (テーブル) &gt; `);
            rows = rows.concat(subRows);
          } else if (fieldDef.lookup) {
            const lookup = fieldDef.lookup;
            const relatedAppId = lookup.relatedApp ? lookup.relatedApp.app : "不明";

            let relatedAppName = "不明";
            if (relatedAppId !== "不明") {
              if (appNameCache[relatedAppId]) {
                relatedAppName = appNameCache[relatedAppId];
              } else {
                try {
                  const relatedAppInfo = await fetchKintoneApi("/k/v1/app.json", Number(relatedAppId), headers);
                  relatedAppName = relatedAppInfo.name;
                  appNameCache[relatedAppId] = relatedAppName;
                } catch (e) {
                  relatedAppName = "取得不可（権限エラー等）";
                  appNameCache[relatedAppId] = relatedAppName;
                }
              }
            }

            const relatedKeyField = lookup.relatedKeyField;
            const mappings = lookup.fieldMappings || [];
            const rowCount = mappings.length > 0 ? mappings.length : 1;

            let rowHtml = `    <tr>\n`;
            rowHtml += `      <td rowspan="${rowCount}">${prefix}${fieldCode}</td>\n`;
            if (relatedAppId !== "不明") {
              const appUrl = `${KINTONE_BASE_URL}/k/${relatedAppId}/`;
              rowHtml += `      <td rowspan="${rowCount}"><a href="${appUrl}" target="_blank">${relatedAppName} (ID: ${relatedAppId})</a></td>\n`;
            } else {
              rowHtml += `      <td rowspan="${rowCount}">${relatedAppName} (ID: ${relatedAppId})</td>\n`;
            }
            rowHtml += `      <td rowspan="${rowCount}">${relatedKeyField}</td>\n`;

            if (mappings.length > 0) {
              rowHtml += `      <td>${mappings[0].field}</td>\n`;
              rowHtml += `      <td>${mappings[0].relatedField}</td>\n`;
              rowHtml += `    </tr>\n`;
              for (let i = 1; i < mappings.length; i++) {
                rowHtml += `    <tr>\n`;
                rowHtml += `      <td>${mappings[i].field}</td>\n`;
                rowHtml += `      <td>${mappings[i].relatedField}</td>\n`;
                rowHtml += `    </tr>\n`;
              }
            } else {
              rowHtml += `      <td>-</td>\n`;
              rowHtml += `      <td>-</td>\n`;
              rowHtml += `    </tr>\n`;
            }

            rows.push(rowHtml);
          }
        }
        return rows;
      };

      let appLookupRows: string[] = [];
      if (fieldsInfo && fieldsInfo.properties) {
        appLookupRows = await extractLookups(fieldsInfo.properties);
      }
      if (appLookupRows.length > 0) {
        const mdContent = `# ルックアップ関係一覧\n\n## [${appName} (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n` +
          `<style>\n` +
          `  table { border-collapse: collapse; width: 100%; font-size: 14px; }\n` +
          `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
          `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
          `  td { background-color: #fff; }\n` +
          `  tbody tr:hover td { background-color: #f9fafb; }\n` +
          `</style>\n\n` +
          `<table>\n` +
          `  <thead>\n` +
          `    <tr>\n` +
          `      <th>配置先フィールド</th>\n` +
          `      <th>取得先アプリ</th>\n` +
          `      <th>キーフィールド</th>\n` +
          `      <th>コピー先 (自アプリ)</th>\n` +
          `      <th>コピー元 (他アプリ)</th>\n` +
          `    </tr>\n` +
          `  </thead>\n` +
          `  <tbody>\n` +
          appLookupRows.join("") +
          `  </tbody>\n` +
          `</table>\n`;
        await fs.writeFile(path.join(appDir, "lookup_relation.md"), mdContent, "utf-8");
        console.log(`  [OK] lookup_relation.md を保存しました。`);
      }

      // 3. 一覧設定情報の取得 (GET /k/v1/app/views.json)
      const viewsInfo = await fetchKintoneApi(
        "/k/v1/app/views.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "views.json"),
        JSON.stringify(viewsInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] views.json を保存しました。`);

      // view.md の生成
      if (viewsInfo && viewsInfo.views) {
        let viewMdContent = `# [一覧設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
        const style = `<style>\n` +
          `  table { border-collapse: collapse; width: 100%; font-size: 14px; }\n` +
          `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
          `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
          `  td { background-color: #fff; }\n` +
          `  tbody tr:hover td { background-color: #f9fafb; }\n` +
          `</style>\n\n`;
        viewMdContent += style;
        viewMdContent += `<table>\n`;
        viewMdContent += `  <thead>\n`;
        viewMdContent += `    <tr>\n`;
        viewMdContent += `      <th>一覧名</th>\n`;
        viewMdContent += `      <th>表示形式</th>\n`;
        viewMdContent += `      <th>絞り込み条件</th>\n`;
        viewMdContent += `    </tr>\n`;
        viewMdContent += `  </thead>\n`;
        viewMdContent += `  <tbody>\n`;

        const viewsArray = Object.values(viewsInfo.views as Record<string, any>).sort((a, b) => Number(a.index) - Number(b.index));

        for (const view of viewsArray) {
          const viewUrl = `${KINTONE_BASE_URL}/k/${appId}/?view=${view.id}`;
          const filterCond = view.filterCond ? `\`${view.filterCond}\`` : "なし";
          viewMdContent += `    <tr>\n`;
          viewMdContent += `      <td><a href="${viewUrl}" target="_blank">${view.name}</a></td>\n`;
          viewMdContent += `      <td>${view.type}</td>\n`;
          viewMdContent += `      <td>${filterCond}</td>\n`;
          viewMdContent += `    </tr>\n`;
        }

        viewMdContent += `  </tbody>\n`;
        viewMdContent += `</table>\n`;

        await fs.writeFile(path.join(appDir, "view.md"), viewMdContent, "utf-8");
        console.log(`  [OK] view.md を保存しました。`);
      }

      // 4. カスタマイズ情報の取得 (GET /k/v1/app/customize.json)
      const customizeInfo = await fetchKintoneApi(
        "/k/v1/app/customize.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "customize.json"),
        JSON.stringify(customizeInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] customize.json を保存しました。`);

      // 5. 各種権限設定の取得 (GET /k/v1/app/acl.json, /k/v1/record/acl.json, /k/v1/field/acl.json)
      const appAclInfo = await fetchKintoneApi(
        "/k/v1/app/acl.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "appAcl.json"),
        JSON.stringify(appAclInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] appAcl.json を保存しました。`);

      const recordAclInfo = await fetchKintoneApi(
        "/k/v1/record/acl.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "recordAcl.json"),
        JSON.stringify(recordAclInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] recordAcl.json を保存しました。`);

      const fieldAclInfo = await fetchKintoneApi(
        "/k/v1/field/acl.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "fieldAcl.json"),
        JSON.stringify(fieldAclInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] fieldAcl.json を保存しました。`);

      // acl.md の生成
      const appRights = appAclInfo.rights || [];
      const recordRights = recordAclInfo.rights || [];
      const fieldRights = fieldAclInfo.rights || [];

      if (appRights.length > 0 || recordRights.length > 0 || fieldRights.length > 0) {
        let aclMdContent = `# [アクセス権設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
        const style = `<style>\n` +
          `  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }\n` +
          `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
          `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
          `  td { background-color: #fff; }\n` +
          `  tbody tr:hover td { background-color: #f9fafb; }\n` +
          `  .permission-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 2px; color: #fff; }\n` +
          `  .perm-ok { background-color: #28a745; }\n` +
          `  .perm-ng { background-color: #dc3545; }\n` +
          `</style>\n\n`;
        aclMdContent += style;

        // 5-1. アプリのアクセス権
        aclMdContent += `## アプリのアクセス権\n\n`;
        aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>対象</th>\n      <th>レコード閲覧</th>\n      <th>レコード追加</th>\n      <th>レコード編集</th>\n      <th>レコード削除</th>\n      <th>アプリ管理</th>\n      <th>ファイル出力</th>\n      <th>ファイル取り込み</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
        for (const right of appRights) {
          const entity = right.entity.code || right.entity.type;
          const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
          aclMdContent += `    <tr>\n`;
          aclMdContent += `      <td>${entity}</td>\n`;
          aclMdContent += `      <td>${check(right.recordViewable)}</td>\n`;
          aclMdContent += `      <td>${check(right.recordAddable)}</td>\n`;
          aclMdContent += `      <td>${check(right.recordEditable)}</td>\n`;
          aclMdContent += `      <td>${check(right.recordDeletable)}</td>\n`;
          aclMdContent += `      <td>${check(right.appEditable)}</td>\n`;
          aclMdContent += `      <td>${check(right.fileExportable)}</td>\n`;
          aclMdContent += `      <td>${check(right.fileImportable)}</td>\n`;
          aclMdContent += `    </tr>\n`;
        }
        aclMdContent += `  </tbody>\n</table>\n\n`;

        // 5-2. レコードのアクセス権
        if (recordRights.length > 0) {
          aclMdContent += `## レコードのアクセス権\n\n`;
          aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>優先度</th>\n      <th>条件</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n      <th>削除</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
          let priority = 1;
          for (const right of recordRights) {
            const rowCount = right.entities.length;
            for (let i = 0; i < rowCount; i++) {
              const entityRight = right.entities[i];
              const entity = entityRight.entity.code || entityRight.entity.type;
              const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
              aclMdContent += `    <tr>\n`;
              if (i === 0) {
                aclMdContent += `      <td rowspan="${rowCount}">${priority}</td>\n`;
                aclMdContent += `      <td rowspan="${rowCount}">${right.filterCond || "なし"}</td>\n`;
              }
              aclMdContent += `      <td>${entity}</td>\n`;
              aclMdContent += `      <td>${check(entityRight.viewable)}</td>\n`;
              aclMdContent += `      <td>${check(entityRight.editable)}</td>\n`;
              aclMdContent += `      <td>${check(entityRight.deletable)}</td>\n`;
              aclMdContent += `    </tr>\n`;
            }
            priority++;
          }
          aclMdContent += `  </tbody>\n</table>\n\n`;
        }

        // 5-3. フィールドのアクセス権
        if (fieldRights.length > 0) {
          aclMdContent += `## フィールドのアクセス権\n\n`;
          aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>フィールドコード</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
          for (const right of fieldRights) {
            const rowCount = right.entities.length;
            for (let i = 0; i < rowCount; i++) {
              const entityRight = right.entities[i];
              const entity = entityRight.entity.code || entityRight.entity.type;
              const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
              aclMdContent += `    <tr>\n`;
              if (i === 0) {
                aclMdContent += `      <td rowspan="${rowCount}">${right.code}</td>\n`;
              }
              aclMdContent += `      <td>${entity}</td>\n`;
              aclMdContent += `      <td>${check(entityRight.viewable)}</td>\n`;
              aclMdContent += `      <td>${check(entityRight.editable)}</td>\n`;
              aclMdContent += `    </tr>\n`;
            }
          }
          aclMdContent += `  </tbody>\n</table>\n\n`;
        }

        await fs.writeFile(path.join(appDir, "acl.md"), aclMdContent, "utf-8");
        console.log(`  [OK] acl.md を保存しました。`);
      }

      // 6. 通知設定の取得 (GET /k/v1/app/notifications/general.json, etc.)
      const notificationsGeneralInfo = await fetchKintoneApi(
        "/k/v1/app/notifications/general.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "notificationsGeneral.json"),
        JSON.stringify(notificationsGeneralInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] notificationsGeneral.json を保存しました。`);

      const notificationsPerRecordInfo = await fetchKintoneApi(
        "/k/v1/app/notifications/perRecord.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "notificationsPerRecord.json"),
        JSON.stringify(notificationsPerRecordInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] notificationsPerRecord.json を保存しました。`);

      const notificationsReminderInfo = await fetchKintoneApi(
        "/k/v1/app/notifications/reminder.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "notificationsReminder.json"),
        JSON.stringify(notificationsReminderInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] notificationsReminder.json を保存しました。`);

      // notification.md の生成
      const generalNotifs = notificationsGeneralInfo.generalNotifications || [];
      const perRecordNotifs = notificationsPerRecordInfo.perRecordNotifications || [];
      const reminderNotifs = notificationsReminderInfo.reminderNotifications || [];

      if (generalNotifs.length > 0 || perRecordNotifs.length > 0 || reminderNotifs.length > 0) {
        let notifMdContent = `# [通知設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
        notifMdContent += `<style>\n` +
          `  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }\n` +
          `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
          `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
          `  td { background-color: #fff; }\n` +
          `  tbody tr:hover td { background-color: #f9fafb; }\n` +
          `  .permission-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 2px; color: #fff; }\n` +
          `  .perm-ok { background-color: #28a745; }\n` +
          `  .perm-ng { background-color: #dc3545; }\n` +
          `</style>\n\n`;

        // 6-1. アプリの条件通知
        if (generalNotifs.length > 0) {
          notifMdContent += `## アプリの条件通知\n\n`;
          notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>対象</th>\n      <th>レコード追加</th>\n      <th>編集</th>\n      <th>ステータス更新</th>\n      <th>コメント追加</th>\n      <th>ファイル読み込み</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
          for (const notif of generalNotifs) {
            const entity = notif.entity.code || notif.entity.type;
            const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
            notifMdContent += `    <tr>\n`;
            notifMdContent += `      <td>${entity}</td>\n`;
            notifMdContent += `      <td>${check(notif.recordAdded)}</td>\n`;
            notifMdContent += `      <td>${check(notif.recordEdited)}</td>\n`;
            notifMdContent += `      <td>${check(notif.statusChanged)}</td>\n`;
            notifMdContent += `      <td>${check(notif.commentAdded)}</td>\n`;
            notifMdContent += `      <td>${check(notif.fileImported)}</td>\n`;
            notifMdContent += `    </tr>\n`;
          }
          notifMdContent += `  </tbody>\n</table>\n\n`;
        }

        // 6-2. レコードの条件通知
        if (perRecordNotifs.length > 0) {
          notifMdContent += `## レコードの条件通知\n\n`;
          notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
          for (const notif of perRecordNotifs) {
            const rowCount = notif.targets.length;
            for (let i = 0; i < rowCount; i++) {
              const target = notif.targets[i];
              const entity = target.entity.code || target.entity.type;
              notifMdContent += `    <tr>\n`;
              if (i === 0) {
                notifMdContent += `      <td rowspan="${rowCount}">${notif.filterCond || "なし"}</td>\n`;
              }
              notifMdContent += `      <td>${entity}</td>\n`;
              if (i === 0) {
                notifMdContent += `      <td rowspan="${rowCount}">${notif.title || ""}</td>\n`;
              }
              notifMdContent += `    </tr>\n`;
            }
          }
          notifMdContent += `  </tbody>\n</table>\n\n`;
        }

        // 6-3. リマインダー의 条件通知
        if (reminderNotifs.length > 0) {
          notifMdContent += `## リマインダーの条件通知\n\n`;
          notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>通知タイミング</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
          for (const notif of reminderNotifs) {
            const rowCount = notif.targets.length;
            const timing = notif.timing ? `${notif.timing.code} ${notif.timing.days}日 ${notif.timing.hours}時間 ${notif.timing.minutes}分` : "";
            for (let i = 0; i < rowCount; i++) {
              const target = notif.targets[i];
              const entity = target.entity.code || target.entity.type;
              notifMdContent += `    <tr>\n`;
              if (i === 0) {
                notifMdContent += `      <td rowspan="${rowCount}">${notif.filterCond || "なし"}</td>\n`;
                notifMdContent += `      <td rowspan="${rowCount}">${timing}</td>\n`;
              }
              notifMdContent += `      <td>${entity}</td>\n`;
              if (i === 0) {
                notifMdContent += `      <td rowspan="${rowCount}">${notif.title || ""}</td>\n`;
              }
              notifMdContent += `    </tr>\n`;
            }
          }
          notifMdContent += `  </tbody>\n</table>\n\n`;
        }

        await fs.writeFile(path.join(appDir, "notification.md"), notifMdContent, "utf-8");
        console.log(`  [OK] notification.md を保存しました。`);
      }

      // 7. アクション設定の取得 (GET /k/v1/app/actions.json)
      const actionsInfo = await fetchKintoneApi(
        "/k/v1/app/actions.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "actions.json"),
        JSON.stringify(actionsInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] actions.json を保存しました。`);

      // 8. プラグイン設定の取得 (GET /k/v1/app/plugins.json)
      const pluginsInfo = await fetchKintoneApi(
        "/k/v1/app/plugins.json",
        appId,
        headers,
      );
      await fs.writeFile(
        path.join(jsonDir, "plugins.json"),
        JSON.stringify(pluginsInfo, null, 2),
        "utf-8",
      );
      console.log(`  [OK] plugins.json を保存しました。`);

      // 9. カスタマイズファイル(JavaScript/CSS)の実体をダウンロード
      const scopes = ["desktop", "mobile"];
      const types = ["js", "css"];

      // カスタマイズファイルの基点となるフォルダ
      const customizeDir = path.join(appDir, "customize");

      for (const scope of scopes) {
        for (const type of types) {
          const items = customizeInfo[scope]?.[type] || [];
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type === "FILE" && item.file && item.file.fileKey) {
              // 保存先のディレクトリ (例: customize/desktop/js)
              const targetDir = path.join(customizeDir, scope, type);
              // フォルダが存在しない場合は作成 (複数回呼ばれても recursive: true なのでエラーにならない)
              await fs.mkdir(targetDir, { recursive: true });

              const fileKey = item.file.fileKey;
              const fileName = item.file.name;

              // 安全なファイル名にする
              const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, "_");
              const targetFileName = safeFileName;
              const targetFilePath = path.join(targetDir, targetFileName);

              try {
                const fileData = await downloadKintoneFile(fileKey, headers);
                await fs.writeFile(targetFilePath, fileData);
                console.log(
                  `  [OK] カスタマイズファイルを保存しました: customize/${scope}/${type}/${targetFileName}`,
                );
              } catch (fileErr) {
                console.error(
                  `  [Error] カスタマイズファイルの保存に失敗しました: customize/${scope}/${type}/${targetFileName}`,
                );
              }
            }
          }
        }
      }

      // 10. カスタマイズファイルをマージ
      for (const scope of scopes) {
        for (const type of types) {
          const targetDir = path.join(customizeDir, scope, type);
          if (await fs.stat(targetDir).catch(() => null)) {
            const allFiles = (await fs.readdir(targetDir)).filter(file => file.endsWith(`.${type}`));
            const files = allFiles
              .filter(file => !excludeFromMerge.includes(file))
              .sort();
            const excludedFiles = allFiles
              .filter(file => excludeFromMerge.includes(file))
              .sort();

            if (files.length > 0) {
              let mergedContent = "";

              // ヘッダーの作成
              mergedContent += "/*\n";
              mergedContent += ` アプリ名: ${appName}\n`;
              mergedContent += ` アプリURL: ${KINTONE_BASE_URL}/k/${appId}/\n`;
              mergedContent += ` マージしたファイルの一覧:\n`;
              files.forEach(f => {
                mergedContent += ` - ${f}\n`;
              });
              mergedContent += ` 除外したファイルの一覧:\n`;
              if (excludedFiles.length > 0) {
                excludedFiles.forEach(f => {
                  mergedContent += ` - ${f}\n`;
                });
              } else {
                mergedContent += ` - なし\n`;
              }
              mergedContent += "*/\n\n";

              const commentStart = "/* --- ";
              const commentEnd = " --- */";

              for (const file of files) {
                const content = await fs.readFile(path.join(targetDir, file), "utf-8");
                mergedContent += `${commentStart}Original File: ${file}${commentEnd}\n`;
                mergedContent += content;
                mergedContent += "\n\n";
              }

              const mergeFilesDir = path.join(appDir, "mergeFiles");
              await fs.mkdir(mergeFilesDir, { recursive: true });

              const outputFileName = `${scope}_merge.${type}`;
              await fs.writeFile(path.join(mergeFilesDir, outputFileName), mergedContent, "utf-8");
              console.log(`  [OK] マージファイルを作成しました: mergeFiles/${outputFileName}`);

              // JSの場合はプロンプト生成とミニファイ版作成
              if (type === "js") {
                // プロンプト生成の実行
                if (promptTemplates.length > 0) {
                  const markerRegex = /#仕様書@\{(.+?)\}/g;
                  const matches: { functionalName: string; marker: string }[] = [];
                  let match;
                  while ((match = markerRegex.exec(mergedContent)) !== null) {
                    matches.push({ functionalName: match[1], marker: match[0] });
                  }

                  if (matches.length > 0) {
                    const promptsDir = path.join(appDir, "prompts");
                    const promptsResultsDir = path.join(appDir, "prompts_results");
                    await fs.mkdir(promptsDir, { recursive: true });
                    await fs.mkdir(promptsResultsDir, { recursive: true });

                    let aiMessages: any[] = [];
                    if (enableAi) {
                      aiMessages.push({
                        role: "user",
                        content: `以下のJavaScriptコードを解析対象として読み込んでください。以降のメッセージで、このコード内の特定の箇所についての設計書作成を個別に依頼します。\n\n\`\`\`javascript\n${mergedContent}\n\`\`\``
                      });
                      console.log(`  [AI] 解析対象のコード（${outputFileName}）を送信中...`);
                      const firstResponse = await callAiApi(aiMessages, aiConfig);
                      aiMessages.push({ role: "assistant", content: firstResponse });
                    }

                    for (const { functionalName, marker } of matches) {
                      const promptFileName = `${functionalName}.md`;

                      // ディスク保存用の全プロンプト結合
                      const fullPromptContent = promptTemplates.map(template =>
                        template
                          .split("{{fileName}}").join(outputFileName)
                          .split("{{marker}}").join(marker)
                          .split("{{functionalName}}").join(functionalName)
                          .split("{{content}}").join(mergedContent)
                      ).join("\n\n---\n\n");

                      await fs.writeFile(path.join(promptsDir, promptFileName), fullPromptContent, "utf-8");
                      console.log(`  [OK] プロンプトファイルを作成しました: prompts/${promptFileName}`);

                      if (enableAi) {
                        let combinedAiResult = "";
                        for (let i = 0; i < promptTemplates.length; i++) {
                          const template = promptTemplates[i];
                          const specificPrompt = template
                            .split("{{fileName}}").join(outputFileName)
                            .split("{{marker}}").join(marker)
                            .split("{{functionalName}}").join(functionalName)
                            .split("{{content}}").join("提示済みのコードを参照してください。");

                          aiMessages.push({ role: "user", content: specificPrompt });

                          console.log(`  [AI] ${functionalName} の回答を生成中 (${i + 1}/${promptTemplates.length})...`);
                          const aiResult = await callAiApi(aiMessages, aiConfig);
                          aiMessages.push({ role: "assistant", content: aiResult });
                          combinedAiResult += aiResult + "\n\n";
                        }

                        const resultFileName = `${functionalName}_result.md`;
                        await fs.writeFile(path.join(promptsResultsDir, resultFileName), combinedAiResult, "utf-8");
                        console.log(`  [OK] AIの結果を保存しました: prompts_results/${resultFileName}`);
                      }
                    }
                  }
                }

                try {
                  const minified = await minify(mergedContent);
                  if (minified.code) {
                    const minFileName = `${scope}_merge.min.js`;
                    await fs.writeFile(path.join(mergeFilesDir, minFileName), minified.code, "utf-8");
                    console.log(`  [OK] ミニファイファイルを作成しました: mergeFiles/${minFileName}`);
                  }
                } catch (minifyErr) {
                  console.error(`  [Error] ミニファイに失敗しました: ${outputFileName}`, minifyErr);
                }
              }
            }
          }
        }
      }

      console.log(`=== アプリID: ${appId} の処理が完了しました ===\n`);
    } catch (error) {
      console.error(
        `=== アプリID: ${appId} はエラーが発生したためスキップしました ===\n`,
      );
    }
  }

  console.log(`\n=== すべての処理が完了しました ===`);

  if (workspaceConfig) {
    const workspacePath = path.join(resultDir, "result.code-workspace");
    console.log(`[Info] result.code-workspace を開きます...`);
    exec(`code "${workspacePath}"`, (err) => {
      if (err) {
        // code コマンドが使えない場合は start コマンドを試す
        exec(`start "" "${workspacePath}"`);
      }
    });
  }
}

// AI API呼び出し用のヘルパー関数
async function callAiApi(messages: any[], config: { baseUrl: string; model: string }) {
  try {
    const response = await axios.post(`${config.baseUrl}/chat/completions`, {
      model: config.model,
      messages: messages,
      temperature: 0.7,
    });
    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error("AI APIの呼び出しに失敗しました:", error.message || error);
    return `AI APIの呼び出しに失敗しました: ${error.message || error}`;
  }
}

// 実行
main().catch(console.error);


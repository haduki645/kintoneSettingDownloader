import { CONSTANTS } from "./constants";
import fs from "fs/promises";
import path from "path";
import { minify } from "terser";
import { formatTimestamp, errorToString, safeRunAsync } from "./utils";

/**
 * 比較用フォルダのJSONファイルから不要なプロパティ（revisionなど）を削除する
 */
export const cleanJsonForComparison = async (jsonDir: string) => {
  const files = await fs.readdir(jsonDir).catch(() => []);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(jsonDir, file);
    try {
      const excludeFiles = [
        CONSTANTS.FILE_APP_JSON,
        CONSTANTS.FILE_APP_ACL_JSON,
        CONSTANTS.FILE_FIELD_ACL_JSON,
        CONSTANTS.FILE_RECORD_ACL_JSON,
        CONSTANTS.FILE_NOTIF_GENERAL_JSON,
        CONSTANTS.FILE_NOTIF_RECORD_JSON,
        CONSTANTS.FILE_NOTIF_REMINDER_JSON,
      ];
      if (excludeFiles.includes(file)) {
        await fs.unlink(filePath);
        continue;
      }

      const content = await fs.readFile(filePath, "utf-8");
      const obj = JSON.parse(content);
      
      // 1. 全ファイル共通: revisionの削除
      if (obj.revision !== undefined) {
        delete obj.revision;
      }

      // 2. views.json: 各ビューの id を削除
      if (file === CONSTANTS.FILE_VIEWS_JSON && obj.views) {
        for (const viewKey of Object.keys(obj.views)) {
          if (obj.views[viewKey].id !== undefined) {
            delete obj.views[viewKey].id;
          }
        }
      }

      // 3. fields.json: relatedApp の app を削除 および ソート処理
      if (file === CONSTANTS.FILE_FIELDS_JSON && obj.properties) {
        const removeRelatedAppId = (node: any) => {
          if (Array.isArray(node)) {
            node.forEach(removeRelatedAppId);
          } else if (node && typeof node === "object") {
            if (node.relatedApp && typeof node.relatedApp === "object" && node.relatedApp.app !== undefined) {
              delete node.relatedApp.app;
            }
            Object.values(node).forEach(removeRelatedAppId);
          }
        };
        removeRelatedAppId(obj.properties);

        const sortObjectKeys = (node: any): any => {
          if (Array.isArray(node)) {
            return node.map(item => sortObjectKeys(item));
          } else if (node !== null && typeof node === "object") {
            const keys = Object.keys(node);
            
            const isIndexSort = keys.length > 0 && keys.every(k => 
              typeof node[k] === "object" && node[k] !== null && node[k].index !== undefined
            );
            
            if (isIndexSort) {
              keys.sort((a, b) => Number(node[a].index) - Number(node[b].index));
            } else {
              keys.sort();
            }

            const newNode: any = {};
            for (const key of keys) {
              newNode[key] = sortObjectKeys(node[key]);
            }
            return newNode;
          }
          return node;
        };

        obj.properties = sortObjectKeys(obj.properties);
      }

      // 4. customize.json: fileKey, contentType, size を削除
      if (file === CONSTANTS.FILE_CUSTOMIZE_JSON) {
        const removeUnnecessaryFileProps = (node: any) => {
          if (Array.isArray(node)) {
            node.forEach(removeUnnecessaryFileProps);
          } else if (node && typeof node === "object") {
            if (node.fileKey !== undefined) delete node.fileKey;
            if (node.contentType !== undefined) delete node.contentType;
            if (node.size !== undefined) delete node.size;
            Object.values(node).forEach(removeUnnecessaryFileProps);
          }
        };
        removeUnnecessaryFileProps(obj);
      }

      await fs.writeFile(filePath, JSON.stringify(obj, null, 2), "utf-8");
    } catch (e) {
      console.error(`Failed to clean JSON for comparison: ${filePath}`, e);
    }
  }
};

/**
 * タイムスタンプ付きのディレクトリ名を取得する
 */
export const getTimestampedDirName = (): string => formatTimestamp(new Date());

/**
 * 過去の結果ディレクトリ一覧を取得する（降順）
 */
export const getPastResultDirs = async (baseDir: string): Promise<string[]> => {
  return await safeRunAsync({
    tryCallback: async () => {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && /^\d{8}_\d{6}$/.test(e.name))
        .map(e => e.name)
        .sort()
        .reverse();
    },
    catchCallback: async () => {
      return [];
    }
  });
}

/**
 * 古い結果ディレクトリを削除する
 */
export const cleanupOldResults = async (baseDir: string, maxCacheCount: number) => {
  await safeRunAsync({
    tryCallback: async () => {
      const dirs = await getPastResultDirs(baseDir);
      const toDelete = dirs.slice(maxCacheCount);
      
      await Promise.all(toDelete.map(async dirName => {
        await fs.rm(path.join(baseDir, dirName), { recursive: true, force: true });
        console.log(`[Info] 古い結果フォルダを削除しました: ${dirName}`);
      }));
    }
  });
}

/**
 * JSファイルをミニファイする
 */
export const minifyJs = async (content: string, outputPath: string) => {
  return await safeRunAsync({
    tryCallback: async () => {
      const { code } = await minify(content);
      if (code) {
        await fs.writeFile(outputPath, code, "utf-8");
        return true;
      }
      return false;
    },
    catchCallback: async (minifyErr) => {
      console.error(`  [Error] ミニファイに失敗しました: ${path.basename(outputPath)}`, minifyErr);
      return false;
    }
  });
}

/**
 * エラーログをファイルに書き出す
 */
export const writeErrorLog = async (resultDir: string, message: string, error?: any) => {
  const logPath = path.join(resultDir, "error.log");
  const nowStr = new Date().toLocaleString("ja-JP");
  
  const logContent = [
    `[${nowStr}] ${message}`,
    error ? errorToString(error) : null,
    "--------------------------------------------------\n"
  ].filter(Boolean).join("\n");

  await safeRunAsync({
    tryCallback: async () => {
      await fs.appendFile(logPath, logContent, "utf-8");
    },
    catchCallback: async (err) => {
      console.error("エラーログの書き込みに失敗しました:", err);
    }
  });
}

/**
 * readme.mdの内容を取得
 */
export const getReadmeContent = (): string => {
  return `# ダウンロードされたファイルの説明

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
- \`prompts_results/\`: AI によって生成された回答（仕様書）が保存されるフォルダ
- \`error.log\`: 実行中にエラーが発生した場合に出力されるログファイル
`;
}

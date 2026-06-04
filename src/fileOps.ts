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
        CONSTANTS.FILE_PLUGINS_JSON,
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

      // 2. views.json: 各ビューの id を削除 および index の昇順で並び替え
      if (file === CONSTANTS.FILE_VIEWS_JSON && obj.views) {
        const viewKeys = Object.keys(obj.views);
        for (const viewKey of viewKeys) {
          if (obj.views[viewKey].id !== undefined) {
            delete obj.views[viewKey].id;
          }
        }

        // indexの昇順で並び替える
        viewKeys.sort(
          (a, b) => Number(obj.views[a].index) - Number(obj.views[b].index),
        );

        const sortedViews: any = {};
        for (const key of viewKeys) {
          sortedViews[key] = obj.views[key];
        }
        obj.views = sortedViews;
      }

      // 3. fields.json: relatedApp の app を削除 および ソート処理
      if (file === CONSTANTS.FILE_FIELDS_JSON && obj.properties) {
        const removeRelatedAppId = (node: any) => {
          if (Array.isArray(node)) {
            node.forEach(removeRelatedAppId);
          } else if (node && typeof node === "object") {
            if (
              node.relatedApp &&
              typeof node.relatedApp === "object" &&
              node.relatedApp.app !== undefined
            ) {
              delete node.relatedApp.app;
            }
            Object.values(node).forEach(removeRelatedAppId);
          }
        };
        removeRelatedAppId(obj.properties);

        const sortObjectKeys = (parentKey: string | null, node: any): any => {
          if (Array.isArray(node)) {
            const newArray = node.map((item) => sortObjectKeys(null, item));
            if (parentKey === "fieldMappings") {
              newArray.sort((a, b) => {
                if (a.field && b.field) {
                  return String(a.field).localeCompare(String(b.field));
                }
                return 0;
              });
            }
            return newArray;
          } else if (node !== null && typeof node === "object") {
            const keys = Object.keys(node);

            const isIndexSort =
              keys.length > 0 &&
              keys.every(
                (k) =>
                  typeof node[k] === "object" &&
                  node[k] !== null &&
                  node[k].index !== undefined,
              );

            if (isIndexSort) {
              keys.sort(
                (a, b) => Number(node[a].index) - Number(node[b].index),
              );
            } else {
              keys.sort();
            }

            const newNode: any = {};
            for (const key of keys) {
              newNode[key] = sortObjectKeys(key, node[key]);
            }
            return newNode;
          }
          return node;
        };

        obj.properties = sortObjectKeys(null, obj.properties);
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

      // 5. actions.json: id, app を削除
      if (file === CONSTANTS.FILE_ACTIONS_JSON) {
        const removeUnnecessaryFileProps = (node: any) => {
          if (Array.isArray(node)) {
            node.forEach(removeUnnecessaryFileProps);
          } else if (node && typeof node === "object") {
            if (node.id !== undefined) delete node.id;
            if (node.app !== undefined) delete node.app;
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
        .filter((e) => e.isDirectory() && /^\d{8}_\d{6}$/.test(e.name))
        .map((e) => e.name)
        .sort()
        .reverse();
    },
    catchCallback: async () => {
      return [];
    },
  });
};

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
      console.error(
        `  [Error] ミニファイに失敗しました: ${path.basename(outputPath)}`,
        minifyErr,
      );
      return false;
    },
  });
};

/**
 * エラーログをファイルに書き出す
 */
export const writeErrorLog = async (
  resultDir: string,
  message: string,
  error?: any,
) => {
  const logPath = path.join(resultDir, "error.log");
  const nowStr = new Date().toLocaleString("ja-JP");

  const logContent = [
    `[${nowStr}] ${message}`,
    error ? errorToString(error) : null,
    "--------------------------------------------------\n",
  ]
    .filter(Boolean)
    .join("\n");

  await safeRunAsync({
    tryCallback: async () => {
      await fs.appendFile(logPath, logContent, "utf-8");
    },
    catchCallback: async (err) => {
      console.error("エラーログの書き込みに失敗しました:", err);
    },
  });
};

export const copyFilesUnderGroupFolder = async (groupDir: string) => {
  const sourceDir = path.join(process.cwd(), "2.グループ直下にコピー");
  const exists = await fs
    .access(sourceDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(groupDir, entry.name);
    await fs.cp(sourcePath, targetPath, {
      recursive: entry.isDirectory(),
      force: true,
    });
  }
};

export const copyFilesUnderTopFolder = async (topDir: string) => {
  const sourceDir = path.join(process.cwd(), "1.トップ直下にコピー");
  const exists = await fs
    .access(sourceDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(topDir, entry.name);
    await fs.cp(sourcePath, targetPath, {
      recursive: entry.isDirectory(),
      force: true,
    });
  }
};

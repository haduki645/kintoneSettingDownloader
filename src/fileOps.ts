import fs from "fs/promises";
import path from "path";
import { minify } from "terser";
import { formatTimestamp, errorToString, safeRunAsync } from "./utils";

/**
 * タイムスタンプ付きのディレクトリ名を取得する
 */
export function getTimestampedDirName(): string {
  return formatTimestamp(new Date());
}

/**
 * 過去の結果ディレクトリ一覧を取得する（降順）
 */
export async function getPastResultDirs(baseDir: string): Promise<string[]> {
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
export async function cleanupOldResults(baseDir: string, maxCacheCount: number) {
  const dirs = await getPastResultDirs(baseDir);
  const toDelete = dirs.slice(maxCacheCount);
  
  await Promise.all(toDelete.map(async dirName => {
    await fs.rm(path.join(baseDir, dirName), { recursive: true, force: true });
    console.log(`[Info] 古い結果フォルダを削除しました: ${dirName}`);
  }));
}

/**
 * JSファイルをミニファイする
 */
export async function minifyJs(content: string, outputPath: string) {
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
export async function writeErrorLog(resultDir: string, message: string, error?: any) {
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
export function getReadmeContent(): string {
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

import path from "path";

/**
 * ファイル名として安全な文字列に変換する
 */
export const toSafeFileName = (name: string): string => 
  name.replace(/[\\/:*?"<>|]/g, "_");

/**
 * HTMLタグを除去する
 */
export const stripHtml = (html: string): string => 
  html.replace(/<[^>]*>?/gm, '');

/**
 * 許可/拒否のアイコンタグを生成する
 */
export const getCheckMark = (val: boolean): string => 
  val ? '<span class="permission-tag perm-ok">○</span>' : '<span class="permission-tag perm-ng">×</span>';

/**
 * エンティティのコードまたはタイプを取得する
 */
export const getEntityName = (entity: { code?: string; type?: string }): string => 
  entity.code || entity.type || "不明";

/**
 * 数値を2桁の文字列にパディングする
 */
export const pad2 = (n: number): string => 
  n.toString().padStart(2, "0");

/**
 * 日時をフォーマットする (YYYYMMDD_HHMMSS)
 */
export const formatTimestamp = (date: Date): string => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  return `${y}${m}${d}_${h}${mi}${s}`;
};

/**
 * エラーオブジェクトを文字列に変換する
 */
export const errorToString = (error: any): string => 
  error instanceof Error ? (error.stack || error.message) : JSON.stringify(error, null, 2);

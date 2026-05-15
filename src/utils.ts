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

/**
 * 同期処理を安全に実行する
 */
export const safeRun = <T>(callbacks: {
  tryCallback: () => T;
  catchCallback?: (error: any) => T;
  finallyCallback?: () => void;
}): T => {
  const { tryCallback, catchCallback, finallyCallback } = callbacks;
  try {
    return tryCallback();
  } catch (error) {
    if (catchCallback) return catchCallback(error);
    throw error;
  } finally {
    if (finallyCallback) finallyCallback();
  }
};

/**
 * 非同期処理を安全に実行する
 */
export const safeRunAsync = async <T>(callbacks: {
  tryCallback: () => Promise<T>;
  catchCallback?: (error: any) => Promise<T>;
  finallyCallback?: () => Promise<void>;
}): Promise<T> => {
  const { tryCallback, catchCallback, finallyCallback } = callbacks;
  try {
    return await tryCallback();
  } catch (error) {
    if (catchCallback) return await catchCallback(error);
    throw error;
  } finally {
    if (finallyCallback) await finallyCallback();
  }
};

/**
 * 非同期ジェネレーターを安全に実行する
 */
export const safeRunAsyncGenerator = async function* <T, TReturn = any, TNext = void>(callbacks: {
  tryCallback: () => AsyncGenerator<T, TReturn, TNext>;
  catchCallback?: (error: any) => AsyncGenerator<T, TReturn, TNext>;
  finallyCallback?: () => Promise<void>;
}): AsyncGenerator<T, TReturn, TNext> {
  const { tryCallback, catchCallback, finallyCallback } = callbacks;
  try {
    return yield* tryCallback();
  } catch (error) {
    if (catchCallback) return yield* catchCallback(error);
    throw error;
  } finally {
    if (finallyCallback) await finallyCallback();
  }
};
/**
 * revision 以外の有効なデータを持っているか判定する
 */
export const hasMeaningfulData = (obj: any): boolean => {
  if (obj === null || obj === undefined) return false;

  if (Array.isArray(obj)) {
    return obj.some(item => hasMeaningfulData(item));
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj).filter(k => k !== "revision");
    return keys.some(k => {
      const val = obj[k];
      // scope: "ALL" はデフォルト値のため、これ単体では意味のあるデータとはみなさない
      if (k === "scope" && val === "ALL") return false;
      return hasMeaningfulData(val);
    });
  }

  if (typeof obj === "string") {
    return obj.trim().length > 0;
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return true;
  }

  return false;
};


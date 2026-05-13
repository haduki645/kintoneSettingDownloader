import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

export const KINTONE_BASE_URL =
  process.env.KINTONE_BASE_URL || "https://{subdomain}.cybozu.com";
const KINTONE_API_TOKEN = process.env.KINTONE_API_TOKEN || "";
const KINTONE_USERNAME = process.env.KINTONE_USERNAME || "";
const KINTONE_PASSWORD = process.env.KINTONE_PASSWORD || "";

/**
 * 認証ヘッダーを生成する
 */
export function getAuthHeaders() {
  if (KINTONE_API_TOKEN) {
    return { "X-Cybozu-API-Token": KINTONE_API_TOKEN };
  } else if (KINTONE_USERNAME && KINTONE_PASSWORD) {
    const token = Buffer.from(
      `${KINTONE_USERNAME}:${KINTONE_PASSWORD}`,
    ).toString("base64");
    return { "X-Cybozu-Authorization": token };
  }
  throw new Error(
    "kintoneの認証情報が設定されていません。環境変数を確認してください。",
  );
}

/**
 * Kintone APIを呼び出してJSONを取得する関数
 */
export async function fetchKintoneApi(
  endpoint: string,
  appId: number,
  headers: any,
): Promise<any> {
  // app.json のみクエリパラメータが 'id' になる点に注意
  const paramName = endpoint === "/k/v1/app.json" ? "id" : "app";
  const url = `${KINTONE_BASE_URL}${endpoint}?${paramName}=${appId}`;
  
  try {
    const { data } = await axios.get(url, { headers });
    return data;
  } catch (error: any) {
    const { response, message } = error;
    const errorDetail = response?.data || message;
    console.error(
      `[Error] APIリクエスト失敗 (${endpoint}, app: ${appId}):`,
      errorDetail,
    );
    throw error;
  }
}

/**
 * Kintoneからファイルをダウンロードする関数
 */
export async function downloadKintoneFile(
  fileKey: string,
  headers: any,
): Promise<Buffer> {
  const url = `${KINTONE_BASE_URL}/k/v1/file.json?fileKey=${fileKey}`;
  
  try {
    const { data } = await axios.get(url, {
      headers,
      responseType: "arraybuffer", // バイナリデータとして取得
    });
    return Buffer.from(data);
  } catch (error: any) {
    const { response, message } = error;
    const errorDetail = response?.data || message;
    console.error(
      `[Error] ファイルダウンロード失敗 (fileKey: ${fileKey}):`,
      errorDetail,
    );
    throw error;
  }
}

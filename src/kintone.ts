import { CONSTANTS } from "./constants";
import axios from "axios";
import * as dotenv from "dotenv";
import { safeRunAsync } from "./utils";
import { KintoneEnvConfig } from "./types";

dotenv.config();

const envConfigs: KintoneEnvConfig[] = [];

// サフィックスなしの設定
if (process.env.KINTONE_BASE_URL) {
  envConfigs.push({
    baseUrl: process.env.KINTONE_BASE_URL,
    apiToken: process.env.KINTONE_API_TOKEN || "",
    username: process.env.KINTONE_USERNAME || "",
    password: process.env.KINTONE_PASSWORD || "",
  });
}

// _1, _2 などのサフィックス付き設定を探索
for (const key of Object.keys(process.env)) {
  const match = key.match(/^KINTONE_BASE_URL_(.+)$/);
  if (match) {
    const suffix = match[1];
    envConfigs.push({
      baseUrl: process.env[key]!,
      apiToken: process.env[`KINTONE_API_TOKEN_${suffix}`] || "",
      username: process.env[`KINTONE_USERNAME_${suffix}`] || "",
      password: process.env[`KINTONE_PASSWORD_${suffix}`] || "",
    });
  }
}

// デフォルトURL (前方互換用)
export const KINTONE_BASE_URL = envConfigs[0]?.baseUrl || "https://{subdomain}.cybozu.com";

export const getEnvConfig = (domain?: string): KintoneEnvConfig => {
  if (!domain) {
    if (envConfigs.length > 0) return envConfigs[0];
    throw new Error("kintoneのベースURLが設定されていません。");
  }
  
  // URLの末尾のスラッシュを正規化して比較する
  const normalize = (url: string) => url.replace(/\/$/, "");
  const target = normalize(domain);
  const config = envConfigs.find(c => normalize(c.baseUrl) === target);
  
  if (config) return config;
  
  // 一致するものがない場合は、デフォルトを返すかエラーにする
  throw new Error(`指定されたドメイン (${domain}) の認証情報が .env に見つかりません。`);
};

/**
 * 認証ヘッダーを生成する
 */
export const getAuthHeaders = (domain?: string) => {
  const config = getEnvConfig(domain);
  
  if (config.apiToken) {
    return { "X-Cybozu-API-Token": config.apiToken };
  } else if (config.username && config.password) {
    const token = Buffer.from(
      `${config.username}:${config.password}`,
    ).toString("base64");
    return { "X-Cybozu-Authorization": token };
  }
  throw new Error(
    `ドメイン ${config.baseUrl} の認証情報が設定されていません。環境変数を確認してください。`,
  );
}

/**
 * Kintone APIを呼び出してJSONを取得する関数
 */
export const fetchKintoneApi = async (
  endpoint: string,
  appId: number,
  domain?: string,
): Promise<any> => {
  const config = getEnvConfig(domain);
  const headers = getAuthHeaders(domain);
  // app.json のみクエリパラメータが 'id' になる点に注意
  const paramName = endpoint === CONSTANTS.API_APP ? "id" : "app";
  const url = `${config.baseUrl}${endpoint}?${paramName}=${appId}`;
  
  return await safeRunAsync({
    tryCallback: async () => {
      const { data } = await axios.get(url, { headers });
      return data;
    },
    catchCallback: async (error: any) => {
      const { response, message } = error;
      const errorDetail = response?.data || message;
      console.error(
        `[Error] APIリクエスト失敗 (${endpoint}, app: ${appId}):`,
        errorDetail,
      );
      throw error;
    }
  });
}

/**
 * Kintoneからファイルをダウンロードする関数
 */
export const downloadKintoneFile = async (
  fileKey: string,
  domain?: string,
): Promise<Buffer> => {
  const config = getEnvConfig(domain);
  const headers = getAuthHeaders(domain);
  const url = `${config.baseUrl}/k/v1/file.json?fileKey=${fileKey}`;
  
  return await safeRunAsync({
    tryCallback: async () => {
      const { data } = await axios.get(url, {
        headers,
        responseType: "arraybuffer", // バイナリデータとして取得
      });
      return Buffer.from(data);
    },
    catchCallback: async (error: any) => {
      const { response, message } = error;
      const errorDetail = response?.data || message;
      console.error(
        `[Error] ファイルダウンロード失敗 (fileKey: ${fileKey}):`,
        errorDetail,
      );
      throw error;
    }
  });
}

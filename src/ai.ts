import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { AiConfig } from "./types";
import { safeRunAsync, safeRunAsyncGenerator } from "./utils";

import { exec } from "child_process";

/**
 * AI API呼び出し用の初期化処理を管理するクロージャ
 */
const getInitPromise = (() => {
  let initPromise: Promise<void> | null = null;
  return (config: any) => {
    if (!initPromise) {
      initPromise = ensureLmStudioRunning(config);
    }
    return initPromise;
  };
})();

/**
 * AI APIを呼び出す（ジェネレーターとしてトークンを逐次返す）
 */
export async function* callAiApi(messages: any[], config: AiConfig): AsyncGenerator<string, string, void> {
  await getInitPromise(config);

  const { baseUrl, model } = config;
  const response = await axios.post(`${baseUrl}/chat/completions`, {
    model,
    messages,
    temperature: 0.7,
    stream: true, // ストリーミングを有効化
  }, {
    timeout: 300000,
    responseType: 'stream'
  });

  return yield* safeRunAsyncGenerator({
    tryCallback: async function* (): AsyncGenerator<string, string, void> {
      // 非同期ジェネレーター内で値を蓄積して返す
      const processChunks = async function* (full: string = ""): AsyncGenerator<string, string, void> {
        let currentFull = full;
        for await (const chunk of response.data) {
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "" || !trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const data = JSON.parse(dataStr);
              const content = data.choices[0]?.delta?.content || "";
              if (!content) continue;
              currentFull += content;
              yield content;
            } catch (e) {}
          }
        }
        return currentFull;
      };
      return yield* processChunks();
    },
    catchCallback: async function* (error: any): AsyncGenerator<string, string, void> {
      const isConnError = error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';
      const errorMsg = isConnError 
        ? "AI APIサーバーに接続できませんでした。" 
        : `AI APIの呼び出しに失敗しました: ${error.message || error}`;
      console.error(errorMsg);
      yield errorMsg;
      return errorMsg;
    }
  });
}

/**
 * LM Studioが起動しているか確認し、起動していなければ設定されたパスから起動を試める
 */
const ensureLmStudioRunning = async (config: AiConfig) => {
  const { baseUrl, model, lmStudioPath } = config;
  console.log("[AI] APIサーバーの起動状態を確認中...");
  const isUp = await checkServer(baseUrl, model);
  if (isUp) {
    console.log("[AI] APIサーバーは正常に応答しています。");
    return;
  }

  if (!lmStudioPath) {
    console.warn("[AI] APIサーバーが起動していません。また、setting.json に lmStudioPath が設定されていないため、自動起動できません。");
    return;
  }

  try {
    console.log(`[AI] APIサーバーが見つかりません。LM Studioを起動します: ${lmStudioPath}`);
    // Windowsのstartコマンドを使用してGUIアプリを起動
    exec(`start "" "${lmStudioPath}"`, (error) => {
      if (error) {
        console.error("[AI] LM Studioの起動コマンド実行中にエラーが発生しました:", error);
      }
    });

    // 起動を待つ (最大60秒)
    console.log("[AI] サーバーの起動を待機しています (最大60秒)...");
    const started = await [...Array(30).keys()].reduce(async (promise) => {
      const isStarted = await promise;
      if (isStarted) return true;

      await new Promise(resolve => setTimeout(resolve, 2000));
      return await checkServer(baseUrl);
    }, Promise.resolve(false));

    if (started) {
      console.log("[AI] APIサーバーの起動を確認しました。");
      return;
    }
    console.warn("[AI] LM Studioの起動に時間がかかっています。手動でモデルがロードされ、サーバーが開始されているか確認してください。");
  } catch (err) {
    console.error("[AI] LM Studioの起動処理中に予期せぬエラーが発生しました:", err);
  }
}

const checkServer = async (baseUrl: string, model?: string): Promise<boolean> => {
  return await safeRunAsync({
    tryCallback: async () => {
      // 1. モデル一覧が取得できるか確認
      const res = await axios.get(`${baseUrl}/models`, { timeout: 2000 });
      if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
        return false;
      }

      // 2. 実際にリクエストが通るか確認（ECONNRESET対策）
      return await safeRunAsync({
        tryCallback: async () => {
          await axios.post(`${baseUrl}/chat/completions`, {
            model: model || "ping-test",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
          }, { timeout: 3000 });
          return true;
        },
        catchCallback: async (postErr: any) => {
          // 接続エラーやリセットが発生した場合は異常とみなす
          if (postErr.code === 'ECONNRESET' || postErr.code === 'ECONNREFUSED' || postErr.code === 'ETIMEDOUT' || !postErr.response) {
            console.log(`[AI] サーバーからの応答が異常です (${postErr.code || "Timeout"})。再起動を試みます。`);
            return false;
          }
          // 400系エラーなどは「サーバー自体は応答している」とみなしてOKとする
          return true;
        }
      });
    },
    catchCallback: async () => false
  });
}

/**
 * 過去の結果フォルダから同じプロンプトの実行結果を探す
 */
export const getCachedResult = async (
  pastResultDirs: string[],
  appFolderName: string,
  targetResultFileName: string,
  individualFileName: string,
  fullPrompt: string
): Promise<string | null> => {
  const results = await Promise.all(pastResultDirs.map(async (pastDir) => {
    const oldAppDir = path.join(pastDir, appFolderName);
    const oldPromptPath = path.join(oldAppDir, "prompts", individualFileName);
    const oldResultPath = path.join(oldAppDir, "prompts_results", targetResultFileName);

    return await safeRunAsync({
      tryCallback: async () => {
        const [oldPromptContent, oldResultContent] = await Promise.all([
          fs.readFile(oldPromptPath, "utf-8"),
          fs.readFile(oldResultPath, "utf-8")
        ]);
        if (oldPromptContent === fullPrompt) {
          return oldResultContent;
        }
        return null;
      },
      catchCallback: async () => null
    });
  }));

  return results.find(res => res !== null) || null;
}

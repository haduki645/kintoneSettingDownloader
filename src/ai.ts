import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { AiConfig } from "./types";

import { exec } from "child_process";

/**
 * AI API呼び出し用のヘルパー関数
 */
let initPromise: Promise<void> | null = null;

export async function* callAiApi(messages: any[], config: AiConfig): AsyncGenerator<string, string, void> {
  // 初回呼び出し時にサーバーの起動を確認
  if (!initPromise) {
    initPromise = ensureLmStudioRunning(config);
  }
  await initPromise;

  let fullContent = "";
  try {
    const { baseUrl, model } = config;
    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model: model,
      messages: messages,
      temperature: 0.7,
      stream: true, // ストリーミングを有効化
    }, {
      timeout: 300000,
      responseType: 'stream'
    });

    for await (const chunk of response.data) {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        if (!trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === "[DONE]") continue;

        try {
          const data = JSON.parse(dataStr);
          const content = data.choices[0]?.delta?.content || "";
          if (!content) continue;

          fullContent += content;
          yield content; // トークンを逐次返す
        } catch (e) {
          // パース失敗（不完全なJSONなど）は無視して次を待つ
        }
      }
    }
    return fullContent;
  } catch (error: any) {
    let errorMsg = "";
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
       errorMsg = "AI APIサーバーに接続できませんでした。";
    } else {
       errorMsg = `AI APIの呼び出しに失敗しました: ${error.message || error}`;
    }
    console.error(errorMsg);
    yield errorMsg;
    return errorMsg;
  }
}

/**
 * LM Studioが起動しているか確認し、起動していなければ設定されたパスから起動を試みる
 */
async function ensureLmStudioRunning(config: AiConfig) {
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

async function checkServer(baseUrl: string, model?: string): Promise<boolean> {
  try {
    // 1. モデル一覧が取得できるか確認
    const res = await axios.get(`${baseUrl}/models`, { timeout: 2000 });
    if (!Array.isArray(res.data.data) || res.data.data.length === 0) {
      return false;
    }

    // 2. 実際にリクエストが通るか確認（ECONNRESET対策）
    try {
      await axios.post(`${baseUrl}/chat/completions`, {
        model: model || "ping-test",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1
      }, { timeout: 3000 });
    } catch (postErr: any) {
      // 接続エラーやリセットが発生した場合は異常とみなす
      if (postErr.code === 'ECONNRESET' || postErr.code === 'ECONNREFUSED' || postErr.code === 'ETIMEDOUT' || !postErr.response) {
        console.log(`[AI] サーバーからの応答が異常です (${postErr.code || "Timeout"})。再起動を試みます。`);
        return false;
      }
      // 400系エラーなどは「サーバー自体は応答している」とみなしてOKとする
    }

    return true;
  } catch (err: any) {
    return false;
  }
}

/**
 * 過去の結果からキャッシュを探す
 */
export async function getCachedResult(
  pastBaseDirs: string[],
  appFolderName: string,
  promptFileName: string,
  resultFileName: string,
  currentPromptContent: string
): Promise<string | null> {
  const results = await Promise.all(pastBaseDirs.map(async baseDir => {
    const oldAppDir = path.join(baseDir, appFolderName);
    const oldPromptPath = path.join(oldAppDir, "prompts", promptFileName);
    const oldResultPath = path.join(oldAppDir, "prompts_results", resultFileName);

    try {
      const [oldPromptExists, oldResultExists] = await Promise.all([
        fs.stat(oldPromptPath).catch(() => null),
        fs.stat(oldResultPath).catch(() => null)
      ]);

      if (oldPromptExists && oldResultExists) {
        const [oldPromptContent, oldResultContent] = await Promise.all([
          fs.readFile(oldPromptPath, "utf-8"),
          fs.readFile(oldResultPath, "utf-8")
        ]);
        if (oldPromptContent === currentPromptContent) {
          return oldResultContent;
        }
      }
    } catch (err) {}
    return null;
  }));

  return results.find(res => res !== null) || null;
}

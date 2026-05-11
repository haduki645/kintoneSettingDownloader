import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { AiConfig } from "./types";

import { exec } from "child_process";

/**
 * AI API呼び出し用のヘルパー関数
 */
let isFirstCall = true;

export async function callAiApi(messages: any[], config: AiConfig) {
  if (isFirstCall) {
    isFirstCall = false;
    await ensureLmStudioRunning(config);
  }

  try {
    const response = await axios.post(`${config.baseUrl}/chat/completions`, {
      model: config.model,
      messages: messages,
      temperature: 0.7,
    }, {
      timeout: 60000 // 1分
    });
    return response.data.choices[0].message.content;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
       // サーバーが落ちている可能性があるが、初回チェックで対応しているはずなのでここではエラーにする
       console.error("AI APIサーバーに接続できませんでした。LM Studioが起動しているか確認してください。");
    }
    console.error("AI APIの呼び出しに失敗しました:", error.response?.data || error.message || error);
    return `AI APIの呼び出しに失敗しました: ${error.message || error}`;
  }
}

/**
 * LM Studioが起動しているか確認し、起動していなければ設定されたパスから起動を試みる
 */
async function ensureLmStudioRunning(config: AiConfig) {
  const isUp = await checkServer(config.baseUrl);
  if (isUp) return;

  if (!config.lmStudioPath) {
    console.warn("AI APIサーバーが起動していません。また、setting.json に lmStudioPath が設定されていないため、自動起動できません。");
    return;
  }

  try {
    console.log("AI APIサーバーが見つかりません。LM Studioを起動します...");
    exec(`start "" "${config.lmStudioPath}"`);
    
    // 起動を待つ (最大30秒)
    console.log("サーバーの起動を待機しています...");
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (await checkServer(config.baseUrl)) {
        console.log("AI APIサーバーの起動を確認しました。");
        return;
      }
    }
    console.warn("LM Studioの起動に時間がかかっています。手動で確認してください。");
  } catch (err) {
    console.error("LM Studioの起動中にエラーが発生しました:", err);
  }
}

async function checkServer(baseUrl: string): Promise<boolean> {
  try {
    // /v1 を除いたベースURLでも試す必要があるかもしれないが、通常は /v1/models がある
    await axios.get(`${baseUrl}/models`, { timeout: 2000 });
    return true;
  } catch (err) {
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
  for (const baseDir of pastBaseDirs) {
    const oldAppDir = path.join(baseDir, appFolderName);
    const oldPromptPath = path.join(oldAppDir, "prompts", promptFileName);
    const oldResultPath = path.join(oldAppDir, "prompts_results", resultFileName);

    try {
      const oldPromptExists = await fs.stat(oldPromptPath).catch(() => null);
      const oldResultExists = await fs.stat(oldResultPath).catch(() => null);

      if (oldPromptExists && oldResultExists) {
        const oldPromptContent = await fs.readFile(oldPromptPath, "utf-8");
        if (oldPromptContent === currentPromptContent) {
          return await fs.readFile(oldResultPath, "utf-8");
        }
      }
    } catch (err) {
      // ignore and try next
    }
  }
  return null;
}

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { AiConfig } from "./types";

/**
 * AI API呼び出し用のヘルパー関数
 */
export async function callAiApi(messages: any[], config: AiConfig) {
  try {
    const response = await axios.post(`${config.baseUrl}/chat/completions`, {
      model: config.model,
      messages: messages,
      temperature: 0.7,
    });
    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error("AI APIの呼び出しに失敗しました:", error.message || error);
    return `AI APIの呼び出しに失敗しました: ${error.message || error}`;
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

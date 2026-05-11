export interface AiConfig {
  baseUrl: string;
  model: string;
  lmStudioPath?: string;
}

export interface Setting {
  appIds: number[];
  excludeFromMerge?: string[];
  enableAi?: boolean;
  aiConfig?: AiConfig;
  workspaceConfig?: any;
  maxCacheCount?: number;
}

export interface MarkerMatch {
  functionalName: string;
  marker: string;
}

export interface AiConfig {
  baseUrl: string;
  model: string;
}

export interface Setting {
  appIds: number[];
  excludeFromMerge?: string[];
  enableAi?: boolean;
  aiConfig?: AiConfig;
  workspaceConfig?: any;
}

export interface MarkerMatch {
  functionalName: string;
  marker: string;
}

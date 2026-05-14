export interface AiConfig {
  baseUrl: string;
  model: string;
  lmStudioPath?: string;
}

export interface AppGroup {
  group: string;
  ids?: number[];
  groups?: AppGroup[];
}

export interface Setting {
  appIds?: number[];
  apps?: {
    ids?: number[];
    groups?: AppGroup[];
  };
  excludeFromMerge?: string[];
  enableAi?: boolean;
  aiConfig?: AiConfig;
  workspaceConfig?: any;
  maxCacheCount?: number;
}


export interface MarkerMatch {
  functionalName: string;
  marker: string;
  lineNumber: number;
}

export interface PromptTemplate {
  name: string;
  content: string;
}

export interface AiConfig {
  baseUrl: string;
  model: string;
  lmStudioPath?: string;
}

export type AppId = number | { stg: number; prd: number };

export interface AppGroup {
  group: string;
  ids?: AppId[];
  groups?: AppGroup[];
}

export interface Setting {
  appIds?: AppId[];
  apps?: {
    ids?: AppId[];
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
  sourceFile?: string;
}

export interface PromptTemplate {
  name: string;
  content: string;
}

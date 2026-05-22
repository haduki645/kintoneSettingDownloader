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

export interface WorkspaceConfig {
  fileName: string;
  folders: any[];
  settings: any;
}

export interface Setting {
  stgDomain?: string;
  prdDomain?: string;
  appIds?: AppId[];
  apps?: {
    ids?: AppId[];
    groups?: AppGroup[];
  };
  excludeFromMerge?: string[];
  enableAi?: boolean;
  aiConfig?: AiConfig;
  workspaceConfig?: WorkspaceConfig[];
  maxCacheCount?: number;
}

export interface KintoneEnvConfig {
  baseUrl: string;
  apiToken: string;
  username?: string;
  password?: string;
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

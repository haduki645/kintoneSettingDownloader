export type AppId = number | { stg: number; prd: number };

export interface AppGroup {
  group: string;
  ids?: AppId[];
  groups?: AppGroup[];
}

export interface Setting {
  stgDomain?: string;
  prdDomain?: string;
  appIds?: AppId[];
  apps?: {
    ids?: AppId[];
    groups?: AppGroup[];
  };
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

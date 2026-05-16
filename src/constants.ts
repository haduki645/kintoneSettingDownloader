export const CONSTANTS = {
  // Directory Names
  DIR_RESULT: "result",
  DIR_PROMPT_TEMPLATES: "prompt_templates",
  DIR_MERGE_FILES: "mergeFiles",
  DIR_JSON: "json",
  DIR_CUSTOMIZE: "customize",
  DIR_PROMPTS_RESULTS: "prompts_results",
  DIR_PROMPTS: "prompts",
  DIR_WINMERGE_COMPARE: "winmerge比較用",
  
  // Environment Labels
  ENV_STG: "検証",
  ENV_PRD: "本番",

  // File Names
  FILE_SETTING_JSON: "setting.json",
  FILE_README_MD: "readme.md",
  FILE_PROMPT_MD: "prompt.md",
  FILE_APP_JSON: "app.json",
  FILE_FIELDS_JSON: "fields.json",
  FILE_CUSTOMIZE_JSON: "customize.json",
  FILE_LAYOUT_JSON: "layout.json",
  FILE_VIEWS_JSON: "views.json",
  FILE_APP_ACL_JSON: "appAcl.json",
  FILE_RECORD_ACL_JSON: "recordAcl.json",
  FILE_FIELD_ACL_JSON: "fieldAcl.json",
  FILE_NOTIF_GENERAL_JSON: "notificationsGeneral.json",
  FILE_NOTIF_RECORD_JSON: "notificationsPerRecord.json",
  FILE_NOTIF_REMINDER_JSON: "notificationsReminder.json",
  FILE_ACTIONS_JSON: "actions.json",
  FILE_PLUGINS_JSON: "plugins.json",

  FILE_FORM_MD: "form.md",
  FILE_VIEW_MD: "view.md",
  FILE_ACL_MD: "acl.md",
  FILE_NOTIFICATION_MD: "notification.md",
  FILE_LOOKUP_RELATION_MD: "lookup_relation.md",
  FILE_FUNCTION_LIST_MD: "機能一覧.md",
  
  FILE_URL_SHORTCUT: "kintoneアプリへ移動.url",
  FILE_WINMERGE_PROJECT: "検証_vs_本番.WinMerge",
  
  // File Suffixes
  SUFFIX_WORKSPACE: ".code-workspace",

  // API Endpoints
  API_APP: "/k/v1/app.json",
  API_FIELDS: "/k/v1/app/form/fields.json",
  API_CUSTOMIZE: "/k/v1/app/customize.json",
  API_LAYOUT: "/k/v1/app/form/layout.json",
  API_VIEWS: "/k/v1/app/views.json",
  API_ACL_APP: "/k/v1/app/acl.json",
  API_ACL_RECORD: "/k/v1/record/acl.json",
  API_ACL_FIELD: "/k/v1/field/acl.json",
  API_NOTIF_GENERAL: "/k/v1/app/notifications/general.json",
  API_NOTIF_RECORD: "/k/v1/app/notifications/perRecord.json",
  API_NOTIF_REMINDER: "/k/v1/app/notifications/reminder.json",
  API_ACTIONS: "/k/v1/app/actions.json",
  API_PLUGINS: "/k/v1/app/plugins.json",
  API_FILE: "/k/v1/file.json",

  // Defaults
  DEFAULT_MAX_CACHE_COUNT: 5,
};

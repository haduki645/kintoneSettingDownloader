import { KINTONE_BASE_URL } from "./kintone";

export function generateLookupMd(appName: string, appId: number, rows: string[]): string {
  return `# ルックアップ関係一覧\n\n## [${appName} (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n` +
    `<style>\n` +
    `  table { border-collapse: collapse; width: 100%; font-size: 14px; }\n` +
    `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
    `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
    `  td { background-color: #fff; }\n` +
    `  tbody tr:hover td { background-color: #f9fafb; }\n` +
    `</style>\n\n` +
    `<table>\n` +
    `  <thead>\n` +
    `    <tr>\n` +
    `      <th>配置先フィールド</th>\n` +
    `      <th>取得先アプリ</th>\n` +
    `      <th>キーフィールド</th>\n` +
    `      <th>コピー先 (自アプリ)</th>\n` +
    `      <th>コピー元 (他アプリ)</th>\n` +
    `    </tr>\n` +
    `  </thead>\n` +
    `  <tbody>\n` +
    rows.join("") +
    `  </tbody>\n` +
    `</table>\n`;
}

export function generateViewMd(appId: number, viewsInfo: any): string {
  let viewMdContent = `# [一覧設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
  const style = `<style>\n` +
    `  table { border-collapse: collapse; width: 100%; font-size: 14px; }\n` +
    `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
    `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
    `  td { background-color: #fff; }\n` +
    `  tbody tr:hover td { background-color: #f9fafb; }\n` +
    `</style>\n\n`;
  viewMdContent += style;
  viewMdContent += `<table>\n`;
  viewMdContent += `  <thead>\n`;
  viewMdContent += `    <tr>\n`;
  viewMdContent += `      <th>一覧名</th>\n`;
  viewMdContent += `      <th>表示形式</th>\n`;
  viewMdContent += `      <th>絞り込み条件</th>\n`;
  viewMdContent += `    </tr>\n`;
  viewMdContent += `  </thead>\n`;
  viewMdContent += `  <tbody>\n`;

  const viewsArray = Object.values(viewsInfo.views as Record<string, any>).sort((a, b) => Number(a.index) - Number(b.index));

  for (const view of viewsArray) {
    const viewUrl = `${KINTONE_BASE_URL}/k/${appId}/?view=${view.id}`;
    const filterCond = view.filterCond ? `\`${view.filterCond}\`` : "なし";
    viewMdContent += `    <tr>\n`;
    viewMdContent += `      <td><a href="${viewUrl}" target="_blank">${view.name}</a></td>\n`;
    viewMdContent += `      <td>${view.type}</td>\n`;
    viewMdContent += `      <td>${filterCond}</td>\n`;
    viewMdContent += `    </tr>\n`;
  }

  viewMdContent += `  </tbody>\n`;
  viewMdContent += `</table>\n`;
  return viewMdContent;
}

export function generateAclMd(appId: number, appAclInfo: any, recordAclInfo: any, fieldAclInfo: any): string {
  const appRights = appAclInfo.rights || [];
  const recordRights = recordAclInfo.rights || [];
  const fieldRights = fieldAclInfo.rights || [];

  let aclMdContent = `# [アクセス権設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
  const style = `<style>\n` +
    `  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }\n` +
    `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
    `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
    `  td { background-color: #fff; }\n` +
    `  tbody tr:hover td { background-color: #f9fafb; }\n` +
    `  .permission-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 2px; color: #fff; }\n` +
    `  .perm-ok { background-color: #28a745; }\n` +
    `  .perm-ng { background-color: #dc3545; }\n` +
    `</style>\n\n`;
  aclMdContent += style;

  // アプリのアクセス権
  aclMdContent += `## アプリのアクセス権\n\n`;
  aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>対象</th>\n      <th>レコード閲覧</th>\n      <th>レコード追加</th>\n      <th>レコード編集</th>\n      <th>レコード削除</th>\n      <th>アプリ管理</th>\n      <th>ファイル出力</th>\n      <th>ファイル取り込み</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
  for (const right of appRights) {
    const entity = right.entity.code || right.entity.type;
    const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
    aclMdContent += `    <tr>\n`;
    aclMdContent += `      <td>${entity}</td>\n`;
    aclMdContent += `      <td>${check(right.recordViewable)}</td>\n`;
    aclMdContent += `      <td>${check(right.recordAddable)}</td>\n`;
    aclMdContent += `      <td>${check(right.recordEditable)}</td>\n`;
    aclMdContent += `      <td>${check(right.recordDeletable)}</td>\n`;
    aclMdContent += `      <td>${check(right.appEditable)}</td>\n`;
    aclMdContent += `      <td>${check(right.fileExportable)}</td>\n`;
    aclMdContent += `      <td>${check(right.fileImportable)}</td>\n`;
    aclMdContent += `    </tr>\n`;
  }
  aclMdContent += `  </tbody>\n</table>\n\n`;

  // レコードのアクセス権
  if (recordRights.length > 0) {
    aclMdContent += `## レコードのアクセス権\n\n`;
    aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>優先度</th>\n      <th>条件</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n      <th>削除</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    let priority = 1;
    for (const right of recordRights) {
      const rowCount = right.entities.length;
      for (let i = 0; i < rowCount; i++) {
        const entityRight = right.entities[i];
        const entity = entityRight.entity.code || entityRight.entity.type;
        const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
        aclMdContent += `    <tr>\n`;
        if (i === 0) {
          aclMdContent += `      <td rowspan="${rowCount}">${priority}</td>\n`;
          aclMdContent += `      <td rowspan="${rowCount}">${right.filterCond || "なし"}</td>\n`;
        }
        aclMdContent += `      <td>${entity}</td>\n`;
        aclMdContent += `      <td>${check(entityRight.viewable)}</td>\n`;
        aclMdContent += `      <td>${check(entityRight.editable)}</td>\n`;
        aclMdContent += `      <td>${check(entityRight.deletable)}</td>\n`;
        aclMdContent += `    </tr>\n`;
      }
      priority++;
    }
    aclMdContent += `  </tbody>\n</table>\n\n`;
  }

  // フィールドのアクセス権
  if (fieldRights.length > 0) {
    aclMdContent += `## フィールドのアクセス権\n\n`;
    aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>フィールドコード</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    for (const right of fieldRights) {
      const rowCount = right.entities.length;
      for (let i = 0; i < rowCount; i++) {
        const entityRight = right.entities[i];
        const entity = entityRight.entity.code || entityRight.entity.type;
        const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
        aclMdContent += `    <tr>\n`;
        if (i === 0) {
          aclMdContent += `      <td rowspan="${rowCount}">${right.code}</td>\n`;
        }
        aclMdContent += `      <td>${entity}</td>\n`;
        aclMdContent += `      <td>${check(entityRight.viewable)}</td>\n`;
        aclMdContent += `      <td>${check(entityRight.editable)}</td>\n`;
        aclMdContent += `    </tr>\n`;
      }
    }
    aclMdContent += `  </tbody>\n</table>\n\n`;
  }
  return aclMdContent;
}

export function generateNotificationMd(appId: number, notificationsGeneralInfo: any, notificationsPerRecordInfo: any, notificationsReminderInfo: any): string {
  const generalNotifs = notificationsGeneralInfo.generalNotifications || [];
  const perRecordNotifs = notificationsPerRecordInfo.perRecordNotifications || [];
  const reminderNotifs = notificationsReminderInfo.reminderNotifications || [];

  let notifMdContent = `# [通知設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
  notifMdContent += `<style>\n` +
    `  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }\n` +
    `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
    `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
    `  td { background-color: #fff; }\n` +
    `  tbody tr:hover td { background-color: #f9fafb; }\n` +
    `  .permission-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin: 2px; color: #fff; }\n` +
    `  .perm-ok { background-color: #28a745; }\n` +
    `  .perm-ng { background-color: #dc3545; }\n` +
    `</style>\n\n`;

  // アプリの条件通知
  if (generalNotifs.length > 0) {
    notifMdContent += `## アプリの条件通知\n\n`;
    notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>対象</th>\n      <th>レコード追加</th>\n      <th>編集</th>\n      <th>ステータス更新</th>\n      <th>コメント追加</th>\n      <th>ファイル読み込み</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    for (const notif of generalNotifs) {
      const entity = notif.entity.code || notif.entity.type;
      const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
      notifMdContent += `    <tr>\n`;
      notifMdContent += `      <td>${entity}</td>\n`;
      notifMdContent += `      <td>${check(notif.recordAdded)}</td>\n`;
      notifMdContent += `      <td>${check(notif.recordEdited)}</td>\n`;
      notifMdContent += `      <td>${check(notif.statusChanged)}</td>\n`;
      notifMdContent += `      <td>${check(notif.commentAdded)}</td>\n`;
      notifMdContent += `      <td>${check(notif.fileImported)}</td>\n`;
      notifMdContent += `    </tr>\n`;
    }
    notifMdContent += `  </tbody>\n</table>\n\n`;
  }

  // レコードの条件通知
  if (perRecordNotifs.length > 0) {
    notifMdContent += `## レコードの条件通知\n\n`;
    notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    for (const notif of perRecordNotifs) {
      const rowCount = notif.targets.length;
      for (let i = 0; i < rowCount; i++) {
        const target = notif.targets[i];
        const entity = target.entity.code || target.entity.type;
        notifMdContent += `    <tr>\n`;
        if (i === 0) {
          notifMdContent += `      <td rowspan="${rowCount}">${notif.filterCond || "なし"}</td>\n`;
        }
        notifMdContent += `      <td>${entity}</td>\n`;
        if (i === 0) {
          notifMdContent += `      <td rowspan="${rowCount}">${notif.title || ""}</td>\n`;
        }
        notifMdContent += `    </tr>\n`;
      }
    }
    notifMdContent += `  </tbody>\n</table>\n\n`;
  }

  // リマインダーの条件通知
  if (reminderNotifs.length > 0) {
    notifMdContent += `## リマインダーの条件通知\n\n`;
    notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>通知タイミング</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    for (const notif of reminderNotifs) {
      const rowCount = notif.targets.length;
      const timing = notif.timing ? `${notif.timing.code} ${notif.timing.days}日 ${notif.timing.hours}時間 ${notif.timing.minutes}分` : "";
      for (let i = 0; i < rowCount; i++) {
        const target = notif.targets[i];
        const entity = target.entity.code || target.entity.type;
        notifMdContent += `    <tr>\n`;
        if (i === 0) {
          notifMdContent += `      <td rowspan="${rowCount}">${notif.filterCond || "なし"}</td>\n`;
          notifMdContent += `      <td rowspan="${rowCount}">${timing}</td>\n`;
        }
        notifMdContent += `      <td>${entity}</td>\n`;
        if (i === 0) {
          notifMdContent += `      <td rowspan="${rowCount}">${notif.title || ""}</td>\n`;
        }
        notifMdContent += `    </tr>\n`;
      }
    }
    notifMdContent += `  </tbody>\n</table>\n\n`;
  }
  return notifMdContent;
}

export function generateFormMd(appId: number, fieldsInfo: any, layoutInfo: any): string {
  const properties = fieldsInfo.properties || {};
  const layout = layoutInfo.layout || [];

  // properties をフラットにする（テーブル内のフィールドも含む）
  const flatProperties: Record<string, any> = {};
  for (const [code, prop] of Object.entries(properties as Record<string, any>)) {
    flatProperties[code] = prop;
    if (prop.type === 'SUBTABLE' && prop.fields) {
      for (const [subCode, subProp] of Object.entries(prop.fields)) {
        flatProperties[subCode] = subProp;
      }
    }
  }

  let formMdContent = `# [フォーム設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/${appId}/)\n\n`;
  const style = `<style>\n` +
    `  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }\n` +
    `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
    `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
    `  td { background-color: #fff; }\n` +
    `  tbody tr:hover td { background-color: #f9fafb; }\n` +
    `</style>\n\n`;
  formMdContent += style;

  const renderFields = (fields: any[]) => {
    let html = `<table>\n  <thead>\n    <tr>\n      <th>フィールド名</th>\n      <th>フィールドコード</th>\n      <th>タイプ</th>\n      <th>必須</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    for (const field of fields) {
      if (field.type === 'HR') {
        html += `    <tr>\n      <td>(横線)</td>\n      <td>-</td>\n      <td>${field.type}</td>\n      <td>-</td>\n    </tr>\n`;
        continue;
      }
      if (field.type === 'LABEL') {
        const labelText = field.label ? field.label.replace(/<[^>]*>?/gm, '') : '(ラベル)';
        html += `    <tr>\n      <td>${labelText}</td>\n      <td>-</td>\n      <td>${field.type}</td>\n      <td>-</td>\n    </tr>\n`;
        continue;
      }
      if (field.type === 'SPACER') {
        html += `    <tr>\n      <td>(スペース: ${field.elementId || 'IDなし'})</td>\n      <td>-</td>\n      <td>${field.type}</td>\n      <td>-</td>\n    </tr>\n`;
        continue;
      }

      const prop = flatProperties[field.code];
      if (prop) {
        html += `    <tr>\n      <td>${prop.label || '設定なし'}</td>\n      <td>${field.code}</td>\n      <td>${prop.type}</td>\n      <td>${prop.required ? '○' : '-'}</td>\n    </tr>\n`;
      } else {
        html += `    <tr>\n      <td>不明</td>\n      <td>${field.code}</td>\n      <td>${field.type}</td>\n      <td>-</td>\n    </tr>\n`;
      }
    }
    html += `  </tbody>\n</table>\n`;
    return html;
  };

  for (const section of layout) {
    if (section.type === 'GROUP') {
      const groupProp = properties[section.code];
      const groupLabel = groupProp ? groupProp.label : section.code;
      formMdContent += `## グループ: ${groupLabel}\n\n`;
      for (const row of section.layout) {
        formMdContent += renderFields(row.fields);
      }
    } else if (section.type === 'ROW') {
      formMdContent += renderFields(section.fields);
    } else if (section.type === 'SUBTABLE') {
      const tableProp = properties[section.code];
      const tableLabel = tableProp ? tableProp.label : section.code;
      formMdContent += `## テーブル: ${tableLabel}\n\n`;
      formMdContent += renderFields(section.fields);
    }
  }

  return formMdContent;
}

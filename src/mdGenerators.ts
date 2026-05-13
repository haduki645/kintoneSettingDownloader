import { KINTONE_BASE_URL } from "./kintone";

export function generateLookupMd(appName: string, appId: number, rows: string[]): string {
  return `# ルックアップ関係一覧\n\n## [${appName} (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=form)\n\n` +
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
  let viewMdContent = `# [一覧設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=views)\n\n`;
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
  viewMdContent += `      <th>並び替え条件</th>\n`;
  viewMdContent += `    </tr>\n`;
  viewMdContent += `  </thead>\n`;
  viewMdContent += `  <tbody>\n`;

  const viewsArray = Object.values(viewsInfo.views as Record<string, any>).sort((a, b) => Number(a.index) - Number(b.index));

  viewMdContent += viewsArray.map(view => {
    const viewUrl = `${KINTONE_BASE_URL}/k/${appId}/?view=${view.id}`;
    const filterCond = view.filterCond ? `\`${view.filterCond}\`` : "なし";
    const sort = view.sort ? `\`${view.sort}\`` : "なし";
    return `    <tr>\n` +
           `      <td><a href="${viewUrl}" target="_blank">${view.name}</a></td>\n` +
           `      <td>${view.type}</td>\n` +
           `      <td>${filterCond}</td>\n` +
           `      <td>${sort}</td>\n` +
           `    </tr>\n`;
  }).join("");

  viewMdContent += `  </tbody>\n`;
  viewMdContent += `</table>\n`;
  return viewMdContent;
}

export function generateAclMd(appId: number, appAclInfo: any, recordAclInfo: any, fieldAclInfo: any): string {
  const appRights = appAclInfo.rights || [];
  const recordRights = recordAclInfo.rights || [];
  const fieldRights = fieldAclInfo.rights || [];

  let aclMdContent = `# [アクセス権設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=permissions)\n\n`;
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
  aclMdContent += appRights.map((right: any) => {
    const entity = right.entity.code || right.entity.type;
    const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
    return `    <tr>\n` +
           `      <td>${entity}</td>\n` +
           `      <td>${check(right.recordViewable)}</td>\n` +
           `      <td>${check(right.recordAddable)}</td>\n` +
           `      <td>${check(right.recordEditable)}</td>\n` +
           `      <td>${check(right.recordDeletable)}</td>\n` +
           `      <td>${check(right.appEditable)}</td>\n` +
           `      <td>${check(right.fileExportable)}</td>\n` +
           `      <td>${check(right.fileImportable)}</td>\n` +
           `    </tr>\n`;
  }).join("");
  aclMdContent += `  </tbody>\n</table>\n\n`;

  // レコードのアクセス権
  if (recordRights.length > 0) {
    aclMdContent += `## レコードのアクセス権\n\n`;
    aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>優先度</th>\n      <th>条件</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n      <th>削除</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    aclMdContent += recordRights.map((right: any, priorityIdx: number) => {
      const rowCount = right.entities.length;
      return right.entities.map((entityRight: any, i: number) => {
        const entity = entityRight.entity.code || entityRight.entity.type;
        const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
        return `    <tr>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${priorityIdx + 1}</td>\n      <td rowspan="${rowCount}">${right.filterCond || "なし"}</td>\n` : "") +
               `      <td>${entity}</td>\n` +
               `      <td>${check(entityRight.viewable)}</td>\n` +
               `      <td>${check(entityRight.editable)}</td>\n` +
               `      <td>${check(entityRight.deletable)}</td>\n` +
               `    </tr>\n`;
      }).join("");
    }).join("");
    aclMdContent += `  </tbody>\n</table>\n\n`;
  }

  // フィールドのアクセス権
  if (fieldRights.length > 0) {
    aclMdContent += `## フィールドのアクセス権\n\n`;
    aclMdContent += `<table>\n  <thead>\n    <tr>\n      <th>フィールドコード</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    aclMdContent += fieldRights.map((right: any) => {
      const rowCount = right.entities.length;
      return right.entities.map((entityRight: any, i: number) => {
        const entity = entityRight.entity.code || entityRight.entity.type;
        const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
        return `    <tr>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${right.code}</td>\n` : "") +
               `      <td>${entity}</td>\n` +
               `      <td>${check(entityRight.viewable)}</td>\n` +
               `      <td>${check(entityRight.editable)}</td>\n` +
               `    </tr>\n`;
      }).join("");
    }).join("");
    aclMdContent += `  </tbody>\n</table>\n\n`;
  }
  return aclMdContent;
}

export function generateNotificationMd(appId: number, notificationsGeneralInfo: any, notificationsPerRecordInfo: any, notificationsReminderInfo: any): string {
  const generalNotifs = notificationsGeneralInfo.generalNotifications || [];
  const perRecordNotifs = notificationsPerRecordInfo.perRecordNotifications || [];
  const reminderNotifs = notificationsReminderInfo.reminderNotifications || [];

  let notifMdContent = `# [通知設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=notifications)\n\n`;
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
    notifMdContent += generalNotifs.map((notif: any) => {
      const entity = notif.entity.code || notif.entity.type;
      const check = (val: boolean) => val ? `<span class="permission-tag perm-ok">○</span>` : `<span class="permission-tag perm-ng">×</span>`;
      return `    <tr>\n` +
             `      <td>${entity}</td>\n` +
             `      <td>${check(notif.recordAdded)}</td>\n` +
             `      <td>${check(notif.recordEdited)}</td>\n` +
             `      <td>${check(notif.statusChanged)}</td>\n` +
             `      <td>${check(notif.commentAdded)}</td>\n` +
             `      <td>${check(notif.fileImported)}</td>\n` +
             `    </tr>\n`;
    }).join("");
    notifMdContent += `  </tbody>\n</table>\n\n`;
  }

  // レコードの条件通知
  if (perRecordNotifs.length > 0) {
    notifMdContent += `## レコードの条件通知\n\n`;
    notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    notifMdContent += perRecordNotifs.map((notif: any) => {
      const rowCount = notif.targets.length;
      return notif.targets.map((target: any, i: number) => {
        const entity = target.entity.code || target.entity.type;
        return `    <tr>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${notif.filterCond || "なし"}</td>\n` : "") +
               `      <td>${entity}</td>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${notif.title || ""}</td>\n` : "") +
               `    </tr>\n`;
      }).join("");
    }).join("");
    notifMdContent += `  </tbody>\n</table>\n\n`;
  }

  // リマインダーの条件通知
  if (reminderNotifs.length > 0) {
    notifMdContent += `## リマインダーの条件通知\n\n`;
    notifMdContent += `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>通知タイミング</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n`;
    notifMdContent += reminderNotifs.map((notif: any) => {
      const rowCount = notif.targets.length;
      const timing = notif.timing ? `${notif.timing.code} ${notif.timing.days}日 ${notif.timing.hours}時間 ${notif.timing.minutes}分` : "";
      return notif.targets.map((target: any, i: number) => {
        const entity = target.entity.code || target.entity.type;
        return `    <tr>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${notif.filterCond || "なし"}</td>\n      <td rowspan="${rowCount}">${timing}</td>\n` : "") +
               `      <td>${entity}</td>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${notif.title || ""}</td>\n` : "") +
               `    </tr>\n`;
      }).join("");
    }).join("");
    notifMdContent += `  </tbody>\n</table>\n\n`;
  }
  return notifMdContent;
}

export function generateFormMd(appId: number, fieldsInfo: any, layoutInfo: any): string {
  const properties = fieldsInfo.properties || {};
  const layout = layoutInfo.layout || [];

  // properties をフラットにする（テーブル内のフィールドも含む）
  const flatProperties: Record<string, any> = Object.entries(properties as Record<string, any>).reduce((acc, [code, prop]) => {
    acc[code] = prop;
    if (prop.type === 'SUBTABLE' && prop.fields) {
      Object.entries(prop.fields).forEach(([subCode, subProp]) => {
        acc[subCode] = subProp;
      });
    }
    return acc;
  }, {} as Record<string, any>);

  let formMdContent = `# [フォーム設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=form)\n\n`;
  const style = `<style>\n` +
    `  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }\n` +
    `  th, td { border: 1px solid #ddd; padding: 12px 8px; text-align: left; vertical-align: middle; }\n` +
    `  th { background-color: #f4f5f7; color: #333; font-weight: bold; border-bottom: 2px solid #ccc; white-space: nowrap; }\n` +
    `  td { background-color: #fff; }\n` +
    `  tbody tr:hover td { background-color: #f9fafb; }\n` +
    `</style>\n\n`;
  formMdContent += style;

  formMdContent += `<table>\n  <thead>\n    <tr>\n      <th>場所</th>\n      <th>フィールド名</th>\n      <th>フィールドコード</th>\n      <th>タイプ</th>\n      <th>必須</th>\n      <th>設定詳細</th>\n    </tr>\n  </thead>\n  <tbody>\n`;

  const renderFieldRows = (fields: any[], location: string) => {
    return fields.map(field => {
      let rowHtml = `    <tr>\n      <td>${location}</td>\n`;

      if (field.type === 'HR') {
        return rowHtml + `      <td>(横線)</td>\n      <td>-</td>\n      <td>${field.type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }
      if (field.type === 'LABEL') {
        const labelText = field.label ? field.label.replace(/<[^>]*>?/gm, '') : '(ラベル)';
        return rowHtml + `      <td>${labelText}</td>\n      <td>-</td>\n      <td>${field.type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }
      if (field.type === 'SPACER') {
        return rowHtml + `      <td>(スペース: ${field.elementId || 'IDなし'})</td>\n      <td>-</td>\n      <td>${field.type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }

      const prop = flatProperties[field.code];
      const detailParts: string[] = [];
      if (prop) {
        if (prop.options) {
          const options = Object.values(prop.options as Record<string, any>)
            .sort((a, b) => Number(a.index) - Number(b.index))
            .map(opt => opt.label)
            .join(", ");
          detailParts.push(`選択肢: ${options}`);
        }
        if (prop.expression) {
          detailParts.push(`計算式: <code>${prop.expression}</code>`);
        }
        if (prop.lookup) {
          const lookup = prop.lookup;
          detailParts.push(`ルックアップ先: アプリID ${lookup.relatedApp.app} (キー: ${lookup.relatedKeyField})`);
        }
      }
      const details = detailParts.join('<br>') || '-';

      if (prop) {
        return rowHtml + `      <td>${prop.label || '設定なし'}</td>\n      <td>${field.code}</td>\n      <td>${prop.type}</td>\n      <td>${prop.required ? '○' : '-'}</td>\n      <td>${details}</td>\n    </tr>\n`;
      } else {
        return rowHtml + `      <td>不明</td>\n      <td>${field.code}</td>\n      <td>${field.type}</td>\n      <td>-</td>\n      <td>${details}</td>\n    </tr>\n`;
      }
    }).join("");
  };

  formMdContent += layout.map((section: any) => {
    if (section.type === 'GROUP') {
      const groupProp = properties[section.code];
      const groupLabel = groupProp ? groupProp.label : section.code;
      return section.layout.map((row: any) => renderFieldRows(row.fields, `グループ: ${groupLabel}`)).join("");
    } else if (section.type === 'ROW') {
      return renderFieldRows(section.fields, ``);
    } else if (section.type === 'SUBTABLE') {
      const tableProp = properties[section.code];
      const tableLabel = tableProp ? tableProp.label : section.code;
      return renderFieldRows(section.fields, `テーブル: ${tableLabel}`);
    }
    return "";
  }).join("");

  formMdContent += `  </tbody>\n</table>\n`;

  return formMdContent;
}


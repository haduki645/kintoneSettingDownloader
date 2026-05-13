import { KINTONE_BASE_URL } from "./kintone";
import { getCheckMark, getEntityName, stripHtml } from "./utils";

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

  const { views } = viewsInfo;
  const viewsArray = Object.values(views as Record<string, any>).sort((a, b) => Number(a.index) - Number(b.index));

  viewMdContent += viewsArray.map(view => {
    const { id, filterCond, sort, name, type } = view;
    const viewUrl = `${KINTONE_BASE_URL}/k/${appId}/?view=${id}`;
    const filterCondStr = filterCond ? `\`${filterCond}\`` : "なし";
    const sortStr = sort ? `\`${sort}\`` : "なし";
    return `    <tr>\n` +
           `      <td><a href="${viewUrl}" target="_blank">${name}</a></td>\n` +
           `      <td>${type}</td>\n` +
           `      <td>${filterCondStr}</td>\n` +
           `      <td>${sortStr}</td>\n` +
           `    </tr>\n`;
  }).join("");

  viewMdContent += `  </tbody>\n`;
  viewMdContent += `</table>\n`;
  return viewMdContent;
}

export function generateAclMd(appId: number, appAclInfo: any, recordAclInfo: any, fieldAclInfo: any): string {
  const { rights: appRights = [] } = appAclInfo;
  const { rights: recordRights = [] } = recordAclInfo;
  const { rights: fieldRights = [] } = fieldAclInfo;

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

  const sections = [
    `# [アクセス権設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=permissions)\n\n`,
    style,
    `## アプリのアクセス権\n\n`,
    `<table>\n  <thead>\n    <tr>\n      <th>対象</th>\n      <th>レコード閲覧</th>\n      <th>レコード追加</th>\n      <th>レコード編集</th>\n      <th>レコード削除</th>\n      <th>アプリ管理</th>\n      <th>ファイル出力</th>\n      <th>ファイル取り込み</th>\n    </tr>\n  </thead>\n  <tbody>\n`,
    appRights.map((right: any) => {
      const { recordViewable, recordAddable, recordEditable, recordDeletable, appEditable, fileExportable, fileImportable } = right;
      const check = getCheckMark;
      return `    <tr>\n` +
             `      <td>${getEntityName(right.entity)}</td>\n` +
             `      <td>${check(recordViewable)}</td>\n` +
             `      <td>${check(recordAddable)}</td>\n` +
             `      <td>${check(recordEditable)}</td>\n` +
             `      <td>${check(recordDeletable)}</td>\n` +
             `      <td>${check(appEditable)}</td>\n` +
             `      <td>${check(fileExportable)}</td>\n` +
             `      <td>${check(fileImportable)}</td>\n` +
             `    </tr>\n`;
    }).join(""),
    `  </tbody>\n</table>\n\n`,
    recordRights.length > 0 ? (
      `## レコードのアクセス権\n\n` +
      `<table>\n  <thead>\n    <tr>\n      <th>優先度</th>\n      <th>条件</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n      <th>削除</th>\n    </tr>\n  </thead>\n  <tbody>\n` +
      recordRights.map((right: any, priorityIdx: number) => {
        const { entities, filterCond = "なし" } = right;
        const rowCount = entities.length;
        return entities.map((entityRight: any, i: number) => {
          const { viewable, editable, deletable } = entityRight;
          const check = getCheckMark;
          return `    <tr>\n` +
                 (i === 0 ? `      <td rowspan="${rowCount}">${priorityIdx + 1}</td>\n      <td rowspan="${rowCount}">${filterCond}</td>\n` : "") +
                 `      <td>${getEntityName(entityRight.entity)}</td>\n` +
                 `      <td>${check(viewable)}</td>\n` +
                 `      <td>${check(editable)}</td>\n` +
                 `      <td>${check(deletable)}</td>\n` +
                 `    </tr>\n`;
        }).join("");
      }).join("") +
      `  </tbody>\n</table>\n\n`
    ) : null,
    fieldRights.length > 0 ? (
      `## フィールドのアクセス権\n\n` +
      `<table>\n  <thead>\n    <tr>\n      <th>フィールドコード</th>\n      <th>対象</th>\n      <th>閲覧</th>\n      <th>編集</th>\n    </tr>\n  </thead>\n  <tbody>\n` +
      fieldRights.map((right: any) => {
        const { entities, code: fieldCode } = right;
        const rowCount = entities.length;
        return entities.map((entityRight: any, i: number) => {
          const { viewable, editable } = entityRight;
          const check = getCheckMark;
          return `    <tr>\n` +
                 (i === 0 ? `      <td rowspan="${rowCount}">${fieldCode}</td>\n` : "") +
                 `      <td>${getEntityName(entityRight.entity)}</td>\n` +
                 `      <td>${check(viewable)}</td>\n` +
                 `      <td>${check(editable)}</td>\n` +
                 `    </tr>\n`;
        }).join("");
      }).join("") +
      `  </tbody>\n</table>\n\n`
    ) : null
  ];

  return sections.filter(Boolean).join("");
}

export function generateNotificationMd(appId: number, notificationsGeneralInfo: any, notificationsPerRecordInfo: any, notificationsReminderInfo: any): string {
  const { generalNotifications: generalNotifs = [] } = notificationsGeneralInfo;
  const { perRecordNotifications: perRecordNotifs = [] } = notificationsPerRecordInfo;
  const { reminderNotifications: reminderNotifs = [] } = notificationsReminderInfo;

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

  const sections = [
    `# [通知設定 (アプリID: ${appId})](${KINTONE_BASE_URL}/k/admin/app/flow?app=${appId}#section=notifications)\n\n`,
    style,
    generalNotifs.length > 0 ? (
      `## アプリの条件通知\n\n` +
      `<table>\n  <thead>\n    <tr>\n      <th>対象</th>\n      <th>レコード追加</th>\n      <th>編集</th>\n      <th>ステータス更新</th>\n      <th>コメント追加</th>\n      <th>ファイル読み込み</th>\n    </tr>\n  </thead>\n  <tbody>\n` +
      generalNotifs.map((notif: any) => {
        const { entity, recordAdded, recordEdited, statusChanged, commentAdded, fileImported } = notif;
        const check = getCheckMark;
        return `    <tr>\n` +
               `      <td>${getEntityName(entity)}</td>\n` +
               `      <td>${check(recordAdded)}</td>\n` +
               `      <td>${check(recordEdited)}</td>\n` +
               `      <td>${check(statusChanged)}</td>\n` +
               `      <td>${check(commentAdded)}</td>\n` +
               `      <td>${check(fileImported)}</td>\n` +
               `    </tr>\n`;
      }).join("") +
      `  </tbody>\n</table>\n\n`
    ) : null,
    perRecordNotifs.length > 0 ? (
      `## レコードの条件通知\n\n` +
      `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n` +
      perRecordNotifs.map((notif: any) => {
        const { targets, filterCond = "なし", title = "" } = notif;
        const rowCount = targets.length;
        return targets.map((target: any, i: number) => `    <tr>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${filterCond}</td>\n` : "") +
               `      <td>${getEntityName(target.entity)}</td>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${title}</td>\n` : "") +
               `    </tr>\n`).join("");
      }).join("") +
      `  </tbody>\n</table>\n\n`
    ) : null,
    reminderNotifs.length > 0 ? (
      `## リマインダーの条件通知\n\n` +
      `<table>\n  <thead>\n    <tr>\n      <th>条件</th>\n      <th>通知タイミング</th>\n      <th>対象</th>\n      <th>通知内容</th>\n    </tr>\n  </thead>\n  <tbody>\n` +
      reminderNotifs.map((notif: any) => {
        const { targets, filterCond = "なし", title = "", timing: timingInfo } = notif;
        const rowCount = targets.length;
        const timing = timingInfo ? `${timingInfo.code} ${timingInfo.days}日 ${timingInfo.hours}時間 ${timingInfo.minutes}分` : "";
        return targets.map((target: any, i: number) => `    <tr>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${filterCond}</td>\n      <td rowspan="${rowCount}">${timing}</td>\n` : "") +
               `      <td>${getEntityName(target.entity)}</td>\n` +
               (i === 0 ? `      <td rowspan="${rowCount}">${title}</td>\n` : "") +
               `    </tr>\n`).join("");
      }).join("") +
      `  </tbody>\n</table>\n\n`
    ) : null
  ];

  return sections.filter(Boolean).join("");
}

export function generateFormMd(appId: number, fieldsInfo: any, layoutInfo: any): string {
  const { properties = {} } = fieldsInfo;
  const { layout = [] } = layoutInfo;

  // properties をフラットにする（テーブル内のフィールドも含む）
  const flatProperties: Record<string, any> = Object.entries(properties as Record<string, any>).reduce((acc, [code, prop]) => {
    acc[code] = prop;
    if (prop.type !== 'SUBTABLE' || !prop.fields) return acc;

    Object.entries(prop.fields).forEach(([subCode, subProp]) => {
      acc[subCode] = subProp;
    });
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
      const { type, label, elementId, code } = field;
      const rowHtml = `    <tr>\n      <td>${location}</td>\n`;

      if (type === 'HR') {
        return rowHtml + `      <td>(横線)</td>\n      <td>-</td>\n      <td>${type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }
      if (type === 'LABEL') {
        const labelText = label ? stripHtml(label) : '(ラベル)';
        return rowHtml + `      <td>${labelText}</td>\n      <td>-</td>\n      <td>${type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }
      if (type === 'SPACER') {
        return rowHtml + `      <td>(スペース: ${elementId || 'IDなし'})</td>\n      <td>-</td>\n      <td>${type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }

      const prop = flatProperties[code];
      if (!prop) {
        return rowHtml + `      <td>不明</td>\n      <td>${code}</td>\n      <td>${type}</td>\n      <td>-</td>\n      <td>-</td>\n    </tr>\n`;
      }

      const detailParts: string[] = [];
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
        const { lookup } = prop;
        detailParts.push(`ルックアップ先: アプリID ${lookup.relatedApp.app} (キー: ${lookup.relatedKeyField})`);
      }
      const details = detailParts.join('<br>') || '-';

      return rowHtml + `      <td>${prop.label || '設定なし'}</td>\n      <td>${code}</td>\n      <td>${prop.type}</td>\n      <td>${prop.required ? '○' : '-'}</td>\n      <td>${details}</td>\n    </tr>\n`;
    }).join("");
  };

  formMdContent += layout.map((section: any) => {
    const { type, code: sectionCode, layout: sectionLayout, fields } = section;
    if (type === 'GROUP') {
      const groupProp = properties[sectionCode];
      const groupLabel = groupProp ? groupProp.label : sectionCode;
      return sectionLayout.map((row: any) => renderFieldRows(row.fields, `グループ: ${groupLabel}`)).join("");
    }
    
    if (type === 'ROW') {
      return renderFieldRows(fields, ``);
    }
    
    if (type === 'SUBTABLE') {
      const tableProp = properties[sectionCode];
      const tableLabel = tableProp ? tableProp.label : sectionCode;
      return renderFieldRows(fields, `テーブル: ${tableLabel}`);
    }
    
    return "";
  }).join("");

  formMdContent += `  </tbody>\n</table>\n`;

  return formMdContent;
}


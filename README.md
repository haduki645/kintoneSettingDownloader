# kintoneSettingDownloader

## このプログラムについて

このプログラムは、kintone アプリの設定情報を一括でダウンロードし、可視化するためのツールです。指定したアプリ ID に基づいて、以下の情報を取得・生成します。

- **設定ファイルの取得**: アプリの基本情報、フィールド設定、一覧設定、カスタマイズ設定（JS/CSS）、アクセス権、通知設定、アクション、プラグインなどの JSON ファイルをダウンロードします。
- **ドキュメントの自動生成**:
  - `lookup_relation.md`: ルックアップの設定状況をテーブル形式で可視化します。
  - `view.md`: 一覧の設定条件を可視化します。
  - `acl.md`: アプリ・レコード・フィールドのアクセス権設定を可視化します。
  - `notification.md`: 各種通知設定を可視化します。
- **カスタマイズファイルのマージ**:
  - `customize/` フォルダ内にダウンロードされた JS および CSS ファイルを、スコープ（Desktop/Mobile）およびファイル種別（JS/CSS）ごとに順番にマージしたファイルを作成します。
  - 出力ファイル名: `desktop_merge.js`, `desktop_merge.css`, `mobile_merge.js`, `mobile_merge.css`
  - 特定のファイル（外部ライブラリや共通設定ファイルなど）をマージ対象から除外することも可能です。

## env (.env)

プログラムの実行に必要な環境変数を `.env` ファイルに記述します。

- `KINTONE_BASE_URL`: kintone のベース URL（例: `https://xxxx.cybozu.com`）
- `KINTONE_API_TOKEN`: API トークン（複数ある場合はカンマ区切り。パスワード認証を使用する場合は空にしてください）
- `KINTONE_USERNAME`: ログインユーザー名（パスワード認証用）
- `KINTONE_PASSWORD`: ログインパスワード（パスワード認証用）

※ `KINTONE_API_TOKEN` が設定されている場合は API トークン認証が優先されます。

## setting.json

実行対象のアプリや、マージ処理の制御を `setting.json` で設定します。

- `appIds`: ダウンロード対象の kintone アプリ ID の配列。
- `excludeFromMerge`: マージ処理から除外したいファイル名の配列。外部ライブラリや、個別に管理したい共通設定ファイルなどを指定します。

### 設定例

```json
{
  "excludeFromMerge": [
    "010_config.js",
    "020_pastRecord.js",
    "KintoneRestAPIClient_v2.0.35.min.js"
  ],
  "appIds": [
    32,
    78,
    144
  ]
}
```

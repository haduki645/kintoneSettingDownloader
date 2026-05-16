# kintoneSettingDownloader

## このプログラムについて

このプログラムは、kintone アプリの設定情報を一括でダウンロードし、可視化するためのツールです。指定したアプリ ID に基づいて、以下の情報を取得・生成します。

- **設定ファイルの取得**: アプリの基本情報、フィールド設定、一覧設定、カスタマイズ設定（JS/CSS）、アクセス権、通知設定、アクション、プラグインなどの JSON ファイルをダウンロードします。
- **ドキュメントの自動生成**:
  - `lookup_relation.md`: ルックアップの設定状況をテーブル形式で可視化します。
  - `view.md`: 一覧の設定条件を可視化します。
  - `acl.md`: アプリ・レコード・フィールドのアクセス権設定を可視化します。
  - `notification.md`: 各種通知設定を可視化します。
  - `機能一覧.md`: カスタマイズコード内のマーカーを元に機能一覧とリンクを可視化します。
- **開発・比較用ファイルの生成**:
  - 各アプリごとの VS Code ワークスペースファイル (`.code-workspace`) を自動生成します。
  - stg環境とprd環境の設定差分を比較するための WinMerge プロジェクトファイル (`.WinMerge`) を自動生成します。
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

- `apps`: ダウンロード対象の kintone アプリ。環境ごとのID (`stg`, `prd`) のペアや単一のID、階層化されたグループ構成 (`groups`) を指定できます。
- `excludeFromMerge`: マージ処理から除外したいファイル名の配列。外部ライブラリや、個別に管理したい共通設定ファイルなどを指定します。
- `enableAi`: ローカルAI等を利用した処理を行うかどうかのフラグです。
- `aiConfig`: AIAPIのエンドポイントやモデルパス等の設定です。
- `workspaceConfig`: 出力される `.code-workspace` の設定内容です。

### 設定例

```json
{
  "apps": {
    "ids": [
      {
        "stg": 217,
        "prd": 127
      },
      32
    ],
    "groups": [
      {
        "group": "☆商品＆メーカー",
        "ids": [
          {
            "stg": 75,
            "prd": 87
          }
        ]
      }
    ]
  },
  "excludeFromMerge": [
    "010_config.js",
    "020_pastRecord.js",
    "KintoneRestAPIClient_v2.0.35.min.js"
  ],
  "enableAi": false,
  "aiConfig": {
    "baseUrl": "http://localhost:1234/v1",
    "model": "google/gemma-4-e4b"
  },
  "workspaceConfig": {
    "folders": [{ "path": "." }],
    "settings": {}
  }
}
```

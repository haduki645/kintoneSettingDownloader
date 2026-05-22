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

## 実行方法

コマンドライン引数で設定ファイルを指定して実行します。複数指定することも可能です。

```bash
# 通常の実行
node dist/index.js setting.json

# 複数の設定ファイルを連続で実行
node dist/index.js setting1.json setting2.json

# レジューム（再開）モードでの実行
# （途中で処理が止まった場合、最新の出力フォルダに対して処理を再開します）
node dist/index.js --resume setting.json
```

## env (.env)

プログラムの実行に必要な環境変数を `.env` ファイルに記述します。
複数ドメインから同時にダウンロードを行う場合は、サフィックス（`_1`, `_2` など）を付けて複数の設定を記述します。

```env
# --- ドメイン 1 (STG環境など) の設定 ---
KINTONE_BASE_URL_1=https://example-stg.cybozu.com
KINTONE_API_TOKEN_1=
KINTONE_USERNAME_1=comture
KINTONE_PASSWORD_1=comture2023

# --- ドメイン 2 (PRD環境など) の設定 ---
KINTONE_BASE_URL_2=https://example-prd.cybozu.com
KINTONE_API_TOKEN_2=
KINTONE_USERNAME_2=comture
KINTONE_PASSWORD_2=comture2023
```

- `KINTONE_BASE_URL`: kintone のベース URL（複数ある場合は末尾に `_1`, `_2` などを付与）
- `KINTONE_API_TOKEN`: API トークン（パスワード認証を使用する場合は空にしてください）
- `KINTONE_USERNAME`: ログインユーザー名（パスワード認証用）
- `KINTONE_PASSWORD`: ログインパスワード（パスワード認証用）

※ `KINTONE_API_TOKEN` が設定されている場合は API トークン認証が優先されます。

## setting.json

実行対象のアプリや、マージ処理の制御を `setting.json` で設定します。

- `stgDomain` / `prdDomain`: この設定ファイルで使用するドメイン。`.env` で設定した `KINTONE_BASE_URL` と一致するものが自動で選択されます。
- `apps`: ダウンロード対象の kintone アプリ。環境ごとのID (`stg`, `prd`) のペアや単一のID、階層化されたグループ構成 (`groups`) を指定できます。
- `excludeFromMerge`: マージ処理から除外したいファイル名の配列。外部ライブラリや、個別に管理したい共通設定ファイルなどを指定します。
- `enableAi`: ローカルAI等を利用した処理を行うかどうかのフラグです。
- `aiConfig`: AIAPIのエンドポイントやモデルパス等の設定です。
- `workspaceConfig`: 出力される `.code-workspace` の設定内容です。

### 設定例

```json
{
  "stgDomain": "https://example-stg.cybozu.com",
  "prdDomain": "https://example-prd.cybozu.com",
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

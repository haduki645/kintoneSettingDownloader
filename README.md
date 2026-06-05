# kintoneSettingDownloader

## Overview

`kintoneSettingDownloader` is a command‑line utility that bulk‑downloads the configuration of kintone applications and visualises it as markdown documentation. It retrieves:
- App basic information
- Field settings
- View (list) configurations
- JavaScript / CSS customisations
- Access control lists (ACL)
- Notification settings
- Actions, plugins, etc.

The tool also generates helpful artefacts such as a VS Code workspace file for each app and a WinMerge project file for comparing STG and PRD environments.

---

## Features

- **One‑click download** of all relevant settings for one or multiple apps.
- **Automatic markdown generation** (`lookup_relation.md`, `view.md`, `acl.md`, `notification.md`, `機能一覧.md`).
- **Environment handling** – supports multiple domains (e.g., STG and PRD) via the `.env` file.
- **Workspace generation** – creates a `.code‑workspace` file per app for easy VS Code navigation.
- **Diff support** – produces a `.WinMerge` project to compare settings between environments.

---

## Prerequisites

- Node.js (v18 or later) installed.
- `npm install` to install dependencies (see below).
- A `.env` file with the required Kintone credentials (see **Environment Variables** section).

---

## Installation

```bash
# clone the repository (if you haven't already)
git clone https://github.com/haduki645/kintoneSettingDownloader.git
cd kintoneSettingDownloader

# install dependencies
npm ci
```

---

## Usage

The program is executed via `node dist/index.js` and accepts one or more **setting JSON** files as arguments.

```bash
# Run with a single configuration file
node dist/index.js setting.json

# Run with multiple configuration files in sequence
node dist/index.js setting1.json setting2.json
```

### Setting File (`setting.json`)

The setting file specifies which domains and apps to target.

```json
{
  "stgDomain": "https://example‑stg.cybozu.com",
  "prdDomain": "https://example‑prd.cybozu.com",
  "apps": {
    "ids": [
      { "stg": 217, "prd": 127 },
      32
    ],
    "groups": [
      {
        "group": "☆商品＆メーカー",
        "ids": [
          { "stg": 75, "prd": 87 }
        ]
      }
    ]
  }
}
```

- `stgDomain` / `prdDomain` – the base URLs for the environments; they must match the keys defined in `.env`.
- `apps.ids` – a list of individual app IDs (can specify both STG and PRD IDs or a single ID).
- `apps.groups` – hierarchical groups; each group contains a display name and a list of app IDs.

---

## Environment Variables (`.env`)

Create a `.env` file at the project root with the following variables for each domain you wish to access. Use the suffix `_1`, `_2`, … for multiple domains.

```env
# --- Domain 1 (STG) ---
KINTONE_BASE_URL_1=https://example‑stg.cybozu.com
KINTONE_API_TOKEN_1=YOUR_STG_API_TOKEN
KINTONE_USERNAME_1=your_username   # only needed for password auth
KINTONE_PASSWORD_1=your_password   # only needed for password auth

# --- Domain 2 (PRD) ---
KINTONE_BASE_URL_2=https://example‑prd.cybozu.com
KINTONE_API_TOKEN_2=YOUR_PRD_API_TOKEN
KINTONE_USERNAME_2=your_username
KINTONE_PASSWORD_2=your_password
```

- If `KINTONE_API_TOKEN_<n>` is provided, token authentication is used; otherwise the username/password pair is used.

---

## Generated Output

For each app processed, the tool creates a folder under `result/` containing:
- `lookup_relation.md` – visualisation of lookup field relationships.
- `view.md` – view (list) configuration details.
- `acl.md` – access‑control settings.
- `notification.md` – notification configuration.
- `機能一覧.md` – list of custom functions detected in JS/CSS.
- `.code-workspace` – VS Code workspace file for quick navigation.
- `.WinMerge` – WinMerge project file to diff STG vs PRD settings.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contributing

Feel free to open issues or submit pull requests for improvements, bug fixes, or new features.


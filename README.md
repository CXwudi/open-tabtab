# Open TabTab

A debloated, local-first tab workspace extension for Chromium and Brave. Replace your new-tab page with a three-column workspace to save, organize, and restore browser tabs — backed by optional GitHub Gist sync so your workspace survives across machines.

Open TabTab is inspired by the now-closed-source [TabTab](https://github.com/jackie-feng/tabtab-docs) and preserves the core daily workflow: quickly stash open tabs, organize them into spaces and groups, reopen them later (as normal tabs or native browser tab groups), and keep everything recoverable.

## Features

- **Spaces & groups** — organize saved tabs into hierarchical workspaces.
- **Drag & drop** — reorder spaces, groups, and tabs; move tabs between groups; drag live browser tabs into a group to save them.
- **Current-tabs sidebar** — see and search all open tabs in the current window. Save individual tabs or stash all non-pinned tabs into a timestamped group with one click.
- **Native tab-group restore** — reopen a saved group as a real Chromium tab group with the group name applied as the title.
- **Local-first & offline-safe** — every change saves locally first. Gist sync is best-effort and never blocks the UI.
- **GitHub Gist sync** — configure a personal access token and a Gist ID to automatically push changes and reconcile across devices. Conflicts are surfaced rather than silently overwritten.
- **TabTab backup import** — import a backup exported from the original TabTab extension.

## Quick Start

### Prerequisites

- [pnpm](https://pnpm.io/) (≥ 9)
- A Chromium-based browser (Chrome, Brave, Edge, or any browser supporting Manifest V3 extensions)

### Install from source

```bash
git clone <repo-url>
cd tabtab-clone
pnpm install
pnpm build
```

Then load the unpacked extension:

1. Open `chrome://extensions` (or `brave://extensions`).
2. Enable **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select the `tabtab-clone/.output/chrome-mv3` directory.
4. Open a new tab — the workspace replaces the default new-tab page.

### Configure Gist sync (optional)

1. Create a [GitHub personal access token (classic)](https://github.com/settings/tokens) with the `gist` scope.
2. In the extension, open **Settings** (gear icon in the sidebar footer).
3. Paste your token, enable sync, and either **Create new private Gist** or paste an existing Gist ID.
4. Use **Test connection** to verify.

## Development

See [DEVELOPERS.md](DEVELOPERS.md) for architecture, project structure, conventions, and guidance for both human and AI contributors.

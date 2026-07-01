# Open TabTab Extension MVP Design Spec

## Problem or Goal

Build Open TabTab (`open-tabtab`), a debloated, personal-use replacement for
TabTab as a Brave/Chromium browser extension. The extension should replace the
new-tab page with a tab workspace where the user can organize saved tabs into
spaces and groups, restore a saved group as a real browser tab group, drag tabs
between groups, and keep data backed up through GitHub Gist sync.

The goal is not to recreate every TabTab feature. The goal is to preserve the core
daily workflow: quickly save open tabs, organize them visually, reopen them later,
and keep the workspace recoverable across machines.

## Context

This repository currently contains raw reference material rather than an app
implementation. The key reference inputs are:

- Captured TabTab docs under `raw/tabtab-docs/`.
- Captured screenshots under `raw/screenshots/`.
- A TabTab backup export at
  `raw/screenshots/tabtab_backup_20260701_1437.json`.

The original TabTab UI uses three major regions:

- Left sidebar: spaces.
- Center workspace: selected space details with groups and saved tab cards.
- Right sidebar: currently open browser tabs.

The captured backup export shows a compact data model:

- A root `version`.
- An ordered `space_list`.
- A `spaces` map.
- Each space has `groups`.
- Each group has saved tab records with `id`, `title`, `url`,
  `favIconUrl`, and `kind`.
- Spaces may also contain `pins`, which should be preserved for compatibility but
  does not need dedicated MVP UI.

## Glossary

- **Extension:** The browser extension package installed in Brave/Chromium.
- **New-tab page:** The extension page shown when the user opens a new tab.
- **Space:** A top-level workspace, similar to a project or area of life.
- **Group / Collection:** A named set of saved tabs inside a space.
- **Saved tab:** A stored tab record containing URL, title, favicon, and metadata.
- **Browser tab:** A currently open tab from Brave/Chromium.
- **Browser tab group:** A native Chromium tab group created through extension APIs.
- **Gist:** A GitHub Gist used as the remote backup/sync store.
- **PAT:** A GitHub personal access token entered manually by the user.
- **Mutation:** A committed data-changing action, such as create, rename, delete,
  reorder, drag/drop completion, or saving a browser tab.

## Design Decision

Build an extension-first Open TabTab MVP using WXT, React, and TypeScript. The
extension should target Brave/Chromium first, use a WXT `newtab` entrypoint for
the replacement new-tab page, persist workspace data locally, and sync a single
JSON backup file to GitHub Gist through a manually configured PAT.

The system should be local-first. Every mutation must save locally first and then
enqueue a best-effort Gist push. Failed remote pushes must not fail, roll back, or
block the local save. The user can resolve remote/local divergence from a settings
page using explicit manual actions.

The MVP must include drag/drop and native browser tab-group restore because those
are part of the core TabTab-like workflow, not polish.

### Recommended Technical Shape

- **Framework:** WXT + React + TypeScript.
- **UI entrypoint:** `entrypoints/newtab/`.
- **Extension config:** `wxt.config.ts` with Chromium permissions and host
  permissions.
- **State model:** typed domain objects derived from the TabTab backup
  structure, with TabTab compatibility handled by an import adapter.
- **Local persistence:** extension storage via a storage repository abstraction.
- **Remote sync:** GitHub Gist REST client plus a serial sync queue.
- **Drag/drop:** `dnd-kit` sortable primitives for spaces, groups, saved tabs, and
  browser-tab-to-group save interactions.
- **Browser APIs:** `chrome.tabs` for querying/opening/closing tabs and
  `chrome.tabGroups` plus `chrome.tabs.group` for native tab group restore.
- **Mutation owner:** the MV3 background service worker owns workspace mutations,
  version bumps, local persistence, and sync queue coordination. New-tab pages
  dispatch commands and observe stored state.

### Extension Permissions and API Boundaries

Expected MVP permissions:

- `storage` for local workspace, settings, and sync state.
- `tabs` for querying current tabs, opening saved tabs, grouping tabs, and closing
  stashed tabs.
- `tabGroups` for updating native browser tab group title/color.

Expected MVP host permissions:

- `https://api.github.com/*` for GitHub Gist REST calls.
- `https://gist.githubusercontent.com/*` only if implementation fetches raw Gist
  file content directly instead of reading through the Gist REST response.

The extension should avoid broad host permissions. Browser API calls should be
wrapped behind small modules so UI components do not directly depend on raw
`chrome.*` APIs.

### Core Data Model

The captured TabTab export is the compatibility baseline for import, not a
strict internal schema:

```ts
type Backup = {
  version: number
  space_list: SpaceSummary[]
  spaces: Record<string, Space>
}

type SpaceSummary = {
  id: string
  name: string
}

type Space = {
  id: string
  name: string
  groups: Collection[]
  pins?: Record<string, unknown>
}

type Collection = {
  id: string
  name: string
  tabs: SavedTab[]
}

type SavedTab = {
  id: string
  title: string
  url: string
  favIconUrl?: string
  kind: 'record'
}
```

The MVP may normalize, extend, or otherwise improve the internal workspace shape
when it makes extension behavior simpler. TabTab-shaped backups must be accepted
on import and transformed into the internal model. Extension-owned metadata may
live in the internal workspace model when it describes workspace content;
settings and sync-only data should stay in separate local settings or sync-state
objects.

In the TabTab import shape, `spaces[id].name` is the canonical space name and
`space_list` is the ordered sidebar index. The internal model may normalize this
into a more convenient representation. If the internal model keeps both
`spaces[id].name` and `space_list`, they must stay in sync:

- Rename updates both `spaces[id].name` and the matching `space_list` item.
- Delete removes both `spaces[id]` and the matching `space_list` item.
- Reorder updates only `space_list`.

On first run, if there is no local workspace and no remote workspace has been
pulled, create one empty space named `Default`. The workspace should still be the
first screen and may show empty-state actions to add a group or import a backup.

### Sync State Model

Workspace data and sync status should be stored separately:

```ts
type SyncState = {
  status: 'idle' | 'syncing' | 'dirty' | 'error' | 'conflict'
  lastSyncedVersion?: number
  pendingVersion?: number
  lastError?: string
  updatedAt?: number
}
```

Settings should store:

```ts
type GistSettings = {
  enabled: boolean
  token?: string
  gistId?: string
  filename: string
}
```

The default filename should be `open-tabtab-backup.json`.

### Mutation, Version, and Concurrency Model

New-tab pages should not write workspace data directly. They should send mutation
commands to the background service worker, such as `createSpace`, `renameGroup`,
`moveSavedTab`, or `stashCurrentTabs`.

For each mutation, the background service worker should:

1. Load the latest workspace from extension storage.
2. Apply the mutation.
3. Bump the version monotonically.
4. Save the updated workspace locally.
5. Update sync state.
6. Enqueue an automatic Gist push when sync is configured.

Version bumps must be monotonic per local store:

```ts
nextVersion = Math.max(Date.now(), currentVersion + 1)
```

This keeps the TabTab-compatible timestamp-like version while avoiding
same-millisecond collisions. It also avoids trusting wall-clock ordering as the
only signal for conflict detection.

Only the background service worker should own the serial sync queue. Multiple open
new-tab pages may exist, but they must share this single writer/queue through the
background worker and extension storage. UI pages should update from command
responses and storage-change events.

## Product Requirements

### New-Tab Extension Shell

- The extension replaces the Brave/Chromium new-tab page.
- The first screen is the workspace itself, not a landing page.
- The layout follows the captured TabTab pattern:
  - Spaces sidebar on the left.
  - Selected space and groups in the center.
  - Current browser tabs sidebar on the right.
- The interface should remain usable if Gist sync is disabled, misconfigured, or
  failing.

### Spaces

- Create a space.
- Rename a space.
- Delete a space with confirmation.
- Select a space.
- Reorder spaces by drag/drop.
- Preserve space order; when importing TabTab-shaped backups, read the order from
  `space_list`.

### Groups / Collections

- Create a group in the selected space.
- Rename a group.
- Delete a group with confirmation.
- Reorder groups by drag/drop.
- Open a group as normal tabs.
- Open a group as a native Brave/Chromium tab group.
- Optional MVP behavior: Alt/Option-click open-and-delete for temporary groups.

### Saved Tabs

- Create a saved tab manually with URL and title.
- Edit a saved tab title and URL.
- Delete a saved tab.
- Reorder saved tabs within a group by drag/drop.
- Move saved tabs across groups by drag/drop.
- Open a saved tab.
- Optional MVP behavior: Alt/Option-click open-and-delete for temporary tabs.

### Current Browser Tabs Sidebar

- Query currently open tabs in the current browser window.
- Display title, URL or title fallback, and favicon.
- Search/filter current browser tabs.
- Drag a browser tab into a saved group to create a saved tab record.
- Save all non-pinned tabs into a new timestamp-named group.
- When saving all tabs, close the saved non-pinned browser tabs after local save
  succeeds.
- Pinned tabs must not be closed by one-click stash.
- The extension's own new-tab/workspace tab must not be closed by one-click stash.

### Drag/Drop

Drag/drop is part of the MVP.

Required drag/drop actions:

- Reorder spaces.
- Reorder groups inside a space.
- Reorder saved tabs inside a group.
- Move saved tabs between groups.
- Drag a browser tab from the right sidebar into a group to save it.

Each drag/drop operation should count as one mutation on drop. Hover movement must
not trigger storage writes or Gist pushes.

### Native Browser Tab Group Restore

When the user opens a saved group as a browser tab group:

- Create one browser tab for each saved tab URL.
- Group those browser tabs with `chrome.tabs.group`.
- Set the native tab group title to the saved group name with
  `chrome.tabGroups.update`.
- Use a simple default color for MVP, or allow a small fixed color list if the UI
  already needs it.
- Do not delete the saved group unless the user used an explicit open-and-delete
  action.

### GitHub Gist Sync

Gist sync is required for MVP.

Authentication:

- Start with manual PAT setup.
- The PAT must have Gist access.
- OAuth is out of scope for MVP.

Remote storage:

- Store one private Gist file named `open-tabtab-backup.json` by default.
- If `gistId` is missing, the settings page should allow creating a new private
  Gist.
- If the user already has a Gist, the settings page should allow pasting the
  existing Gist ID. A full "list and select my Gists" UI is out of scope for MVP.
- If the configured filename does not exist in the existing Gist, the first push
  should create that file inside the Gist.
- Updating an existing Gist should replace the configured file content with the
  latest serialized backup.
- The synced backup file must not include the PAT or local sync settings.

Automatic sync behavior:

- On new-tab app startup, ask the background service worker to reconcile with
  remote if sync is configured.
- On every local mutation, save locally first.
- After local save succeeds, bump version with the monotonic version rule.
- After the version bump, enqueue an automatic Gist push.
- Push jobs must run serially.
- If a push is already running and another mutation happens, the queue should push
  the newest local snapshot after the current push finishes.
- Drag/drop writes enqueue one push after drop, not during drag movement.

Startup reconciliation:

- Local clean and remote unchanged: no-op.
- Local dirty and remote unchanged: push local to remote.
- Local clean and remote changed: replace local with remote.
- Local dirty and remote changed: mark `conflict` and require manual resolution.

Failure behavior:

- If automatic push fails, keep the local save.
- Mark sync state as `dirty` or `error`.
- Keep the latest local version as `pendingVersion`.
- Do not block future local mutations.
- Future mutations should continue to enqueue the newest snapshot.

Conflict behavior:

- This MVP intentionally diverges from original TabTab's silent last-write-wins
  behavior by surfacing conflicts instead of overwriting one side automatically.
- Detect conflicts on pull or startup reconciliation.
- Let `remoteVersion` be the version of the pulled backup.
- Let `localDirty` mean `pendingVersion` is set.
- Let `remoteMoved` mean `remoteVersion !== lastSyncedVersion`.
- If `localDirty` and `remoteMoved` are both true, mark `conflict`.
- If only local changed, push local to remote.
- If only remote changed, replace local with remote.
- If neither side changed, no-op.
- Show manual resolution actions:
  - Replace remote with local.
  - Replace local with remote.
  - Export local backup.
  - Import backup file.

Manual settings actions:

- Configure PAT.
- Paste an existing Gist ID or create a new private Gist.
- Test connection.
- Pull Gist to local.
- Push local to Gist.
- Export local backup.
- Import local backup.
- Show current local version, last synced version, sync status, and last error.

Manual import should validate the backup file, replace the whole local workspace,
bump version with the monotonic version rule, and enqueue a push if Gist sync is
enabled. It should not merge imported data with existing local data in MVP.

"Replace local with remote" should replace the whole local workspace with the
remote backup and mark sync clean for that remote version. It should not
immediately push the same data back to remote.

## Scope and Non-Goals

In scope:

- Brave/Chromium extension.
- New-tab replacement.
- Local-first workspace storage.
- CRUD for spaces, groups, and saved tabs.
- Current browser tabs sidebar.
- Drag/drop organization.
- Save current/all tabs.
- Open saved group as a native browser tab group.
- GitHub Gist auto sync through manual PAT setup.
- Manual recovery actions for local/remote replacement.
- Backup import accepts the captured TabTab export shape.

Out of scope for MVP:

- Firefox support.
- GitHub OAuth login.
- WebDAV sync.
- Google login.
- Multi-language UI.
- Theme system beyond a simple default theme.
- Toby import.
- Public sharing.
- Zen mode.
- Advanced browser tab group color/icon customization.
- Automatic conflict merge.
- Mobile support.
- Publishing to extension stores.

## Alternatives Considered

- **Web app prototype first:** Faster for UI cloning, but it cannot query, close,
  group, or restore real Brave tabs. Rejected because this project is explicitly an
  extension and core behavior depends on browser extension APIs.
- **Extension without sync in MVP:** Simpler and lower risk, but rejected because
  Gist sync is a required MVP feature and protects against data loss.
- **OAuth-based GitHub login first:** Better long-term user experience, but more
  setup complexity. Rejected for MVP in favor of manual PAT setup.
- **Remote-first sync:** Easier to reason about consistency, but rejected because
  tab organization must keep working when GitHub is slow, unavailable, or
  misconfigured.

## Risks and Open Questions

- Brave should support Chromium extension APIs used here, but implementation should
  verify `chrome.tabs.group` and `chrome.tabGroups.update` in Brave manually.
- Manual PAT storage is sensitive. MVP should store it in extension local storage
  and avoid logging it, but this is not as strong as OAuth or native secret storage.
- GitHub API rate limits and network failures can leave sync dirty for a while.
  The local-first model intentionally accepts this and exposes manual recovery.
- MV3 background service workers can stop between events. Sync state and queue
  state must be persisted enough that a new new-tab session can recover dirty
  status and retry.
- Automatic conflict merge is intentionally excluded. This may be inconvenient if
  the same Gist is edited from multiple machines before sync catches up.
- The backup export includes `pins`, but pin behavior is not documented in the raw
  docs. MVP should preserve this field but not design UI around it.
- Saved `file://` URLs should be preserved during import/export, but opening them
  may be limited by Brave/Chromium extension file-access settings.

## Validation Considerations

Implementation should be validated at three levels:

- Domain tests:
  - Create, rename, delete, and reorder spaces/groups/tabs.
  - Move tabs between groups.
  - Import the captured TabTab backup shape and export the app's chosen backup
    shape.
  - Version increases monotonically once per committed mutation.
- Sync tests:
  - Local save succeeds when Gist push fails.
  - Failed push marks sync dirty/error.
  - Serial queue pushes the newest snapshot after rapid mutations.
  - Conflict detection prevents silent overwrite when local and remote both changed.
- Browser manual tests in Brave:
  - Extension loads as the new-tab page.
  - Current tabs sidebar reflects real browser tabs.
  - Drag a current browser tab into a group and verify it is saved.
  - Save all non-pinned tabs into a timestamped group and verify non-pinned tabs
    close only after local save succeeds.
  - Open one saved tab.
  - Open a saved group as native Brave tab group and verify title is set.
  - Configure PAT/Gist and verify automatic push after mutation.
  - Disable network or use a bad token and verify local save still succeeds.

## References
<!-- list of references, such as files, urls, or other resources -->

| Resouce | Description | Other Notes if any |
| --- | --- | --- |
| [raw/tabtab-docs/pages/usage/basic.md](../raw/tabtab-docs/pages/usage/basic.md) | Captured TabTab usage docs describing new-tab layout, spaces, groups, drag-to-save, and one-click stash. | Must Read |
| [raw/tabtab-docs/pages/usage/sync.md](../raw/tabtab-docs/pages/usage/sync.md) | Captured TabTab sync docs describing version bumping, manual backup, GitHub Gist setup, and auto sync timing. | Must Read |
| [raw/tabtab-docs/pages/advance/open_mode.md](../raw/tabtab-docs/pages/advance/open_mode.md) | Captured TabTab advanced open behavior, including new-tab/redirect modes and Alt-click delete-after-open behavior. | Important |
| [raw/tabtab-docs/pages/advance/settings.md](../raw/tabtab-docs/pages/advance/settings.md) | Captured TabTab settings list, useful for deciding MVP exclusions. | Important |
| [raw/tabtab-docs/pages/changelog/latest.md](../raw/tabtab-docs/pages/changelog/latest.md) | Captured changelog showing later features like Toby import, sharing, Zen mode, and browser tab group display. | Important |
| [raw/screenshots/tabtab_backup_20260701_1437.json](../raw/screenshots/tabtab_backup_20260701_1437.json) | Real TabTab backup export used as the MVP import compatibility baseline. | Must Read |
| [raw/screenshots/Screenshot 2026-07-01 143622.png](../raw/screenshots/Screenshot%202026-07-01%20143622.png) | Screenshot showing the three-column TabTab UI with spaces, grouped saved tabs, and current browser tabs. | Must Read |
| [raw/screenshots/Screenshot 2026-07-01 143640.png](../raw/screenshots/Screenshot%202026-07-01%20143640.png) | Screenshot showing the Dev space and group/card layout density. | Important |
| [Chrome tabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) | Official Chrome extension API for interacting with native browser tab groups. | Must Read |
| [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) | Official Chrome extension API for querying, creating, modifying, grouping, and closing browser tabs. | Must Read |
| [Chrome override pages docs](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages) | Official Chrome documentation for replacing the new-tab page. | Must Read |
| [GitHub Gists REST API](https://docs.github.com/en/rest/gists/gists) | Official GitHub REST API docs for creating, reading, and updating Gists. | Must Read |
| [WXT entrypoints docs](https://wxt.dev/guide/essentials/entrypoints.html) | Official WXT docs describing the `newtab` entrypoint and generated new-tab override. | Important |
| [WXT manifest config docs](https://wxt.dev/guide/essentials/config/manifest) | Official WXT docs for configuring extension manifest values such as permissions. | Important |

# Open TabTab Extension MVP Implementation Plan

> **For agentic workers:** Use the harness's preferred task-tracking and delegation tools when available. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is written to be picked up in isolation: read the spec + this plan's **§0 Contracts** + your task, and you have enough to work.

**Goal:** Build `open-tabtab`, a WXT + React + TypeScript MV3 browser extension that replaces the Brave/Chromium new-tab page with a local-first, three-column tab workspace (spaces / groups / current tabs) featuring drag-drop, native tab-group restore, and best-effort GitHub Gist sync.

**Source of Truth:** [`spec/spec-tabtab-extension-mvp-20260701.md`](../spec/spec-tabtab-extension-mvp-20260701.md) (approved design spec). Where this plan and the spec disagree, the spec wins — raise the conflict instead of guessing.

**Scope:** Everything in the spec's "In scope" list: new-tab shell, spaces/groups/saved-tabs CRUD, current-tabs sidebar, drag-drop, save-current/all, native tab-group restore, Gist auto-sync via manual PAT, manual recovery actions, and TabTab-shaped backup import. Explicitly **excluded** (per spec "Out of scope"): Firefox, OAuth, WebDAV, Google login, i18n, theming beyond default, Toby import, sharing, Zen mode, advanced tab-group customization, auto-merge, mobile, store publishing.

**Approach:** Establish a shared **contract layer** (domain types, message protocol, storage keys, and a `CommandBus` interface) in Phase 0 so the remaining work fans out to 4 independent tracks (Domain, Storage+Sync, Browser, UI). Pure logic (domain mutations, backup adapter, sync reconciliation) is isolated from `chrome.*` so it is unit-testable without a browser. The UI is built against an in-memory `CommandBus` so it runs and is verifiable before the background worker exists. Phase 2 integrates the tracks through the MV3 background service worker (the sole workspace-mutation owner + sync-queue owner). Phase 3 is manual Brave validation.

**Verification:** Three levels, matching the spec's "Validation Considerations":

1. **Automated** — `pnpm test` (Vitest) for domain, backup adapter, sync reconciliation, storage repo, and browser wrappers; `pnpm typecheck` and `pnpm build` must pass.
2. **Standalone UI** — `pnpm dev` loads the new-tab page driven by an in-memory bus + seeded sample backup.
3. **Manual Brave E2E** — the spec's browser checklist (§ Phase 3 below).

---

## Orientation (read once before any task)

### What we are cloning

The reference app (TabTab) new-tab page has three columns (see screenshots in References):

- **Left sidebar** — `TabTab` title + collapse; `Spaces` header with `+`; a list of spaces (icon + name + `...` menu); footer with `Settings`. Hovering a space reveals a drag handle; clicking selects it.
- **Center** — selected space name (click-to-rename) + toolbar (`Search Tabs`, `+ Add collection`, `...`, right-sidebar collapse). Below: **groups (collections)**, each a row with a drag handle, name (click-to-rename), a collapse chevron, and hover actions (open-as-group / delete / `...`). Each group holds **saved-tab cards** in a responsive grid (favicon + title, `...` menu on hover).
- **Right sidebar** — `Tabs (N)` header + sort + save-all buttons; a search box; the live list of the current window's browser tabs (favicon + title).

### Internal data model (normalized from the TabTab backup)

The captured backup (`raw/screenshots/tabtab_backup_20260701_1437.json`) is the **import compatibility baseline**, not our internal schema. Its shape: root `version` (ms-epoch-like number), ordered `space_list: {id,name}[]`, `spaces: Record<id, {id, name, groups: {id,name,tabs}[], pins?}>`, saved tab `{id,title,url,favIconUrl?,kind:'record'}`. `pins` is present but empty `{}` in the sample — **preserve it, build no UI for it**.

We normalize so each fact has one owner (avoids the spec's "keep `spaces[id].name` and `space_list` in sync" hazard):

- **Space name** lives only in `spaces[id].name`.
- **Space order** lives only in `spaceOrder: string[]` (ids only).
- Export reconstructs TabTab's `space_list` as `spaceOrder.map(id => ({id, name: spaces[id].name}))`.

### Ownership rules (from spec § Mutation/Concurrency)

- **Workspace mutations** (create/rename/delete/reorder/move/save/stash/import) are owned **exclusively** by the background service worker. UI never writes workspace storage directly — it dispatches a `Command` and observes results.
- **Browser-tab operations** (query live tabs, open a saved tab/group, native tab-group restore, close stashed tabs, live tab-list updates) are **not** workspace mutations. The new-tab page is an extension page with full `chrome.*` access, so it performs these directly through the thin `src/browser/*` wrappers. Exception: "open-and-delete" = browser open (UI) **then** a delete `Command` (background).
- Version bump rule (monotonic): `nextVersion = Math.max(Date.now(), currentVersion + 1)`.

---

## §0 Contracts (defined in Phase 0, consumed everywhere)

These TypeScript interfaces are the seams that let tracks proceed in parallel. Phase 0 lands them as real files; every later task imports from them and must not change them without updating this section.

### Backup Format Decision (resolved)

Open TabTab's **own export + Gist sync payload use the internal `Workspace` shape** (`{ version, spaceOrder, spaces }`), serialized as pretty JSON. This is a deliberate product decision, distinct from TabTab compatibility:

- **Import is tolerant of both shapes.** `parseBackup(json)` accepts a **TabTab-shaped** backup (has `space_list`) *and* an **Open-TabTab-shaped** backup (has `spaceOrder`), normalizing either to `Workspace`. This satisfies the spec's "import accepts the captured TabTab export shape" requirement while letting us round-trip our own exports.
- **Export / Gist sync / manual export all write `serializeBackup(workspace)`** = the internal `Workspace` JSON. We do **not** write `space_list`.
- **`fromTabTab` is retained** as the TabTab→internal adapter used inside `parseBackup`. A `toTabTab` interop-export is **out of scope** for MVP (not used anywhere).
- The synced/exported JSON still contains only workspace data — never the PAT, `GistSettings`, or `SyncState`.

> If we later add extension-owned fields to `Workspace` (e.g. per-group color), this internal-shape choice already accommodates them; only `parseBackup` needs to stay backward-tolerant.

```ts
// src/domain/types.ts
export type SavedTab = { id: string; title: string; url: string; favIconUrl?: string; kind: 'record' }
export type Group    = { id: string; name: string; tabs: SavedTab[] }
export type Space    = { id: string; name: string; groups: Group[]; pins?: Record<string, unknown> }
export type Workspace = { version: number; spaceOrder: string[]; spaces: Record<string, Space> }

// TabTab import shape (compat baseline for parseBackup; we never EXPORT this shape)
export type TabTabBackup = {
  version: number
  space_list: { id: string; name: string }[]
  spaces: Record<string, { id: string; name: string; groups: Group[]; pins?: Record<string, unknown> }>
}
```

```ts
// src/storage/sync-state.ts
export type SyncStatus = 'idle' | 'syncing' | 'dirty' | 'error' | 'conflict'
export type SyncState = {
  status: SyncStatus
  lastSyncedVersion?: number   // version last confirmed identical on remote
  pendingVersion?: number      // set when there are unpushed local changes (== "localDirty")
  lastError?: string
  updatedAt?: number
}

// src/storage/settings.ts
export type GistSettings = {
  enabled: boolean
  token?: string
  gistId?: string
  filename: string             // default 'open-tabtab-backup.json'
}
```

```ts
// src/messaging/protocol.ts
// Discriminated union of every command the UI can dispatch. Background is the handler.
export type Command =
  | { type: 'getState' }
  | { type: 'createSpace'; name: string }
  | { type: 'renameSpace'; spaceId: string; name: string }
  | { type: 'deleteSpace'; spaceId: string }
  | { type: 'reorderSpaces'; orderedIds: string[] }
  | { type: 'createGroup'; spaceId: string; name: string }
  | { type: 'renameGroup'; spaceId: string; groupId: string; name: string }
  | { type: 'deleteGroup'; spaceId: string; groupId: string }
  | { type: 'reorderGroups'; spaceId: string; orderedIds: string[] }
  | { type: 'createSavedTab'; spaceId: string; groupId: string; title: string; url: string }
  | { type: 'editSavedTab'; spaceId: string; groupId: string; tabId: string; title: string; url: string }
  | { type: 'deleteSavedTab'; spaceId: string; groupId: string; tabId: string }
  | { type: 'reorderSavedTabs'; spaceId: string; groupId: string; orderedIds: string[] }
  | { type: 'moveSavedTab'; from: { spaceId: string; groupId: string }; to: { spaceId: string; groupId: string; index: number }; tabId: string }
  | { type: 'saveBrowserTab'; spaceId: string; groupId: string; index?: number; tab: { title: string; url: string; favIconUrl?: string } }
  | { type: 'stashCurrentTabs'; spaceId: string; groupName: string; tabs: { title: string; url: string; favIconUrl?: string }[] }
  | { type: 'importBackup'; backup: unknown }
  // sync/settings commands
  | { type: 'reconcile' }
  | { type: 'setGistSettings'; patch: GistSettingsPatch }   // PATCH, not full replace — see below
  | { type: 'testConnection' }
  | { type: 'createGist' }
  | { type: 'pullNow' }
  | { type: 'pushNow' }
  | { type: 'resolveConflict'; resolution: 'useLocal' | 'useRemote' }

// Partial update so the UI (which never holds the raw token) can change enabled/gistId/filename
// without erasing the stored PAT. Omitted `token` == preserve; `clearToken:true` == remove it.
export type GistSettingsPatch = {
  enabled?: boolean
  token?: string
  clearToken?: boolean
  gistId?: string
  filename?: string
}

// Every command resolves to a snapshot (+ optional payload for testConnection/export).
export type Snapshot = { workspace: Workspace; syncState: SyncState; settings: PublicGistSettings }
export type PublicGistSettings = Omit<GistSettings, 'token'> & { hasToken: boolean } // never leak token to UI logs
export type CommandResult =
  | { ok: true; snapshot: Snapshot; data?: unknown }
  | { ok: false; error: string; snapshot?: Snapshot }

// The seam the UI codes against. Phase 1 ships InMemoryCommandBus; Phase 2 ships RuntimeCommandBus.
export interface CommandBus {
  dispatch(cmd: Command): Promise<CommandResult>
  // Fires whenever the observed state changes. InMemory: in-process listeners.
  // Runtime: WXT storage.watch on the workspace/syncState/settings keys (NOT a broadcast message).
  subscribe(listener: (snapshot: Snapshot) => void): () => void
}
```

**Messaging & state-observation transport (resolved — Codex #6/#7):**

- **Commands** travel over [`@webext-core/messaging`](https://webext-core.aklinker1.io/messaging/) typed request/response, defined once in `src/messaging/messaging.ts` via `defineExtensionMessaging<{ dispatchCommand(cmd: Command): CommandResult }>()`. This handles the async-response lifecycle correctly, so we avoid raw `chrome.runtime.onMessage` + `return true` footguns and need no message "envelope" (commands are the only message kind).
- **State observation** is storage-driven, not message-driven: the background persists workspace/syncState/settings; each new-tab page reacts with WXT `storage.watch(...)` and re-reads the snapshot. This is what makes multiple open new-tab pages stay consistent, and it removes any `command`-vs-`snapshot` ambiguity by construction.

```ts
// src/storage/keys.ts
export const STORAGE_KEYS = {
  workspace: 'local:workspace',    // Workspace
  syncState: 'local:syncState',    // SyncState
  settings:  'local:settings',     // GistSettings
} as const
```

**Contract invariants (hold these constant across tracks):**

- `dispatch` never throws for expected failures; it returns `{ ok:false, error }` and (when possible) the unchanged snapshot.
- Bootstrap (`Default` space creation on first run) sets a `version` but leaves `SyncState` **clean** (`status:'idle'`, no `pendingVersion`). Bootstrap is not a user mutation, so a freshly configured existing remote reconciles as "remote changed, local clean → replace local with remote" rather than a conflict. See Task 6 note.
- `PublicGistSettings.hasToken` is what the UI reads; the raw `token` never crosses back to the UI and is never logged.

---

## Work Assignment / Dependency Graph

```text
Phase 0  ─ Task 0  Bootstrap + Contracts            (1 agent, blocks everything)
                     │
   ┌─────────────────┼───────────────────┬───────────────────────┐
   ▼                 ▼                   ▼                       ▼
Phase 1
 Task 1 Domain     Task 2 Storage+Sync   Task 3 Browser wrappers  Task 4 UI shell
 (pure)            (storage+gist+recon)  (tabs/tabGroups)         (against InMemory bus)
   │                 │                   │                       │
   └────────┬────────┴─────────┬─────────┴───────────┬───────────┘
            ▼                   ▼                     ▼
Phase 2
 Task 5 Background handler   Task 6 Sync engine+queue   Task 7 Runtime bus + UI wiring
 (needs 1)                   (needs 2, 5)               (needs 4,5)
            │                        │                          │
            └────────────┬───────────┴─────────────┬────────────┘
                         ▼                          ▼
            Task 8 DnD interactions
            (needs 7)
                         │
                         ▼
            Task 9 Browser actions in UI
            (needs 3,7,8)   ← serialized after 8: shares new-tab components
                         │
                         ▼
                          Task 10 Settings + sync UI  (needs 2,6,7)
                                     │
                                     ▼
Phase 3         Task 11 Manual Brave E2E validation  (needs all)
```

**Parallel-safe sets:** After Task 0, run {1, 2, 3, 4} concurrently — but note Task 4 has a real (not-drawn-as-a-branch) code dependency on Task 1: its `InMemoryCommandBus` imports `src/domain/operations.ts`, so Task 4 can *scaffold* immediately against the §0 contracts but its live-mutation verification (`pnpm dev`) only passes once Task 1 lands. After Tasks 1–5 land, {6, 7} can proceed; then Task 8; then Task 9 (**serialized after 8** — both modify `CurrentTabsSidebar.tsx`, `SavedTabCard.tsx`, and `GroupRow.tsx`, so they must not run concurrently); then 10; then 11. Every other task below lists exact files so two agents never edit the same file simultaneously.

---

## Phase 0 — Foundation

### Task 0: Project bootstrap + shared contracts

#### 0.1 Intent

Stand up the WXT + React + TS project, wire Vitest with WXT's fake browser, and land every §0 contract file as compiling source so all four Phase-1 tracks can import stable types. No feature logic yet — stubs that typecheck.

#### 0.2 Files

- Create: `package.json`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `entrypoints/background.ts` (stub: registers a no-op message listener), `entrypoints/newtab/index.html`, `entrypoints/newtab/main.tsx`, `entrypoints/newtab/App.tsx` ("Hello Open TabTab")
- Create contracts: `src/domain/types.ts`, `src/messaging/protocol.ts`, `src/messaging/messaging.ts` (the `@webext-core/messaging` `defineExtensionMessaging<{ dispatchCommand(cmd: Command): CommandResult }>()` definition), `src/storage/keys.ts`, `src/storage/sync-state.ts`, `src/storage/settings.ts`
- Create: `src/domain/version.ts` (`nextVersion(current?: number): number`)
- Create fixture: `src/testing/sample-backup.ts` (imports/embeds the captured backup for tests + UI seeding)

#### 0.3 Dependencies

None. This blocks all other tasks.

- [x] **Step 1:** `pnpm dlx wxt@latest init open-tabtab --template react` (TypeScript is the default; there is no `react-ts` template) into a temp dir, then move its config into the repo root (or run init at root). Keep `raw/`, `spec/`, `plan/`, `AGENTS.md` untouched; they are reference-only and outside the WXT build. Confirm `entrypoints/` + `wxt.config.ts` live at repo root.
- [x] **Step 2:** Add deps: `pnpm add react react-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @webext-core/messaging`; dev deps: `pnpm add -D wxt @wxt-dev/module-react typescript vitest @testing-library/react @testing-library/user-event jsdom`.
- [x] **Step 3:** In `wxt.config.ts` set `manifest.permissions = ['storage','tabs','tabGroups']`, `manifest.host_permissions = ['https://api.github.com/*']` (add `https://gist.githubusercontent.com/*` only if Task 2 needs raw-content fallback), and configure the `newtab` entrypoint to override the new-tab page. Set `modules: ['@wxt-dev/module-react']`.
- [x] **Step 4:** Create `vitest.config.ts` importing `WxtVitest` from **`wxt/testing/vitest-plugin`** (`plugins: [WxtVitest()]`); it polyfills `browser` via `@webext-core/fake-browser` and sets up module resolution. Set `environment: 'jsdom'`. In tests, import `fakeBrowser` from **`wxt/testing/fake-browser`** and `fakeBrowser.reset()` in `beforeEach`.
- [x] **Step 5:** Author all §0 contract files verbatim from this plan (including `src/messaging/messaging.ts`). Implement `src/domain/version.ts`. Copy the captured JSON into `src/testing/sample-backup.ts` as a typed `TabTabBackup` constant.
- [x] **Step 6:** Add scripts to `package.json`: `dev` (`wxt`), `build` (`wxt build`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch` (`vitest`). Add a placeholder `src/domain/version.test.ts` proving monotonic bump.

#### 0.4 Verification

- Run: `pnpm typecheck` → passes (all contracts compile).
- Run: `pnpm test` → the version test passes: `nextVersion(5)===Math.max(Date.now(),6)`, and `nextVersion(Date.now()+10_000)===prev+1` (future-version case bumps by 1).
- Run: `pnpm build` → produces `.output/chrome-mv3/` with a `newtab` override in the generated manifest (`chrome_url_overrides.newtab`) and the 3 permissions.
- Run: `pnpm dev` → a Chromium launches; opening a new tab shows "Hello Open TabTab".

#### 0.5 Notes

- WXT storage keys use the `local:` prefix so `storage.getItem('local:workspace')` targets `chrome.storage.local`.
- Do not commit `.output/` or `.wxt/` (add to `.gitignore`).
- Keep every file < 400 lines and every function < 100 lines (repo convention); split modules if they grow.

---

## Phase 1 — Independent tracks (run concurrently after Task 0)

### Task 1: Domain model + pure operations + backup adapter

#### 1.1 Intent

Implement all workspace mutations as **pure functions** `(Workspace, args) => Workspace` (no `chrome.*`, no I/O, no version bump inside — the caller bumps), plus the TabTab import adapter, export serializer, and backup validation. This is the testable heart of the app.

#### 1.2 Files

- Create: `src/domain/operations.ts` (one exported pure fn per mutation; see list below)
- Create: `src/domain/backup.ts` (`parseBackup`, `serializeBackup`, `fromTabTab`, `bootstrapWorkspace`)
- Test: `src/domain/operations.test.ts`, `src/domain/backup.test.ts`

#### 1.3 Dependencies

Task 0 (types, version, sample fixture).

- [x] **Step 1:** Implement operations mirroring the command set: `createSpace`, `renameSpace`, `deleteSpace`, `reorderSpaces`, `createGroup`, `renameGroup`, `deleteGroup`, `reorderGroups`, `createSavedTab`, `editSavedTab`, `deleteSavedTab`, `reorderSavedTabs`, `moveSavedTab`, `saveBrowserTab`, `stashCurrentTabs`. Each returns a **new** `Workspace` (immutable update); generate ids with `crypto.randomUUID()`. `deleteSpace` removes both `spaces[id]` and its `spaceOrder` entry. `reorderSpaces` only reorders `spaceOrder`. `stashCurrentTabs` prepends/append a new group whose name is the caller-provided timestamp string.
- [x] **Step 2:** `bootstrapWorkspace()` → a `Workspace` with one `Default` space, empty `groups`, `spaceOrder:[defaultId]`, `version: nextVersion()`.
- [x] **Step 3:** `fromTabTab(backup)`: build `spaceOrder` from `space_list` ids (append any `spaces` id missing from `space_list`; skip `space_list` ids missing from `spaces`); carry `name`, `groups`, `pins` into internal spaces; keep root `version`. Must preserve `pins` and `file://` URLs.
- [x] **Step 4:** `parseBackup(input: unknown): { ok: true; workspace: Workspace } | { ok: false; error: string }` — the **shape-tolerant importer** (Backup Format Decision). Detect the shape: presence of `space_list` ⇒ TabTab shape ⇒ run `fromTabTab`; presence of `spaceOrder` ⇒ already-internal Open-TabTab shape ⇒ validate + use directly. Structural guards on both branches (`version:number`; spaces is an object; each tab has `url`+`title`). Return a helpful `error` string on non-conforming input. `serializeBackup(ws: Workspace): string` = `JSON.stringify(ws, null, 2)` (internal shape — what export/sync write). No `toTabTab`; TabTab is import-only.
- [x] **Step 5:** Write tests (below).

#### 1.4 Verification

- Run: `pnpm test src/domain` → all pass. Required cases:
  - CRUD + reorder for spaces, groups, tabs each produce expected shape and **do not mutate the input** (`Object.is` on input preserved).
  - `moveSavedTab` across groups removes from source, inserts at target index.
  - `parseBackup(sampleTabTab)` (TabTab shape) yields 2 spaces in `space_list` order (`二次元`, `Dev`), 7 and 2 groups respectively, `pins` preserved as `{}`.
  - **Round-trip idempotence:** `parseBackup(serializeBackup(ws))` deep-equals `ws` for a workspace parsed from the sample (order + names + tabs + pins + `file://` URLs intact) — proves our own export re-imports losslessly.
  - **Dual-shape import:** `parseBackup` accepts both the TabTab-shaped sample and an internal-shaped (`spaceOrder`) backup, and rejects `{}` / missing fields with `ok:false`.

#### 1.5 Notes

- Operations must **not** call `nextVersion` — the background handler bumps once per committed mutation (Task 5). This keeps operations pure and independently testable.
- `stashCurrentTabs` receives already-filtered tabs (pinned/own-tab exclusion happens in the UI/browser layer, Task 9); the domain just stores what it's given.

### Task 2: Storage repository + Gist client + sync reconciliation (pure)

#### 2.1 Intent

Provide the persistence abstraction over extension storage, a GitHub Gist REST client with injectable `fetch`, and the **pure** reconciliation decision function. No background wiring yet (that's Task 6).

#### 2.2 Files

- Create: `src/storage/repository.ts` (`StorageRepository`: get/set workspace, syncState, settings)
- Create: `src/sync/gist-client.ts` (`GistClient`)
- Create: `src/sync/reconcile.ts` (pure `decideReconcile(...)`)
- Test: `src/storage/repository.test.ts`, `src/sync/gist-client.test.ts`, `src/sync/reconcile.test.ts`

#### 2.3 Dependencies

Task 0 (keys, types, sync-state, settings).

- [x] **Step 1:** `StorageRepository` wraps WXT `storage` (`storage.getItem/setItem` with `STORAGE_KEYS`). Methods: `getWorkspace()/setWorkspace()`, `getSyncState()/setSyncState()`, `getSettings()/setSettings()`, each with sane defaults (`getSettings` defaults `{enabled:false, filename:'open-tabtab-backup.json'}`; `getSyncState` defaults `{status:'idle'}`).
- [x] **Step 2:** `GistClient` with injected `fetch`. Methods (note **`getGist` takes the configured `filename`** — Codex #2):
  - `validateToken(token)` → `GET /gists`, `200 ⇒ ok`.
  - `getGist(gistId, token, filename): Promise<RemoteBackupResult>` — reads `files[filename]`; if `truncated:true`, fetch `raw_url` (only then is the `gist.githubusercontent.com` host permission needed), then `parseBackup` the content. Return a **typed result** (Codex #3), never throw for expected states:

    ```ts
    export type RemoteBackupResult =
      | { kind: 'found'; workspace: Workspace; remoteVersion: number }
      | { kind: 'missing' }                       // gist 404, file absent, or empty content
      | { kind: 'invalid'; error: string }        // present but unparseable / failed validation
    ```

    Map: gist `404` **or** `files[filename]` absent **or** empty content ⇒ `missing`; `parseBackup` failure (bad JSON / bad shape) ⇒ `invalid`; otherwise `found` with `remoteVersion = workspace.version`.
  - `createGist(token, {filename, content, description, public:false})` → `gistId`.
  - `updateGist(gistId, token, filename, content)` → `PATCH`, creates the file if absent.
  - Send `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`. Never log the token.
- [x] **Step 3:** `decideReconcile({ syncState, remote }): 'noop'|'pushLocal'|'replaceLocal'|'conflict'` consuming **only `found | missing`** (the caller handles `invalid` → sync `error` before calling; Task 6). `localDirty = pendingVersion != null`; for `missing`, treat as remote-absent (`remoteMoved` false, nothing to replace); for `found`, `remoteMoved = remoteVersion !== lastSyncedVersion`. Table: dirty+moved⇒`conflict`; only-local (dirty, not moved) OR (dirty + missing)⇒`pushLocal`; only-remote (moved, not dirty)⇒`replaceLocal`; neither⇒`noop`.
- [x] **Step 4:** Write tests (below).

#### 2.4 Verification

- Run: `pnpm test src/storage src/sync` → all pass.
  - Repository: set→get round-trips through `fakeBrowser.storage`; defaults returned when unset. (`import { fakeBrowser } from 'wxt/testing/fake-browser'` and `fakeBrowser.reset()` in `beforeEach`.)
  - GistClient: with a mocked `fetch`, `createGist` POSTs `public:false` + correct filename/content; `updateGist` PATCHes; `getGist(...,filename)` returns `found` (parses content, follows `raw_url` when `truncated`), `missing` (404 / absent file / empty), and `invalid` (bad JSON) correctly; `validateToken` maps non-200 → `false`. Assert `Authorization` header present and token never appears in any thrown message.
  - `decideReconcile`: all four spec rows + the `missing`-remote cases, table-driven, over `found`/`missing` inputs.

#### 2.5 Notes

- Keep `GistClient` transport-only (no storage, no state) so it stays a pure REST wrapper testable with `fetch` mocks.
- `decideReconcile` is deterministic and side-effect free; Task 6 performs the resulting I/O.

### Task 3: Browser API wrappers (tabs + tabGroups)

#### 3.1 Intent

Thin, UI-agnostic wrappers over `chrome.tabs` / `chrome.tabGroups` / `chrome.tabs.group` so no component touches raw `chrome.*`. Includes the native tab-group restore.

#### 3.2 Files

- Create: `src/browser/tabs.ts` (`queryCurrentWindowTabs`, `openTab`, `openTabs`, `closeTabs`, `getSelfTabId`)
- Create: `src/browser/tab-groups.ts` (`openAsTabGroup`)
- Create: `src/browser/live-tabs.ts` (`subscribeToTabChanges(cb)` — wraps `onCreated/onRemoved/onUpdated/onMoved/onActivated`)
- Test: `src/browser/tabs.test.ts` (fakeBrowser-based where supported)

#### 3.3 Dependencies

Task 0 (types).

- [x] **Step 1:** `queryCurrentWindowTabs()` → `chrome.tabs.query({currentWindow:true})` mapped to `{ id, title, url, favIconUrl, pinned }[]`. `getSelfTabId()` resolves the extension's own new-tab id so it can be excluded from stash-close. **Caution:** with a `chrome_url_overrides.newtab` override, the workspace tab may report its URL as either the extension page URL (`chrome.runtime.getURL('newtab.html')`) **or** `chrome://newtab/` depending on how it was opened — match against **both** forms (and consider falling back to the tab that dispatched the stash, e.g. via `chrome.tabs.getCurrent()` in the page context). Verify in Brave during Phase 3.
- [x] **Step 2:** `openTab(url, {active})`, `openTabs(urls)` → `chrome.tabs.create`. `closeTabs(ids)` → `chrome.tabs.remove`.
- [x] **Step 3:** `openAsTabGroup(name, urls, color?)`: create tabs for each url (collect ids), `chrome.tabs.group({ tabIds })`, then `chrome.tabGroups.update(groupId, { title: name, color: color ?? 'blue' })`. Use a single fixed default color for MVP.
- [x] **Step 4:** `subscribeToTabChanges(cb)` registers the relevant `chrome.tabs` listeners and returns an unsubscribe. Debounce re-query so rapid events coalesce.
- [x] **Step 5:** Tests where `fakeBrowser` supports the API (tabs query/create/remove); document any API (`tabGroups`) that `fakeBrowser` cannot fake and defer to Phase 3 manual checks.

#### 3.4 Verification

- Run: `pnpm test src/browser` → tab query/open/close mapping tests pass against `fakeBrowser`.
- Manual (deferred to Phase 3): confirm `chrome.tabs.group` + `chrome.tabGroups.update` work in Brave (spec risk item).

#### 3.5 Notes

- These wrappers run in the new-tab page context (extension page ⇒ full `chrome.*` access). They are **not** routed through background.
- Keep pinned-tab / self-tab filtering **out** of these wrappers — callers (Task 9) decide policy; wrappers just expose data + primitives.

### Task 4: UI shell + components against the in-memory bus

#### 4.1 Intent

Build the full three-column React UI wired to a **local `InMemoryCommandBus`** (backed by Task 1 operations over a seeded workspace) so the entire interface is runnable and verifiable before the background worker exists. No real messaging, no `chrome.*` mutations yet.

#### 4.2 Files

- Create: `src/messaging/in-memory-bus.ts` (`InMemoryCommandBus implements CommandBus`, applies Task 1 operations + version bump + fake syncState in memory)
- Modify: `entrypoints/newtab/App.tsx` (replace the Task 0 stub with the layout + `CommandBus` React context/provider)
- Create: `entrypoints/newtab/components/SpacesSidebar.tsx`, `SpaceItem.tsx`
- Create: `entrypoints/newtab/components/WorkspaceView.tsx`, `GroupRow.tsx`, `SavedTabCard.tsx`, `GroupToolbar.tsx`, `SavedTabForm.tsx`
- Create: `entrypoints/newtab/components/CurrentTabsSidebar.tsx`, `CurrentTabItem.tsx`
- Create: `entrypoints/newtab/components/common/` (`ConfirmDialog.tsx`, `InlineEditable.tsx`)
- Create: `entrypoints/newtab/hooks/useSnapshot.ts` (subscribe to bus; expose `workspace`, `syncState`, `dispatch`), `hooks/useSelectedSpace.ts` (selection is UI-local, persisted to `chrome.storage.local` under a UI key)
- Create: `entrypoints/newtab/styles/*` (single default theme; match screenshot density)
- Test: `entrypoints/newtab/components/*.test.tsx` (Testing Library) for the highest-value components

#### 4.3 Dependencies

Task 1 (operations, used by the in-memory bus) + Task 0 contracts. Can start UI scaffolding immediately against contracts and stub the bus, then swap in real operations when Task 1 lands.

- [x] **Step 1:** `InMemoryCommandBus`: holds a `Workspace` (seeded from `sample-backup` via `fromTabTab`), applies the matching Task 1 operation per `Command`, bumps version, updates a fake `SyncState`, and notifies `subscribe` listeners. Returns `{ok:true, snapshot}`.
- [x] **Step 2:** Layout: CSS grid three columns matching the screenshots (left ~240px, center flex, right ~300px, each independently scrollable). Provide `CommandBus` + snapshot via context.
- [x] **Step 3:** SpacesSidebar: list from `workspace.spaceOrder`; `+` dispatches `createSpace`; per-item `...` menu → rename/delete (delete opens `ConfirmDialog`); click selects (UI state). Show a drag handle on hover (DnD behavior lands in Task 8; here just render the handle).
- [x] **Step 4:** WorkspaceView: header with selected space name (`InlineEditable` → `renameSpace`), `+ Add collection` (`createGroup`). Each `GroupRow`: name (`InlineEditable` → `renameGroup`), collapse chevron, hover actions (open / open-as-group / delete), a group-level **`+ add tab`** control, and a grid of `SavedTabCard`. `SavedTabForm` (shared add/edit form: URL + title fields): `+ add tab` opens it in create mode → `createSavedTab`; a card's `...` → edit opens it prefilled → `editSavedTab`. This is the owning UI for the spec's "Create a saved tab manually with URL and title" requirement. `SavedTabCard`: favicon + title, `...` menu → edit/delete; click = open (wired in Task 9). Add "empty-state" actions when a space has no groups (add group / import backup) per spec.
- [x] **Step 5:** CurrentTabsSidebar: renders from a prop `tabs` (in Phase 1, feed seeded/mock tabs; Task 9 replaces with `live-tabs`). Search box filters by title/url. `Tabs (N)` count, sort toggle, and save-all button (wired in Task 9).
- [x] **Step 6:** Component tests for `SpacesSidebar` (create/rename/delete dispatch the right command), `GroupRow` (rename/delete, and `+ add tab` opens `SavedTabForm`), `SavedTabForm` (submit in create mode dispatches `createSavedTab` with `{spaceId, groupId, title, url}`), and `SavedTabCard` (edit/delete), asserting the `CommandBus.dispatch` mock is called with correct payloads.

#### 4.4 Verification

- Run: `pnpm test entrypoints/newtab` → component tests pass.
- Run: `pnpm dev` → new-tab shows the three columns seeded with the sample backup (二次元 / Dev spaces, their groups and cards visible; right column shows mock tabs). Creating/renaming/deleting spaces, groups, and tabs updates the UI live (via in-memory bus). This satisfies "first screen is the workspace" + "usable with sync disabled".

#### 4.5 Notes

- Keep components presentational; all writes go through `dispatch`. This is exactly what makes the Phase-2 swap to `RuntimeCommandBus` a one-line provider change.
- Selection persistence key (e.g. `local:ui.selectedSpaceId`) is UI-only and separate from workspace/sync/settings.
- Match the reference density (compact cards, 4–5 card columns) but do not build theming/i18n (out of scope).

---

## Phase 2 — Integration

### Task 5: Background command handler (mutation owner)

#### 5.1 Intent

Make the background service worker the sole workspace writer: receive `Command`s (over the typed `@webext-core/messaging` channel), load current workspace, apply the Task 1 operation, bump version **once**, persist, update sync state per the sync-enablement rule, and enqueue a push when configured. State reaches the UI via storage (each page's `storage.watch`), **not** a broadcast message. Sync push enqueue is a hook filled by Task 6.

#### 5.2 Files

- Create: `src/background/handler.ts` (`handleCommand(cmd, deps): Promise<CommandResult>`)
- Modify: `entrypoints/background.ts` (register the `@webext-core/messaging` `onMessage('dispatchCommand', …)` handler → `handleCommand`)
- Test: `src/background/handler.test.ts`

#### 5.3 Dependencies

Task 1 (operations), Task 2 (repository). Sync deps (Task 6) injected via a `SyncEngine` interface stubbed here.

- [x] **Step 1:** `handleCommand`: `switch(cmd.type)` → map to the Task 1 operation; for mutation commands: load workspace, apply op, `version = nextVersion(current.version)`, `setWorkspace`, then update `syncState` per the **sync-enablement rule (Codex #4)** and enqueue accordingly:
  - `settings.enabled === false` → leave `syncState` clean: `status='idle'`, **no** `pendingVersion`; do **not** enqueue.
  - `enabled` but not configured (no `token` or `gistId`) → `status='dirty'`, `pendingVersion=version`; do **not** enqueue (nothing to push to yet).
  - `enabled` and configured → `status='dirty'`, `pendingVersion=version`, `syncEngine.enqueuePush()` (no-op stub until Task 6).

  Return `{ok:true, snapshot}`.
- [x] **Step 2:** `getState` returns the current snapshot (bootstrapping the workspace via `bootstrapWorkspace()` on first run, leaving syncState clean — see §0 invariant). `importBackup` validates via `parseBackup`, replaces the whole workspace, bumps version, applies the same sync-enablement rule as Step 1. Sync/settings commands (`reconcile`, `setGistSettings` (merge the `GistSettingsPatch` — preserve token unless `clearToken`), `testConnection`, `createGist`, `pullNow`, `pushNow`, `resolveConflict`) delegate to `SyncEngine` (Task 6).
- [x] **Step 3:** In `entrypoints/background.ts`, register the typed `onMessage('dispatchCommand', ({data}) => handleCommand(data, deps))`. No snapshot broadcast — persistence + each page's `storage.watch` (Task 7) keeps multiple new-tab pages consistent.
- [x] **Step 4:** Wrap all handling in try/catch → `{ok:false, error}` (never throw across the message boundary). Never log tokens.

#### 5.4 Verification

- Run: `pnpm test src/background` → with `fakeBrowser` storage + a stub `SyncEngine`:
  - With sync **enabled+configured** settings seeded: dispatching `createSpace` persists a workspace whose `version` strictly increased and whose `syncState.pendingVersion===version`; `enqueuePush` called exactly once. Rapid dispatch of N commands bumps version monotonically N times (once each).
  - With sync **disabled**: the same dispatch persists the workspace + bumped version but leaves `syncState.status==='idle'` with **no** `pendingVersion`, and `enqueuePush` is **not** called (Codex #4).
- Run: `pnpm build` → background bundles without error.

#### 5.5 Notes

- Version is bumped here and **only** here (operations stay pure). Exactly one bump per committed mutation is a spec-required invariant and is directly asserted.

### Task 6: Sync engine + serial push queue + reconciliation

#### 6.1 Intent

Implement best-effort, local-first sync: a serial queue that pushes the newest snapshot, startup/pull reconciliation using `decideReconcile`, failure handling that never blocks local saves, and conflict surfacing.

#### 6.2 Files

- Create: `src/sync/queue.ts` (`SerialPushQueue`)
- Create: `src/background/sync-engine.ts` (`SyncEngine`: `enqueuePush`, `reconcile`, `pull`, `push`, `setSettings`, `testConnection`, `createGist`, `resolveConflict`)
- Modify: `entrypoints/background.ts` (construct the real `SyncEngine` from `GistClient` + `StorageRepository` and inject it into `handleCommand`, replacing Task 5's no-op stub — this is the integration point that wires sync into the mutation path)
- Test: `src/sync/queue.test.ts`, `src/background/sync-engine.test.ts`

#### 6.3 Dependencies

Task 2 (gist-client, reconcile, repository), Task 5 (handler injects the engine).

- [x] **Step 1:** `SerialPushQueue`: at most one in-flight push; if `enqueuePush` is called while running, set a `dirty` flag; when the current push finishes, if `dirty`, run again reading the **latest** workspace snapshot from storage (coalesces rapid mutations into one trailing push). Expose a promise-free fire-and-forget `enqueue()`.
- [x] **Step 2:** `push()`: read workspace + settings; if `!enabled || !token || !gistId` → skip (stay dirty). Serialize `serializeBackup(workspace)` → JSON (internal shape — Backup Format Decision), `updateGist`. On success: `lastSyncedVersion = workspace.version`, clear `pendingVersion`, `status='idle'`. On failure: `status='error'`, keep `pendingVersion`, record `lastError` (sanitized), do **not** throw. Set `status='syncing'` while in flight.
- [x] **Step 3:** `reconcile()` (startup + on `reconcile` command): if sync not configured → noop. Else `getGist(gistId, token, filename)` → `RemoteBackupResult`; **handle `invalid` first** → set `status='error'` + `lastError`, stop (never treat unparseable remote as a conflict — Codex #3). For `found`/`missing`, call `decideReconcile` and execute: `pushLocal`→enqueue push; `replaceLocal`→overwrite workspace with `result.workspace`, set `lastSyncedVersion=result.remoteVersion`, clear pending, `status='idle'`; `conflict`→`status='conflict'` (persist a snapshot ref so the UI can act); `noop`→nothing.
- [x] **Step 4:** `setSettings` (merge `GistSettingsPatch`; `clearToken` removes the PAT, omitted `token` preserves it — Codex #9), `createGist` (creates a private gist, stores returned `gistId`, seeds it with `serializeBackup(current workspace)`), `testConnection` (`validateToken` + optional `getGist`). **Conflict resolution (Codex #5):**
  - `resolveConflict('useLocal')` = a synchronous manual push: call `push()` and mark clean **only after** `updateGist` succeeds; on push failure **stay `conflict`** (do not silently clear it).
  - `resolveConflict('useRemote')` = **refetch** remote at click time (`getGist`), and on `found` replace local with `result.workspace` + mark clean (`lastSyncedVersion=remoteVersion`, clear pending) **without** pushing back (spec requirement); on `missing`/`invalid`/network failure → `status='error'` + `lastError`, stay unresolved.
- [x] **Step 5:** Persist enough of `SyncState` to storage that a cold-started worker recovers `dirty`/`conflict` and can retry (MV3 workers can be evicted — spec risk).

#### 6.4 Verification

- Run: `pnpm test src/sync src/background/sync-engine.test.ts` → required cases:
  - **Local save succeeds when push fails:** stub `updateGist` to reject → workspace still saved (Task 5 path), `status` becomes `error`/`dirty`, `pendingVersion` retained, no throw.
  - **Serial queue coalescing:** fire 5 `enqueuePush` during one slow push → exactly one trailing push runs afterward and it carries the newest version.
  - **Reconcile matrix:** clean/unchanged→noop; dirty/unchanged→push; clean/moved→replaceLocal (workspace equals remote, `lastSyncedVersion=remoteVersion`); dirty/moved→`conflict` (no overwrite of either side); **remote `invalid`→`status='error'`, never conflict**.
  - **`resolveConflict('useLocal')`** marks clean only after a successful `updateGist`; on stubbed push failure it stays `conflict`.
  - **`resolveConflict('useRemote')`** refetches remote, replaces local, and does **not** enqueue a push.

#### 6.5 Notes

- The queue is the **only** writer path to Gist; nothing else calls `updateGist` directly.
- The synced JSON is `serializeBackup(workspace)` (internal `Workspace` shape) only — it must never include token or `GistSettings`/`SyncState` (spec: "must not include the PAT or local sync settings").
- First-configure-with-existing-remote is handled naturally: bootstrap left sync clean, so `clean/moved → replaceLocal`. If the user made real edits first (pending set), it becomes `conflict` — safe. Document this in the settings UI copy (Task 10).

### Task 7: Runtime command bus + UI wiring

#### 7.1 Intent

Replace the in-memory bus with a `RuntimeCommandBus` that messages the background worker, so the real UI drives real persisted state and sync.

#### 7.2 Files

- Create: `src/messaging/runtime-bus.ts` (`RuntimeCommandBus implements CommandBus`: `dispatch` via the typed `@webext-core/messaging` `sendMessage('dispatchCommand', cmd)`; `subscribe` via WXT `storage.watch`)
- Modify: `entrypoints/newtab/App.tsx` (provide `RuntimeCommandBus` instead of in-memory)
- Test: `src/messaging/runtime-bus.test.ts`

#### 7.3 Dependencies

Task 4 (UI + bus interface), Task 5 (handler answering messages).

- [ ] **Step 1:** `RuntimeCommandBus.dispatch(cmd)` → `sendMessage('dispatchCommand', cmd)` returning `CommandResult`. `subscribe(listener)` registers `storage.watch` on `local:workspace`, `local:syncState`, and `local:settings`; on any change it re-reads all three, builds a fresh `Snapshot` (deriving `PublicGistSettings` so the token never reaches the UI), and calls `listener`. On mount, `dispatch({type:'getState'})` once to hydrate.
- [ ] **Step 2:** Swap the provider in `App.tsx`. On app startup, `dispatch({type:'reconcile'})` (spec: reconcile on new-tab startup if sync configured).
- [ ] **Step 3:** Verify multi-page consistency: two open new-tab pages both reflect a mutation made in one (driven by `storage.watch`, not a broadcast message).

#### 7.4 Verification

- Run: `pnpm test src/messaging` → runtime bus maps `dispatch`↔`sendMessage('dispatchCommand', …)`; and a `storage.setItem` on a watched key drives `subscribe` listeners with a snapshot whose settings expose `hasToken` but not `token` (fakeBrowser storage + messaging).
- Run: `pnpm dev` → all Task-4 UI actions now persist across reloads (state survives new-tab reopen). Open two new-tab pages; a change in one appears in the other via `storage.watch`.

#### 7.5 Notes

- Keep the `CommandBus` interface identical; only the implementation swaps. If a component needed changes to swap buses, the abstraction leaked — fix the component, not the interface.

### Task 8: Drag-and-drop interactions

#### 8.1 Intent

Wire `dnd-kit` so every spec-required drag produces exactly one mutation on drop, with no writes during hover/move.

#### 8.2 Files

- Modify: `entrypoints/newtab/App.tsx` (top-level `DndContext` + `onDragEnd`), `SpacesSidebar.tsx`, `WorkspaceView.tsx`, `GroupRow.tsx`, `SavedTabCard.tsx`, `CurrentTabsSidebar.tsx`
- Create: `entrypoints/newtab/dnd/dnd-config.ts` (sensors, collision, id encoding helpers), `entrypoints/newtab/dnd/on-drag-end.ts` (pure mapping: drag result → `Command`)
- Test: `entrypoints/newtab/dnd/on-drag-end.test.ts`

#### 8.3 Dependencies

Task 7 (dispatch reaches background).

- [ ] **Step 1:** Encode draggable ids with a type prefix (`space:<id>`, `group:<spaceId>:<id>`, `tab:<spaceId>:<groupId>:<id>`, `browserTab:<tabId>`) and droppable targets similarly, so `onDragEnd` can decode source/target unambiguously. **For browser-tab draggables, attach the tab payload to dnd-kit's `data`** via `useDraggable({ id, data: { kind:'browserTab', tab: { title, url, favIconUrl } } })` so the drop has everything `saveBrowserTab` needs (Codex #8) — an id alone is insufficient.
- [ ] **Step 2:** `SortableContext` for spaces, for groups within a space, and for tabs within each group. Make groups valid drop targets for tabs (cross-group move) and for `browserTab:*` (save).
- [ ] **Step 3:** `mapDragEndToCommand(active, over)` (pure): reads decoded ids **and** `active.data.current` (the browser-tab payload). reorder spaces→`reorderSpaces`; reorder groups→`reorderGroups`; reorder tabs same group→`reorderSavedTabs`; tab to different group→`moveSavedTab`; `browserTab` onto group→`saveBrowserTab` built from `active.data.current.tab`. Returns `null` for no-op drops. Signature: `mapDragEndToCommand(active: { id: string; data?: { current?: unknown } }, over: { id: string } | null)` — pure, DOM-free, so a browser tab drag is testable by passing a fake `active.data.current`.
- [ ] **Step 4:** `onDragEnd` dispatches the mapped command (one per drop). Ensure no `dispatch` fires during `onDragOver`/move.

#### 8.4 Verification

- Run: `pnpm test entrypoints/newtab/dnd` → `mapDragEndToCommand` returns the correct command for each of the 5 drag scenarios (including a `browserTab` drop that produces a valid `saveBrowserTab` from `active.data.current.tab`) and `null` for drops onto the same slot.
- Run: `pnpm dev` → manually perform each drag: reorder spaces, reorder groups, reorder tabs, move a tab across groups, drag a right-sidebar browser tab onto a group. Each results in exactly one persisted mutation (verify version increments by 1 per drop; hovering does not change version).

#### 8.5 Notes

- Keep `mapDragEndToCommand` pure and separate from React so the mutation-per-drop guarantee is unit-tested without a DOM.

### Task 9: Browser actions in the UI (open / restore / stash)

#### 9.1 Intent

Wire the real browser behaviors: live current-tabs list, open saved tab/group, native tab-group restore, one-click stash-all, and Alt-click open-and-delete.

#### 9.2 Files

- Modify: `CurrentTabsSidebar.tsx` (use `live-tabs` subscription), `SavedTabCard.tsx` + `GroupRow.tsx` (open handlers), `GroupToolbar.tsx` (open-as-group)
- Create: `entrypoints/newtab/hooks/useLiveTabs.ts` (wraps `src/browser/live-tabs`), `entrypoints/newtab/actions/stash.ts`, `entrypoints/newtab/actions/open.ts`
- Test: `entrypoints/newtab/actions/stash.test.ts`

#### 9.3 Dependencies

Task 3 (browser wrappers), Task 7 (dispatch), **Task 8 (must land first)** — Task 8 and this task both modify `CurrentTabsSidebar.tsx`, `SavedTabCard.tsx`, and `GroupRow.tsx`, so run them serially (8 → 9), not concurrently.

- [ ] **Step 1:** `useLiveTabs()` subscribes via `subscribeToTabChanges` → keeps the right sidebar in sync with the real window. Replace the Task-4 mock tab source.
- [ ] **Step 2:** Open a saved tab: click → `openTab(url)`; Ctrl/Cmd-click → open in background (browser default); Alt-click → `openTab` **then** dispatch `deleteSavedTab` (open-and-delete). Open a group: `openTabs(urls)`; Alt-click → open then `deleteGroup`.
- [ ] **Step 3:** Open-as-group: `openAsTabGroup(group.name, urls)` (Task 3). Do not delete the saved group unless Alt-click open-and-delete was used.
- [ ] **Step 4:** Stash-all: `buildStashPlan(liveTabs, selfTabId)` (pure) → filters out pinned + the extension's own new-tab, builds a timestamp group name + tab payloads; dispatch `stashCurrentTabs`; **await ok**; then `closeTabs(idsToClose)`. Order matters: close only **after** local save succeeds (spec).
- [ ] **Step 5:** Tests for `buildStashPlan` (pinned + self excluded; timestamp name; payload shape).

#### 9.4 Verification

- Run: `pnpm test entrypoints/newtab/actions` → `buildStashPlan` excludes pinned + self, names the group by timestamp.
- Run: `pnpm dev` (manual): right sidebar mirrors real tabs; clicking a card opens it; Alt-click opens + removes the card; open-as-group creates a native group; stash-all saves a timestamped group and closes only non-pinned, non-self tabs after save.

#### 9.5 Notes

- The stash close-after-save ordering is the single most important correctness point here; keep `dispatch → await ok → closeTabs` explicit and never reorder.

### Task 10: Settings page + sync UI + conflict resolution

#### 10.1 Intent

Give the user manual control of PAT/Gist config and recovery, and surface sync status/conflicts, all via the existing sync commands.

#### 10.2 Files

- Create: `entrypoints/newtab/components/settings/SettingsPanel.tsx`, `GistConfigForm.tsx`, `SyncStatusBar.tsx`, `ConflictBanner.tsx`, `BackupImportExport.tsx`
- Create: `entrypoints/newtab/hooks/useSettings.ts`
- Modify: `App.tsx` / left sidebar footer (open Settings)
- Test: (mostly manual; add a component test for `ConflictBanner` action dispatch)

#### 10.3 Dependencies

Task 2 + Task 6 (sync engine behind commands), Task 7 (dispatch).

- [ ] **Step 1:** `GistConfigForm`: PAT input (masked, never rendered back from storage — show `hasToken`; a separate "Clear token" control sends `{clearToken:true}`), enable toggle, filename (default `open-tabtab-backup.json`), "Paste existing Gist ID" **or** "Create new private Gist" (`createGist`), "Test connection" (`testConnection`). Persist via `setGistSettings` sending a **`GistSettingsPatch`** — changing `enabled`/`gistId`/`filename` omits `token`, so the stored PAT is preserved (Codex #9); only typing a new PAT sends `token`.
- [ ] **Step 2:** `SyncStatusBar`: show current local version, last synced version, status, last error (from snapshot). Buttons: "Pull Gist to local" (`pullNow`), "Push local to Gist" (`pushNow`).
- [ ] **Step 3:** `BackupImportExport`: "Export local backup" (`serializeBackup(workspace)` → download the internal-shape JSON), "Import backup file" (read file → `importBackup`; the background `parseBackup` accepts **both** TabTab-shaped and Open-TabTab-shaped files, replaces the whole workspace, bumps version, enqueues push if enabled; **no merge**).
- [ ] **Step 4:** `ConflictBanner` (shown when `syncState.status==='conflict'`): actions "Replace remote with local" (`resolveConflict:useLocal`), "Replace local with remote" (`resolveConflict:useRemote`), plus export/import escape hatches. Explain the divergence in copy.
- [ ] **Step 5:** Ensure the token is never displayed or logged; the UI reads `PublicGistSettings.hasToken` only.

#### 10.4 Verification

- Run: `pnpm dev` (manual): configure a real PAT + create/paste a Gist; make a mutation → observe automatic push (status → idle, lastSyncedVersion updates). Toggle `enabled` off/on and confirm the stored PAT survives (Codex #9). Disable network or use a bad token → local save still succeeds, status → error/dirty, and a later "Push local to Gist" recovers. Export produces a valid internal-shape file; importing it (and importing the captured TabTab-shaped file) restores the workspace. Force a conflict (edit gist externally + make a local edit) → `ConflictBanner` appears and both resolutions behave per spec.
- Run: `pnpm test` (whole suite green) + `pnpm typecheck` + `pnpm build`.

#### 10.5 Notes

- Settings can be a modal/overlay inside the new-tab page (no separate options page required for MVP).

---

## Phase 3 — Manual validation in Brave

### Task 11: Brave end-to-end acceptance

#### 11.1 Intent

Run the spec's "Browser manual tests in Brave" checklist against a real Brave profile to confirm extension-level behavior that can't be unit-tested.

#### 11.2 Files

- Create: `docs/manual-test-checklist.md` (record pass/fail + Brave/OS versions)

#### 11.3 Dependencies

All prior tasks.

- [ ] **Step 1:** `pnpm build`; load `.output/chrome-mv3` as an unpacked extension in Brave (`brave://extensions`, Developer mode). Confirm it takes over the new-tab page and the workspace is the first screen.
- [ ] **Step 2:** Current-tabs sidebar reflects real open tabs (open/close some and watch it update).
- [ ] **Step 3:** Drag a real browser tab into a group → saved as a card.
- [ ] **Step 4:** Stash-all → timestamped group created; non-pinned/non-self tabs close **only after** save; pinned + the workspace tab survive.
- [ ] **Step 5:** Open one saved tab; open a group as a native Brave tab group and confirm the group title is set (validates `chrome.tabs.group` + `chrome.tabGroups.update` in Brave — spec risk item).
- [ ] **Step 6:** Configure PAT + Gist; make a mutation and confirm the automatic push; then disable network / use a bad token and confirm local save still succeeds and status goes dirty/error.
- [ ] **Step 7:** Import the captured `tabtab_backup_20260701_1437.json` and confirm spaces/groups/tabs render correctly (二次元: 7 groups, Dev: 2 groups).

#### 11.4 Verification

- Every checklist item recorded pass in `docs/manual-test-checklist.md`. Any failure is filed against the owning task and fixed before sign-off.

#### 11.5 Notes

- If Brave blocks `file://` opening, note it (spec-acknowledged limitation) rather than treating it as a bug.

---

## Cross-Cutting Conventions (apply to every task)

- **Language/tooling:** TypeScript strict; React function components + hooks; `pnpm` only; 2-space indent; files < 400 lines, functions < 100 lines; document exported functions/classes.
- **Purity boundary:** `src/domain/*` and `src/sync/reconcile.ts` import no `chrome.*`. All browser access lives in `src/browser/*`, `src/storage/*`, `src/background/*`, and the runtime bus.
- **Transport:** commands use the typed `@webext-core/messaging` channel (`src/messaging/messaging.ts`); UI state observation uses WXT `storage.watch` — never a hand-rolled `runtime.sendMessage` broadcast or a `command`/`snapshot` envelope.
- **Backup format:** export + Gist sync serialize the internal `Workspace` shape (`serializeBackup`); `parseBackup` imports both TabTab-shaped and internal-shaped files; `toTabTab` is not implemented (out of scope).
- **Security:** the PAT lives only in `chrome.storage.local`, is never logged, never sent to the UI, and never written into the synced backup file. `setGistSettings` is a patch so UI edits can't clobber the stored token.
- **Single writer:** only the background worker mutates workspace storage and only the sync queue writes to Gist.
- **Testing:** every pure module ships Vitest tests; browser-touching modules use `fakeBrowser` from `wxt/testing/fake-browser` (reset in `beforeEach`) where the API is faked, otherwise they are covered by the Phase-3 manual checklist.
- **Definition of done per task:** its listed `Verification` passes **and** `pnpm typecheck` + `pnpm build` still pass.

---

## References
<!-- list of references, such as files, urls, or other resources -->

| Resouce | Description | Other Notes if any |
| --- | --- | --- |
| [spec/spec-tabtab-extension-mvp-20260701.md](../spec/spec-tabtab-extension-mvp-20260701.md) | The approved design spec; authoritative source of truth for all requirements, data/sync models, and validation. | Must Read |
| [raw/screenshots/tabtab_backup_20260701_1437.json](../raw/screenshots/tabtab_backup_20260701_1437.json) | Real TabTab backup export; the import-compatibility baseline and the test/UI seed fixture. | Must Read |
| ![raw/screenshots/Screenshot 2026-07-01 143622.png](../raw/screenshots/Screenshot%202026-07-01%20143622.png) | Three-column UI (spaces / grouped cards / current tabs) — layout, toolbar, and card density reference. | Must Read |
| ![raw/screenshots/Screenshot 2026-07-01 143640.png](../raw/screenshots/Screenshot%202026-07-01%20143640.png) | Dev space view — group row + card grid density reference. | Important |
| [raw/tabtab-docs/pages/usage/basic.md](../raw/tabtab-docs/pages/usage/basic.md) | TabTab usage: three-column layout, space/group management, drag-to-save, one-click stash (pinned tabs excluded). | Must Read |
| [raw/tabtab-docs/pages/usage/sync.md](../raw/tabtab-docs/pages/usage/sync.md) | TabTab sync: version bumping on save/delete/reorder, manual backup, Gist PAT (gist scope only), auto-sync timing. | Must Read |
| [raw/tabtab-docs/pages/advance/open_mode.md](../raw/tabtab-docs/pages/advance/open_mode.md) | Open modes (newtab/redirect) + Ctrl-click / Alt-click(open-and-delete) semantics for cards and groups. | Important |
| [raw/tabtab-docs/pages/advance/settings.md](../raw/tabtab-docs/pages/advance/settings.md) | TabTab settings list; useful to confirm MVP exclusions (language/theme/pinned-in-sidebar/etc.). | Important |
| [raw/tabtab-docs/pages/changelog/latest.md](../raw/tabtab-docs/pages/changelog/latest.md) | Changelog showing out-of-scope later features (Toby import, sharing, Zen, tab-group display). | Important |
| [Chrome tabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) | Native tab-group title/color update used by `openAsTabGroup` (Task 3). | Must Read |
| [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) | Query/create/remove/group browser tabs (Tasks 3, 9). | Must Read |
| [Chrome override pages docs](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages) | New-tab override mechanics (`chrome_url_overrides.newtab`) for Task 0. | Must Read |
| [GitHub Gists REST API](https://docs.github.com/en/rest/gists/gists) | Create/read/update private Gist + file content + truncation/`raw_url` (Task 2). | Must Read |
| [WXT entrypoints docs](https://wxt.dev/guide/essentials/entrypoints.html) | `newtab` + `background` entrypoints (Tasks 0, 5). | Important |
| [WXT manifest config docs](https://wxt.dev/guide/essentials/config/manifest) | Configuring permissions/host_permissions in `wxt.config.ts` (Task 0). | Important |
| [WXT unit-testing docs](https://wxt.dev/guide/essentials/unit-testing.html) | `WxtVitest` from `wxt/testing/vitest-plugin` + `fakeBrowser` from `wxt/testing/fake-browser` (Tasks 0, 2, 3, 5, 7). | Important |
| [WXT installation docs](https://wxt.dev/guide/installation.html) | Correct `wxt init --template react` bootstrap (TS default) for Task 0. | Important |
| [WXT storage docs](https://wxt.dev/storage.html) | `storage.getItem/setItem` + `storage.watch` used by the repository and the runtime bus's state observation (Tasks 2, 7). | Important |
| [@webext-core/messaging docs](https://webext-core.aklinker1.io/messaging/) | Typed `defineExtensionMessaging` request/response for the command channel (Tasks 0, 5, 7). | Important |
| [Chrome messaging docs](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) | Background async-response semantics (`sendResponse` + `return true`) the messaging lib abstracts (Codex #7 reference). | |
| [dnd-kit docs](https://docs.dndkit.com/) | Sortable/DnD primitives + attaching payload via `useDraggable({ data })` for browser-tab-to-group drop (Task 8). | Important |

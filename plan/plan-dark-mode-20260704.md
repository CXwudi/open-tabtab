# Dark Mode Implementation Plan

> **For agentic workers:** Use the harness's preferred task-tracking and
> delegation tools when available. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Add light, dark, and system-following theme support to the Open TabTab
new-tab UI, including live updates when the OS color scheme changes.

**Source of Truth:** User request on July 4, 2026, original TabTab screenshots
under `raw/screenshots/`, and the current repo architecture in `DEVELOPERS.md`.

**Scope:** Includes persisted theme preference, runtime theme resolution,
settings UI, CSS token overrides, tests, and manual verification. Excludes a
Tailwind/daisyUI migration, a full options-page clone, Zen Mode theming, and a
broad rename of the existing `GistSettings`/`setGistSettings` contracts.

**Approach:** Keep the current CSS-variable architecture and add a `themeMode`
setting with default `system`. Resolve `system` in the new-tab React UI with
`matchMedia('(prefers-color-scheme: dark)')`, write the resolved theme to
`document.documentElement.dataset.theme`, and let CSS token overrides repaint the
app. Persisting the theme through the existing settings storage keeps multiple
new-tab pages in sync through the current `storage.watch` snapshot flow.

**Verification:** Run focused unit/component tests for settings persistence,
settings patching, snapshot redaction/defaults, theme resolution, settings UI,
then run `pnpm typecheck`. Manually verify Light, Dark, and System modes in the
extension, including live OS color-scheme changes while `System` is selected.

---

## Current Context

- The project already rejected a Tailwind v4/daisyUI migration for this work.
- Current theme values live in CSS variables in
  `entrypoints/newtab/styles/theme.css`.
- Current persisted settings use one storage key, `local:settings`, and are
  read into every `Snapshot`.
- The current settings type and command names are Gist-specific. This plan keeps
  those names to minimize implementation churn, but adds `themeMode` to that
  settings object.
- Theme changes must not mutate workspace data, bump workspace version, mark
  sync dirty, or enqueue Gist sync.

## File Impact Map

| Area | Expected Change |
| --- | --- |
| `src/storage/settings.ts` | Add `ThemeMode` and `themeMode` field. |
| `src/storage/repository.ts` | Add `themeMode: 'system'` to settings defaults. |
| `src/messaging/protocol.ts` | Allow theme updates in `GistSettingsPatch`. |
| `src/background/sync-engine.ts` | Merge `themeMode` without touching token logic. |
| `src/background/handler.ts` | No new workspace mutation; confirm settings path only. |
| `src/messaging/runtime-bus.ts` | Add theme default to redacted snapshots. |
| `src/messaging/in-memory-bus.ts` | Mirror the new setting for standalone UI/dev tests. |
| `entrypoints/newtab/hooks/useThemeMode.ts` | New hook for theme resolution and live system updates. |
| `entrypoints/newtab/App.tsx` | Call theme hook from the workspace root. |
| `entrypoints/newtab/components/settings/AppearanceSettings.tsx` | New compact settings section for theme choice. |
| `entrypoints/newtab/components/settings/SettingsPanel.tsx` | Render Appearance before sync/backup controls. |
| `entrypoints/newtab/styles/theme.css` | Add dark token overrides. |
| `entrypoints/newtab/styles/components.css` | Add or reuse select/segmented-control styles if needed. |
| Tests | Add/update focused tests listed in each task. |

## Task Steps

### Task 1: Extend Settings Contract

#### 1.1 Intent

Persist a theme preference without changing workspace data or sync behavior.
Existing users with no stored theme value should default to `system`.

#### 1.2 Files

- Modify: `src/storage/settings.ts`
- Modify: `src/storage/repository.ts`
- Modify: `src/messaging/protocol.ts`
- Modify: `src/background/sync-engine.ts`
- Modify: `src/messaging/runtime-bus.ts`
- Modify: `src/messaging/in-memory-bus.ts`
- Test: `src/storage/repository.test.ts`
- Test: `src/background/sync-engine.test.ts`
- Test: `src/messaging/runtime-bus.test.ts`

#### 1.3 Dependencies

None.

- [ ] **Step 1:** Add `export type ThemeMode = 'system' | 'light' | 'dark';`
  in `src/storage/settings.ts`.
- [ ] **Step 2:** Add `themeMode: ThemeMode` to `GistSettings`.
- [ ] **Step 3:** Add `themeMode: 'system'` to `DEFAULT_SETTINGS` in
  `StorageRepository` and `RuntimeCommandBus`.
- [ ] **Step 4:** Add `themeMode?: ThemeMode` to `GistSettingsPatch`.
- [ ] **Step 5:** Update `mergeSettings()` in `SyncEngine` so theme-only
  patches preserve `enabled`, `token`, `gistId`, and `filename`.
- [ ] **Step 6:** Update `InMemoryCommandBus` default settings and patch
  handling so local UI development behaves like runtime mode.
- [ ] **Step 7:** Keep the command name `setGistSettings` for this feature.
  Do not add a new storage key or rename settings contracts in this change.

#### 1.4 Verification

- Run:
  `pnpm vitest run src/storage/repository.test.ts src/background/sync-engine.test.ts src/messaging/runtime-bus.test.ts`
- Expect:
  - Repository defaults include `themeMode: 'system'`.
  - Stored settings round-trip with a non-default theme.
  - Theme-only settings patches preserve the PAT and Gist fields.
  - Runtime snapshots expose `themeMode` and still redact `token`.
  - Theme-only patches do not write workspace data or sync state.

#### 1.5 Notes

- The existing name `GistSettings` is no longer perfectly accurate after this
  task. Keep the rename out of scope unless the implementer and reviewer agree
  the local churn is worth it.
- Do not include settings in exported or synced workspace backup JSON.

### Task 2: Add Theme Resolution Hook

#### 2.1 Intent

Resolve the persisted theme mode into an actual light/dark UI theme and keep it
updated while the OS theme changes.

#### 2.2 Files

- Create: `entrypoints/newtab/hooks/useThemeMode.ts`
- Test: `entrypoints/newtab/hooks/useThemeMode.test.tsx`

#### 2.3 Dependencies

Task 1, because the hook accepts the `ThemeMode` type.

- [ ] **Step 1:** Create a pure helper such as
  `resolveThemeMode(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark'`.
- [ ] **Step 2:** Create `useThemeMode(mode: ThemeMode)` with a React effect
  that sets `document.documentElement.dataset.theme`.
- [ ] **Step 3:** For `mode === 'system'`, read
  `window.matchMedia('(prefers-color-scheme: dark)')`.
- [ ] **Step 4:** Register a `change` listener on the media query while in
  `system` mode, and remove it in effect cleanup.
- [ ] **Step 5:** For explicit `light` or `dark`, apply the selected mode and
  do not subscribe to OS changes.
- [ ] **Step 6:** Handle missing `window.matchMedia` by resolving `system` to
  `light` in tests/non-browser environments.

#### 2.4 Verification

- Run: `pnpm vitest run entrypoints/newtab/hooks/useThemeMode.test.tsx`
- Expect:
  - `resolveThemeMode('light', true)` returns `light`.
  - `resolveThemeMode('dark', false)` returns `dark`.
  - `resolveThemeMode('system', true)` returns `dark`.
  - The hook writes `data-theme="dark"` when system is dark.
  - A mocked media-query `change` event updates `data-theme` live.
  - Cleanup removes the media-query listener.
  - Switching from `system` to explicit `light` ignores later OS changes.

#### 2.5 Notes

- Keep the effect small and documented. This is browser-environment logic with
  enough edge cases to justify a focused hook.

### Task 3: Wire Theme Resolution Into the New-Tab Root

#### 3.1 Intent

Apply the selected theme for the whole new-tab page as soon as snapshots hydrate,
without conditional hooks or duplicate DOM writes.

#### 3.2 Files

- Modify: `entrypoints/newtab/App.tsx`
- Test: covered by `entrypoints/newtab/hooks/useThemeMode.test.tsx`

#### 3.3 Dependencies

Task 2.

- [ ] **Step 1:** Import `useThemeMode` into `App.tsx`.
- [ ] **Step 2:** Inside `NewTabWorkspace`, call
  `useThemeMode(snapshot?.settings.themeMode ?? 'system')` before any early
  return.
- [ ] **Step 3:** Do not put theme resolution inside `CommandBusProvider` or
  `RuntimeCommandBus`; this is UI-only behavior.
- [ ] **Step 4:** Confirm loading state also receives the resolved root
  `data-theme` style.

#### 3.4 Verification

- Run: `pnpm typecheck`
- Expect:
  - No conditional hook warnings or type errors.
  - `App.tsx` stays under the project file/function size guidelines.

#### 3.5 Notes

- Multiple new-tab pages should update because `RuntimeCommandBus.subscribe()`
  already watches `local:settings` and emits fresh snapshots.

### Task 4: Add Appearance Settings UI

#### 4.1 Intent

Expose the three supported theme modes in the existing Settings modal.

#### 4.2 Files

- Create: `entrypoints/newtab/components/settings/AppearanceSettings.tsx`
- Modify: `entrypoints/newtab/components/settings/SettingsPanel.tsx`
- Modify: `entrypoints/newtab/hooks/useSettings.ts`
- Modify: `entrypoints/newtab/styles/components.css`
- Test: `entrypoints/newtab/components/settings/AppearanceSettings.test.tsx`

#### 4.3 Dependencies

Tasks 1 and 2.

- [ ] **Step 1:** Add an `AppearanceSettings` component that accepts the public
  settings snapshot.
- [ ] **Step 2:** Render one compact field labeled `Theme` with options
  `System`, `Light`, and `Dark`.
- [ ] **Step 3:** On change, dispatch `saveSettings({ themeMode })` through the
  existing `useSettings()` helper.
- [ ] **Step 4:** Keep the UI compact and consistent with existing
  `settings-section`, `field-row`, and input styles.
- [ ] **Step 5:** Render `AppearanceSettings` near the top of `SettingsPanel`,
  before sync status and Gist sync controls.
- [ ] **Step 6:** Update the settings header subtitle only if needed; keep copy
  short and avoid recreating the original TabTab options page.

#### 4.4 Verification

- Run:
  `pnpm vitest run entrypoints/newtab/components/settings/AppearanceSettings.test.tsx`
- Expect:
  - The current mode is selected from `snapshot.settings.themeMode`.
  - Choosing `Dark` dispatches
    `{ type: 'setGistSettings', patch: { themeMode: 'dark' } }` through the
    mocked command bus.
  - No token, Gist ID, filename, workspace, or sync-state data is sent by this
    component.
- Manual check:
  - Opening settings shows Theme with `System` selected for fresh storage.

#### 4.5 Notes

- A native `<select>` is acceptable and matches the original TabTab setting
  screenshot. A segmented control is also acceptable if implemented with simple,
  accessible buttons and no extra dependency.

### Task 5: Add Dark Theme Tokens

#### 5.1 Intent

Match the original TabTab dark-mode feel using the existing CSS variable system:
near-black surfaces, subtle borders, readable muted text, and a restrained accent.

#### 5.2 Files

- Modify: `entrypoints/newtab/styles/theme.css`
- Modify: `entrypoints/newtab/styles/components.css`
- Modify: `entrypoints/newtab/styles/workspace.css`
- Optionally modify: `entrypoints/newtab/styles/layout.css`

#### 5.3 Dependencies

Tasks 2 and 3, because CSS applies via `:root[data-theme='dark']`.

- [ ] **Step 1:** Keep the existing `:root` block as the light theme.
- [ ] **Step 2:** Add `color-scheme: light;` to `:root`.
- [ ] **Step 3:** Add a `:root[data-theme='dark']` block with
  `color-scheme: dark;` and dark overrides for every color token currently used:
  `--bg-app`, `--bg-panel`, `--bg-sidebar`, `--bg-hover`,
  `--bg-selected`, `--border`, `--border-strong`, `--text`,
  `--text-muted`, `--text-faint`, `--accent`, `--accent-hover`,
  `--danger`, and `--danger-hover`.
- [ ] **Step 4:** Use a neutral near-black palette, not a purple, beige, brown,
  or saturated blue palette. Target the screenshots' low-contrast dark UI.
- [ ] **Step 5:** Audit hard-coded colors in `components.css`,
  `workspace.css`, and `layout.css`. Replace hard-coded values only where they
  break dark mode contrast.
- [ ] **Step 6:** If a select control needs styling, add a reusable
  `.select-input` or reuse `.text-input` carefully.
- [ ] **Step 7:** Ensure focus states remain visible in both light and dark.

#### 5.4 Verification

- Run: `pnpm typecheck`
- Manual check:
  - Toggle Light and Dark in settings.
  - Workspace background, sidebars, group rows, tab cards, menus, dialogs,
    settings panel, text inputs, and drag previews remain readable.
  - Hover, selected, focus, and danger states are distinguishable.
  - The app does not visually become a one-hue blue/slate palette.

#### 5.5 Notes

- Start with token overrides before editing component-specific CSS. Most UI
  already reads semantic variables and should update automatically.

### Task 6: Add Integrated Regression Coverage

#### 6.1 Intent

Protect the behavior that is easiest to regress: settings defaults, token
redaction, live system updates, and no sync side effects.

#### 6.2 Files

- Modify: `src/storage/repository.test.ts`
- Modify: `src/background/sync-engine.test.ts`
- Modify: `src/messaging/runtime-bus.test.ts`
- Create: `entrypoints/newtab/hooks/useThemeMode.test.tsx`
- Create: `entrypoints/newtab/components/settings/AppearanceSettings.test.tsx`

#### 6.3 Dependencies

Tasks 1 through 5.

- [ ] **Step 1:** Add the focused tests named in the earlier tasks.
- [ ] **Step 2:** Add at least one regression assertion that a theme-only patch
  does not clear the stored token.
- [ ] **Step 3:** Add at least one regression assertion that public snapshots
  expose `hasToken` but never expose raw `token`.
- [ ] **Step 4:** Add at least one regression assertion that live system theme
  changes update the DOM while `themeMode` is `system`.
- [ ] **Step 5:** Add at least one regression assertion that explicit light/dark
  modes do not react to later system changes.

#### 6.4 Verification

- Run:
  `pnpm vitest run src/storage/repository.test.ts src/background/sync-engine.test.ts src/messaging/runtime-bus.test.ts entrypoints/newtab/hooks/useThemeMode.test.tsx entrypoints/newtab/components/settings/AppearanceSettings.test.tsx`
- Run: `pnpm typecheck`
- Expect all commands to pass.

#### 6.5 Notes

- Do not broaden into full visual regression testing unless the project already
  has that setup. Manual browser verification is enough for token colors here.

### Task 7: Manual Extension Verification

#### 7.1 Intent

Verify the feature in the real extension runtime where storage watchers,
multiple new-tab pages, and browser media queries all participate.

#### 7.2 Files

- Optionally modify: `docs/manual-test-checklist.md`

#### 7.3 Dependencies

Tasks 1 through 6.

- [ ] **Step 1:** Run `pnpm dev`.
- [ ] **Step 2:** Load or reload `.output/chrome-mv3-dev/` in Brave/Chromium.
- [ ] **Step 3:** Open a new tab and confirm a fresh profile starts in
  `System`.
- [ ] **Step 4:** Select `Dark`; confirm the UI changes immediately and stays
  dark after closing/reopening the new-tab page.
- [ ] **Step 5:** Select `Light`; confirm the UI changes immediately and ignores
  OS dark-mode changes.
- [ ] **Step 6:** Select `System`; use OS settings or Chrome DevTools Rendering
  emulation for `prefers-color-scheme` to switch light/dark while the page is
  open.
- [ ] **Step 7:** Open two new-tab pages, change theme in one, and confirm the
  other updates after storage notification.
- [ ] **Step 8:** Confirm theme changes do not make sync status dirty, do not
  enqueue a Gist push, and do not alter workspace version.
- [ ] **Step 9:** Check screenshots' major surfaces: left spaces sidebar,
  center workspace, right current tabs sidebar, settings modal, menus, dialogs,
  empty states, and drag preview.

#### 7.4 Verification

- Expect:
  - `System` follows the OS live.
  - `Light` and `Dark` override the OS.
  - Theme preference persists in extension storage.
  - Multiple open new tabs converge on the same setting.
  - Sync status and workspace version remain unchanged after theme-only changes.

#### 7.5 Notes

- If manual verification finds a low-contrast color, prefer fixing the semantic
  token first. Add component-specific overrides only for genuine exceptions.

## Risks And Guardrails

- **Settings naming debt:** `GistSettings` will include `themeMode`. This is
  intentionally accepted to keep this feature focused. A later cleanup can rename
  it to `AppSettings`.
- **Live OS changes:** The hook must remove media-query listeners during cleanup
  and when leaving `system` mode.
- **Existing users:** Stored settings may not have `themeMode`; every defaulting
  path must fall back to `system`.
- **Token security:** Public snapshots must still redact `token`, and UI patches
  must never accidentally clear the PAT.
- **Sync isolation:** Theme settings are local app preferences. They must never
  dirty workspace sync or appear in backup JSON.
- **Color quality:** Dark mode should use neutral near-black surfaces with
  subtle contrast, matching the original screenshots. Avoid a saturated or
  one-note palette.

## References

<!-- list of references, such as files, urls, or other resources -->

| Resouce | Description | Other Notes if any |
| --- | --- | --- |
| ![DEVELOPERS.md](/home/cx/workspace/js/tabtab-clone/DEVELOPERS.md:1:320) | Project architecture, conventions, settings workflow, and AI agent guidance. | Must Read |
| ![spec/spec-tabtab-extension-mvp-20260701.md](/home/cx/workspace/js/tabtab-clone/spec/spec-tabtab-extension-mvp-20260701.md:160:220) | Current source of truth for sync state and Gist settings storage shape. | Important |
| ![raw/screenshots/2026-07-01 14-37-16.png](/home/cx/workspace/js/tabtab-clone/raw/screenshots/2026-07-01%2014-37-16.png) | Original TabTab settings screenshot showing `Theme` defaulting to `System`. | Must Read |
| ![raw/screenshots/Screenshot 2026-07-01 200147.png](/home/cx/workspace/js/tabtab-clone/raw/screenshots/Screenshot%202026-07-01%20200147.png) | Original TabTab dark workspace with low-contrast dark surfaces. | Must Read |
| ![raw/screenshots/Screenshot 2026-07-01 200202.png](/home/cx/workspace/js/tabtab-clone/raw/screenshots/Screenshot%202026-07-01%20200202.png) | Original TabTab dark workspace on a smaller saved-tab set. | Important |
| ![src/storage/settings.ts](/home/cx/workspace/js/tabtab-clone/src/storage/settings.ts:1:6) | Current persisted settings type. | Must Read |
| ![src/storage/repository.ts](/home/cx/workspace/js/tabtab-clone/src/storage/repository.ts:1:50) | Default settings and storage round-trip implementation. | Must Read |
| ![src/messaging/protocol.ts](/home/cx/workspace/js/tabtab-clone/src/messaging/protocol.ts:1:72) | Command, settings patch, public settings, and snapshot contracts. | Must Read |
| ![src/background/handler.ts](/home/cx/workspace/js/tabtab-clone/src/background/handler.ts:60:214) | Background command routing, workspace mutation path, sync dirty behavior, and public settings redaction. | Must Read |
| ![src/background/sync-engine.ts](/home/cx/workspace/js/tabtab-clone/src/background/sync-engine.ts:96:277) | Settings patch merge logic that preserves PAT unless explicitly cleared. | Must Read |
| ![src/messaging/runtime-bus.ts](/home/cx/workspace/js/tabtab-clone/src/messaging/runtime-bus.ts:1:81) | Runtime settings watcher and redacted snapshot assembly for open new-tab pages. | Must Read |
| ![src/messaging/in-memory-bus.ts](/home/cx/workspace/js/tabtab-clone/src/messaging/in-memory-bus.ts:26:140) | Standalone command bus that mirrors settings patch behavior. | Important |
| ![entrypoints/newtab/App.tsx](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/App.tsx:26:125) | New-tab root and best place to call the theme hook. | Must Read |
| ![entrypoints/newtab/hooks/useSettings.ts](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/hooks/useSettings.ts:1:22) | Existing settings command helper used by settings UI. | Important |
| ![entrypoints/newtab/components/settings/SettingsPanel.tsx](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/components/settings/SettingsPanel.tsx:1:37) | Existing settings modal composition. | Important |
| ![entrypoints/newtab/components/settings/GistConfigForm.tsx](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/components/settings/GistConfigForm.tsx:1:91) | Existing settings form pattern and command dispatch style. | Important |
| ![entrypoints/newtab/styles/theme.css](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/styles/theme.css:1:54) | Current semantic theme tokens and base resets. | Must Read |
| ![entrypoints/newtab/styles/components.css](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/styles/components.css:1:280) | Shared controls, settings modal, menus, dialogs, and hard-coded colors to audit. | Important |
| ![entrypoints/newtab/styles/workspace.css](/home/cx/workspace/js/tabtab-clone/entrypoints/newtab/styles/workspace.css:1:220) | Workspace, group rows, saved tab cards, and current tab sidebar styles. | Important |

# Open TabTab — Developer Guide

Guidance for human contributors and AI agents working on this project.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Directory Layout](#directory-layout)
- [Tech Stack](#tech-stack)
- [Setup & Commands](#setup--commands)
- [Key Architecture Decisions](#key-architecture-decisions)
- [Conventions](#conventions)
- [How To…](#how-to)
- [AI Agent Guidance](#ai-agent-guidance)
- [MVP Scope & Known Limitations](#mvp-scope--known-limitations)

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│  New-Tab Page (React UI)                                │
│  ┌─────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Spaces  │  │  Workspace   │  │  Current Tabs     │  │
│  │ Sidebar │  │  (groups &   │  │  Sidebar          │  │
│  │         │  │   cards)     │  │  (live browser)   │  │
│  └────┬────┘  └──────┬───────┘  └────────┬──────────┘  │
│       │              │                    │              │
│   dispatch()     dispatch()         src/browser/*        │
│       │              │              (chrome.tabs)        │
└───────┼──────────────┼────────────────────┼──────────────┘
        │              │                    │
   ┌────┴──────────────┴────────────────────┴─────────────┐
   │  RuntimeCommandBus                                   │
   │  - dispatch → @webext-core/messaging → background    │
   │  - subscribe → storage.watch (read-only observation) │
   └────────────────────────┬─────────────────────────────┘
                             │
   ┌─────────────────────────┴─────────────────────────────┐
   │  Background Service Worker (single mutation owner)    │
   │  ┌──────────────────────────────────────────────────┐ │
   │  │  handler.ts                                      │ │
   │  │  - receives Commands                             │ │
   │  │  - applies pure domain operations                │ │
   │  │  - bumps version (monotonic)                     │ │
   │  │  - persists to storage                           │ │
   │  │  - enqueues Gist push if configured              │ │
   │  └────────────────────┬─────────────────────────────┘ │
   │                       │                               │
   │  ┌────────────────────┴─────────────────────────────┐ │
   │  │  sync-engine.ts + queue.ts                       │ │
   │  │  - serial push queue (coalesce rapid mutations)  │ │
   │  │  - reconcile on startup / manual pull            │ │
   │  │  - conflict detection & resolution               │ │
   │  └──────────────────────────────────────────────────┘ │
   └───────────────────────────────────────────────────────┘
```

### Three tiers of the codebase

1. **Pure domain** (`src/domain/`) — zero `chrome.*` imports. Operations, backup adapter, versioning, types. Fully unit-testable without a browser.

2. **Infrastructure / I/O** (`src/storage/`, `src/sync/`, `src/browser/`) — wraps extension storage, GitHub Gist REST, and `chrome.tabs`/`tabGroups` APIs behind injectable interfaces so the domain stays pure and I/O modules are testable with mocks.

3. **UI & integration** (`entrypoints/newtab/`, `src/background/`, `src/messaging/`) — React components, the background handler that owns mutations, and the command-bus plumbing that connects them.

### Data flow

**Writes** (mutations): UI dispatches a `Command` → `RuntimeCommandBus` sends it via `@webext-core/messaging` to the background worker → `handleCommand` applies the pure operation, bumps version, persists, notifies sync engine.

**Reads** (state observation): The background persists workspace, sync state, and settings to `chrome.storage.local`. Every open new-tab page subscribes with `storage.watch` on those keys and re-reads a fresh `Snapshot` on any change. No broadcast messages, no polling.

## Directory Layout

```text
.
├── entrypoints/               # WXT entrypoints (build targets)
│   ├── background.ts          # MV3 service worker — registers message handler
│   └── newtab/                # New-tab page (React app)
│       ├── App.tsx            # Root: DndContext, layout, snapshot provider
│       ├── main.tsx           # React DOM mount
│       ├── index.html         # HTML shell
│       ├── actions/           # UI-side side effects (stash, open)
│       ├── components/        # React components
│       │   ├── common/        #   Shared: ConfirmDialog, InlineEditable
│       │   ├── settings/      #   Settings panel, Gist config, conflict banner
│       │   ├── *.tsx          #   SpacesSidebar, WorkspaceView, GroupRow, etc.
│       │   └── *.test.tsx     #   Component tests
│       ├── dnd/               # dnd-kit config + drag→command mapping
│       ├── hooks/             # useSnapshot, useLiveTabs, useSelectedSpace
│       └── styles/            # CSS (theme, layout, components, workspace)
├── src/                       # Shared modules (imported by both entrypoints)
│   ├── background/            # Command handler + sync engine (runs in worker)
│   ├── browser/               # chrome.tabs / chrome.tabGroups wrappers
│   ├── domain/                # Pure logic: types, operations, backup adapter, version
│   ├── messaging/             # CommandBus interface, typed channel, in-memory + runtime impls
│   ├── storage/               # Persistence abstraction, keys, settings/sync-state types
│   ├── sync/                  # Gist client, reconcile logic, serial push queue
│   └── testing/               # Sample backup fixture for tests + UI seeding
├── spec/                      # Design spec (source of truth for requirements)
├── plan/                      # Implementation plan (task breakdown)
├── docs/                      # Manual test checklist
├── wxt.config.ts              # WXT configuration (permissions, React module)
├── vitest.config.ts           # Vitest + WxtVitest plugin
├── tsconfig.json              # TypeScript (extends .wxt/tsconfig.json)
└── package.json
```

## Tech Stack

| Category | Choice | Rationale |
| --- | --- | --- |
| Extension framework | [WXT](https://wxt.dev) | First-class MV3 support, typed APIs, `newtab` entrypoint |
| UI | React 19 + TypeScript | Component model, strict typing, hooks |
| Drag & drop | [dnd-kit](https://dndkit.com) | Accessible, framework-neutral, good sortable primitives |
| Messaging | [@webext-core/messaging](https://webext-core.aklinker1.io/messaging/) | Typed request/response over `chrome.runtime.sendMessage` |
| Package manager | pnpm | Workspace support, fast installs |
| Testing | Vitest + Testing Library + jsdom | `WxtVitest` plugin polyfills `browser` via `fakeBrowser` |
| Sync backend | GitHub Gist REST API | Free, private, supports raw JSON file, no server needed |

## Setup & Commands

### Prerequisites

- [pnpm](https://pnpm.io/) ≥ 9
- Node.js ≥ 20 (for `crypto.randomUUID()` and modern APIs)

### Install

```bash
pnpm install
pnpm postinstall   # runs `wxt prepare` (generates .wxt/ types)
```

### Development

```bash
pnpm dev           # watch mode, auto-reloads extension in browser
pnpm typecheck     # tsc --noEmit (strict mode)
pnpm test          # run all Vitest tests once
pnpm test:watch    # watch mode
pnpm build         # production build → .output/chrome-mv3/
```

Load the extension during development: in `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select `.output/chrome-mv3-dev/` (for `pnpm dev`) or `.output/chrome-mv3/` (for `pnpm build`).

### Test structure

- `src/**/*.test.ts` — unit tests (domain, storage, sync, browser wrappers, messaging, handler). Use `fakeBrowser` from `wxt/testing/fake-browser` for anything touching extension APIs.
- `entrypoints/**/*.test.tsx` — component tests (Testing Library). Mock the `CommandBus` interface; never render against real `chrome.*`.

## Key Architecture Decisions

### Local-first, best-effort sync

Every mutation saves to `chrome.storage.local` first and returns success to the UI. Gist push is enqueued asynchronously. If the push fails, the local save is intact and sync state is marked `dirty`/`error`. Future mutations continue normally.

### Single mutation owner

Only the background service worker writes workspace data to storage. New-tab pages never write directly. They dispatch `Command` objects and observe the resulting state through `storage.watch`. This avoids distributed-write races across multiple open new-tab pages.

### Command bus pattern

The UI codes against the `CommandBus` interface (`src/messaging/protocol.ts`):

```ts
interface CommandBus {
  dispatch(cmd: Command): Promise<CommandResult>;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
```

Two implementations exist:

- `InMemoryCommandBus` — holds state in memory, applies pure domain operations directly. Used in early UI development and can be used for integration tests that don't need the extension runtime.
- `RuntimeCommandBus` — dispatches via `@webext-core/messaging` to the background worker; subscribes via `storage.watch`. Used in the real extension and in `pnpm dev`.

### State observation via storage, not messages

When the background persists a mutation, every open new-tab page learns about it through `storage.watch` callbacks — not through a hand-rolled broadcast. This is simpler, more reliable across MV3 worker lifecycles, and removes ambiguity between "command acknowledged" and "state updated."

### Backup format dual-tolerance

**Export & Gist sync** write the internal `Workspace` shape (with `spaceOrder`, not `space_list`). **Import** (`parseBackup`) accepts both the internal shape **and** TabTab-shaped backups (with `space_list`), normalizing either into the internal model. This satisfies the MVP requirement of importing original TabTab exports while letting the project own its canonical format.

### Version bumping (monotonic)

```ts
nextVersion = Math.max(Date.now(), currentVersion + 1)
```

Bumped exactly once per committed mutation in the background handler. Operations are pure and do not bump versions — the handler owns that.

### Token security

The GitHub PAT is stored in `chrome.storage.local`, is never returned to the UI (only `hasToken: boolean` is exposed), is never logged, and is never included in the synced backup file. Settings changes from the UI use a `GistSettingsPatch` so the UI can toggle `enabled`/`gistId`/`filename` without ever holding or erasing the stored token.

## Conventions

### Style

- **2-space indentation** (no tabs).
- **Semicolons** required (TypeScript default).
- **Single quotes** for strings where consistent with existing code.
- Files: **≤ 400 lines**. Split into smaller modules before reaching this.
- Functions: **≤ 100 lines**. Extract helpers or sub-components.
- Exported functions and classes should have a **JSDoc description**.

### Purity boundary

Code under `src/domain/` and `src/sync/reconcile.ts` must not import from `chrome.*`, WXT runtime, or any I/O module. They are pure functions tested with plain Vitest (no jsdom or fakeBrowser needed).

Browser API access is confined to:

- `src/browser/` — thin wrappers over `chrome.tabs`/`chrome.tabGroups`.
- `src/storage/` — thin wrappers over `chrome.storage` (via WXT's `storage`).
- `src/background/` — the mutation owner that orchestrates domain + storage + sync.
- `src/messaging/runtime-bus.ts` — the WXT `storage.watch` integration.

### Testing

- Every pure module must have a corresponding `.test.ts` file.
- Use `fakeBrowser` from `wxt/testing/fake-browser` for modules that touch extension APIs. Call `fakeBrowser.reset()` in `beforeEach`.
- Component tests use `@testing-library/react` with a mocked `CommandBus`.
- `pnpm typecheck` and `pnpm build` must pass before merging.

### Dependencies

- Install runtime dependencies with `pnpm add`, dev dependencies with `pnpm add -D`.
- Do not add a dependency without a clear reason. Prefer the platform (`URL`, `crypto.randomUUID()`, `fetch`) over libraries.

## How To…

### Add a new workspace mutation (e.g., "pin a tab")

1. **Domain** — add a pure function in `src/domain/operations.ts`: `pinTab(workspace, spaceId, tabId): Workspace`. Return a new object (never mutate the input). Write tests in `operations.test.ts`.
2. **Protocol** — add a new variant to the `Command` union in `src/messaging/protocol.ts`: `| { type: 'pinTab'; spaceId: string; tabId: string }`.
3. **Handler** — add a case in `applyMutation()` in `src/background/handler.ts` that calls your new operation.
4. **UI** — in the component that triggers the action, call `dispatch({ type: 'pinTab', spaceId, tabId })`.
5. **Tests** — the domain test covers correctness; component tests assert the correct command is dispatched.

### Add a new sync/settings command

1. Add the variant to `Command` in `src/messaging/protocol.ts`.
2. Handle it in `handleSyncCommand()` in `src/background/handler.ts`.
3. Implement the logic in `src/background/sync-engine.ts`.
4. If it adds a new setting field, update `GistSettings` in `src/storage/settings.ts` and the `GistConfigForm` UI.

### Run a single test file

```bash
pnpm vitest run src/domain/operations.test.ts
```

### Debug the extension

1. Run `pnpm dev`.
2. Open `chrome://extensions`, find Open TabTab, click **service worker** (or **Inspect views: newtab**) to open DevTools.
3. The new-tab page is a regular extension page — `console.log` works.

## AI Agent Guidance

### Before starting any task

1. **Read** `spec/spec-tabtab-extension-mvp-20260701.md` — the authoritative source of truth. When the spec and plan disagree, the spec wins.
2. **Read** `plan/plan-tabtab-extension-mvp-20260701.md` — the implementation breakdown, especially **§0 Contracts** (types, interfaces, invariants).
3. **Read** the relevant source files in `src/` before editing anything.

### Key files to understand per concern

| Concern | Files to read |
| --- | --- |
| What a "mutation" looks like | `src/messaging/protocol.ts` (Command union) |
| Domain operations | `src/domain/operations.ts`, `src/domain/types.ts` |
| Backup import/export | `src/domain/backup.ts` |
| Background writes | `src/background/handler.ts` |
| Sync pipeline | `src/background/sync-engine.ts`, `src/sync/queue.ts`, `src/sync/gist-client.ts` |
| How UI talks to background | `src/messaging/runtime-bus.ts`, `entrypoints/newtab/hooks/useSnapshot.ts` |
| Browser tab APIs | `src/browser/tabs.ts`, `src/browser/tab-groups.ts` |
| Storage keys & persistence | `src/storage/keys.ts`, `src/storage/repository.ts` |
| UI components | `entrypoints/newtab/App.tsx`, `entrypoints/newtab/components/*.tsx` |

### Conventions for AI-generated code

- Match the existing style exactly. If you think a different style would be better, ask before changing it.
- Do not modify §0 contracts (types in `protocol.ts`, `types.ts`, `keys.ts`, `settings.ts`, `sync-state.ts`) without updating the plan and spec.
- When touching UI components, dispatch through the `CommandBus` — never call a domain operation directly from a component.
- When touching browser APIs, route through `src/browser/*` wrappers — never access `chrome.tabs` directly in a component.
- Tests are required for the module you change. If adding a new module, add a corresponding `.test.ts` file.
- `pnpm typecheck` must pass after your changes.

### Testing with fakeBrowser

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('my module', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('does something with storage', async () => {
    // fakeBrowser.storage.local behaves like the real API
    await fakeBrowser.storage.local.set({ 'local:key': 'value' });
    // ...
  });
});
```

Not every `chrome.*` API is fully faked. `chrome.tabs` query/create/remove work; `chrome.tabGroups` and `chrome.tabs.group` have limited fake support. Those are covered by the manual Brave E2E checklist instead.

## MVP Scope & Known Limitations

### In scope (implemented)

- Brave/Chromium extension replacing the new-tab page.
- Spaces, groups, saved tabs — full CRUD.
- Current browser tabs sidebar with search.
- Drag & drop for reordering and cross-group moves.
- Save individual browser tabs by dragging them into a group.
- One-click stash-all (timestamped group, closes non-pinned tabs).
- Open saved group as a native browser tab group.
- GitHub Gist auto-sync via manual PAT, with conflict detection.
- Backup import (TabTab format) and export.

### Out of scope (not planned for MVP)

- Firefox support.
- GitHub OAuth login.
- WebDAV, Google Drive, or other sync backends.
- Multi-language UI (i18n).
- Theme system beyond the default light theme.
- Toby import.
- Public sharing.
- Zen mode.
- Per-group tab-group color/icon customization.
- Automatic conflict merge (manual resolution only).
- Mobile support.
- Publishing to extension stores (manual unpacked load only).

### Known technical constraints

- `file://` URLs are preserved in import/export but may not open due to Chromium extension security policies.
- MV3 service workers can be evicted when idle. The extension persists sync state to survive worker restarts, but an in-flight push may be lost. The queue re-reads from storage on wake-up.
- Brave support for `chrome.tabs.group` and `chrome.tabGroups.update` has been verified manually (see `docs/manual-test-checklist.md`), but Brave's API surface may diverge from Chrome in future versions.

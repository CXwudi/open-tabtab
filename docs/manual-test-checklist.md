# Manual Test Checklist

Date: 2026-07-01

Build under test: `.output/chrome-mv3` from `pnpm build`

Environment:

- Browser: Brave `149.1.91.180`
- CDP browser string: `Chrome/149.0.7827.201`
- OS: Microsoft Windows 10 Pro `10.0.19045`
- Runner: temporary Brave profile launched from WSL, exercised through Windows PowerShell CDP

## Results

| Step | Status | Evidence |
| --- | --- | --- |
| Load unpacked extension | Pass | Brave loaded the extension service worker and `chrome://newtab/` rendered title `Open TabTab` with `SPACES` and `Default` visible. |
| Current tabs live update | Pass | Opening `https://example.com/` updated the sidebar to `Tabs (3)` and rendered the `Example Domain` tab row. |
| Drag browser tab into group | Pass | CDP mouse drag from the real `Example Domain` current-tab row to a collection created a saved card with `https://example.com/`. |
| Stash all | Pass | With 5 tabs open, one example tab pinned, stash-all produced a timestamped `Stash 2026-07-01 20:01` group, reduced the window to 2 tabs, and preserved the pinned tab plus the Open TabTab tab. |
| Open saved tab and native group | Pass | Opening a saved card created another `https://example.com/` tab. Opening the collection as a native group produced a Brave tab group titled `New Collection` with color `blue`. |
| Gist sync | Pass | Bad-token path: local mutation saved, status became `error`, and the error was `GitHub request failed with status 401`; the token was not rendered. Valid-token path: a temporary secret Gist pushed successfully, `syncState.status` returned to `idle`, `lastSyncedVersion` matched workspace version `1782951189325`, the remote backup version matched, and the temporary Gist was deleted. |
| Import captured TabTab backup | Pass | Importing `raw/screenshots/tabtab_backup_20260701_1437.json` through the settings file input showed `Backup imported.`; storage and rendered UI confirmed `二次元` has 7 groups and `Dev` has 2 groups. |

## Notes

- WSL could not reach Windows Brave CDP through the Windows gateway even with `--remote-debugging-address=0.0.0.0`, so browser automation used Windows PowerShell against `127.0.0.1:9334`.
- The sync validation initially exposed a background-worker `fetch` receiver bug (`Illegal invocation`). The fix binds the default global fetch receiver in `GistClient`, and the final Gist checks above were rerun against the fixed build.

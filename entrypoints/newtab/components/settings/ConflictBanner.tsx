import { useDispatch } from '../../hooks/useSnapshot';

type ConflictBannerProps = {
  lastError?: string;
};

/** Conflict recovery controls for choosing local or remote Gist state. */
export default function ConflictBanner({ lastError }: ConflictBannerProps) {
  const dispatch = useDispatch();

  return (
    <section className="conflict-banner" aria-label="Sync conflict">
      <h3>Sync conflict</h3>
      <p>{lastError ?? 'Local and remote backups both changed. Choose which side should win.'}</p>
      <div className="settings-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void dispatch({ type: 'resolveConflict', resolution: 'useLocal' })}
        >
          Replace remote with local
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void dispatch({ type: 'resolveConflict', resolution: 'useRemote' })}
        >
          Replace local with remote
        </button>
      </div>
      <p className="settings-hint">Use the backup tools below before resolving if you want a copy of either side.</p>
    </section>
  );
}

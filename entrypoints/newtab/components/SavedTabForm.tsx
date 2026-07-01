import { useState, type FormEvent } from 'react';

type SavedTabFormProps = {
  mode: 'add' | 'edit';
  initialTitle?: string;
  initialUrl?: string;
  onSubmit: (values: { title: string; url: string }) => void;
  onCancel: () => void;
};

/**
 * Shared create/edit form for a saved tab (URL + title). The owning
 * {@link GroupRow} decides whether a submit becomes a `createSavedTab` or
 * `editSavedTab` command; this component only collects and validates input.
 */
export default function SavedTabForm({
  mode,
  initialTitle = '',
  initialUrl = '',
  onSubmit,
  onCancel,
}: SavedTabFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState(initialUrl);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onSubmit({ title: trimmedTitle || trimmedUrl, url: trimmedUrl });
  }

  return (
    <form className="saved-tab-form" onSubmit={handleSubmit}>
      <input
        className="text-input"
        aria-label="Tab URL"
        placeholder="https://example.com"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        autoFocus
      />
      <input
        className="text-input"
        aria-label="Tab title"
        placeholder="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className="saved-tab-form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {mode === 'add' ? 'Add tab' : 'Save'}
        </button>
      </div>
    </form>
  );
}

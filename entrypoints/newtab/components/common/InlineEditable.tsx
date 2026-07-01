import { useEffect, useRef, useState } from 'react';

type InlineEditableProps = {
  value: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onCommit: (next: string) => void;
  className?: string;
  inputAriaLabel?: string;
};

/**
 * Controlled inline text editor: shows plain text that the parent can flip into
 * an input (via `editing`). Committing on Enter/blur reports the trimmed value
 * only when it actually changed; Escape cancels. The parent owns `editing` so a
 * `...` menu item and a double-click can both trigger a rename.
 */
export default function InlineEditable({
  value,
  editing,
  onEditingChange,
  onCommit,
  className,
  inputAriaLabel,
}: InlineEditableProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against blur firing a second commit right after Enter/Escape.
  const doneRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    doneRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
    // Reset only when entering edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    onEditingChange(false);
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
  }

  function cancel() {
    doneRef.current = true;
    onEditingChange(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-input ${className ?? ''}`}
        value={draft}
        aria-label={inputAriaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  return (
    <span
      className={`inline-text ${className ?? ''}`}
      title="Double-click to rename"
      onDoubleClick={() => onEditingChange(true)}
    >
      {value}
    </span>
  );
}

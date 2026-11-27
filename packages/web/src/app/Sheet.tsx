import { useEffect, useRef, type ReactNode } from "react";

/**
 * A bottom sheet: a native modal <dialog>, so focus, Escape and screen readers behave.
 * Rendering it opens it; `onClose` runs on Escape or a tap outside, and the parent removes it.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the dialog itself, not its content, is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

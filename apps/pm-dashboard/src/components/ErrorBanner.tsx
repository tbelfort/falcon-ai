import { useUiStore } from '../stores/uiStore';

export function ErrorBanner() {
  const errorMessage = useUiStore((state) => state.errorMessage);
  const clearError = useUiStore((state) => state.clearError);

  if (!errorMessage) {
    return null;
  }

  return (
    <div
      role="alert"
      className="glass-panel mx-6 mt-6 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-glow"
    >
      <span>{errorMessage}</span>
      <button
        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600"
        onClick={clearError}
        type="button"
      >
        Dismiss
      </button>
    </div>
  );
}

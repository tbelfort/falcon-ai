import { useUiStore } from '../stores/uiStore';

export default function ErrorBanner() {
  const message = useUiStore((state) => state.errorBanner);
  const setErrorBanner = useUiStore((state) => state.setErrorBanner);

  if (!message) {
    return null;
  }

  return (
    <div className="surface-card mb-4 flex items-center justify-between gap-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <span>{message}</span>
      <button
        type="button"
        className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
        onClick={() => setErrorBanner(null)}
      >
        Dismiss
      </button>
    </div>
  );
}

import { useUiStore } from '../stores/uiStore';

export function ErrorBanner() {
  const { errorBanner, clearError } = useUiStore();

  if (!errorBanner) return null;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50"
      data-testid="error-banner"
      role="alert"
    >
      <span>{errorBanner}</span>
      <button
        onClick={clearError}
        className="text-red-700 hover:text-red-900"
        aria-label="Dismiss error"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

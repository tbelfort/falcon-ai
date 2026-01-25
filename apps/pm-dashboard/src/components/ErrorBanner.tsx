import { useUIStore } from '../stores/uiStore';

export function ErrorBanner() {
  const { errorMessage, clearError } = useUIStore();

  if (!errorMessage) return null;

  return (
    <div
      className="flex items-center justify-between bg-red-900 px-4 py-2 text-red-100"
      role="alert"
      data-testid="error-banner"
    >
      <span>{errorMessage}</span>
      <button
        onClick={clearError}
        className="ml-4 text-red-200 hover:text-white"
        aria-label="Dismiss error"
      >
        &times;
      </button>
    </div>
  );
}

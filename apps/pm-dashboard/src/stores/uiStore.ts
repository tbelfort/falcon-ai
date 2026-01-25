import { create } from 'zustand';

interface UIState {
  selectedIssueId: string | null;
  errorMessage: string | null;
  selectIssue: (id: string | null) => void;
  showError: (message: string) => void;
  clearError: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedIssueId: null,
  errorMessage: null,

  selectIssue: (id) => {
    set({ selectedIssueId: id });
  },

  showError: (message) => {
    set({ errorMessage: message });
    // Auto-clear after 5 seconds
    setTimeout(() => {
      set((state) => (state.errorMessage === message ? { errorMessage: null } : state));
    }, 5000);
  },

  clearError: () => {
    set({ errorMessage: null });
  },
}));

import { create } from 'zustand';

interface UiState {
  selectedIssueId: string | null;
  isModalOpen: boolean;
  errorBanner: string | null;

  openIssueModal: (issueId: string) => void;
  closeIssueModal: () => void;
  showError: (message: string) => void;
  clearError: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedIssueId: null,
  isModalOpen: false,
  errorBanner: null,

  openIssueModal: (issueId: string) => {
    set({ selectedIssueId: issueId, isModalOpen: true });
  },

  closeIssueModal: () => {
    set({ selectedIssueId: null, isModalOpen: false });
  },

  showError: (message: string) => {
    set({ errorBanner: message });
    // Auto-clear after 5 seconds
    setTimeout(() => {
      set((state) => (state.errorBanner === message ? { errorBanner: null } : state));
    }, 5000);
  },

  clearError: () => {
    set({ errorBanner: null });
  },
}));

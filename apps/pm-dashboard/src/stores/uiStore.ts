import { create } from 'zustand';

interface UiState {
  selectedIssueId: string | null;
  errorMessage: string | null;
  openIssue: (issueId: string) => void;
  closeIssue: () => void;
  setError: (message: string) => void;
  clearError: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedIssueId: null,
  errorMessage: null,
  openIssue: (issueId) => set({ selectedIssueId: issueId }),
  closeIssue: () => set({ selectedIssueId: null }),
  setError: (message) => set({ errorMessage: message }),
  clearError: () => set({ errorMessage: null }),
}));

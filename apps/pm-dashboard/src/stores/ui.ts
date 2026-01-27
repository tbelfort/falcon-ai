import { create } from 'zustand';

type UiState = {
  selectedIssueId: string | null;
  errorBanner: string | null;
  openIssue: (issueId: string) => void;
  closeIssue: () => void;
  setError: (message: string) => void;
  clearError: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedIssueId: null,
  errorBanner: null,
  openIssue: (issueId) => set({ selectedIssueId: issueId }),
  closeIssue: () => set({ selectedIssueId: null }),
  setError: (message) => set({ errorBanner: message }),
  clearError: () => set({ errorBanner: null }),
}));

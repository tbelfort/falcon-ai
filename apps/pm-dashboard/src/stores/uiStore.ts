import { create } from 'zustand';

type UiState = {
  selectedIssueId: string | null;
  errorBanner: string | null;
  selectIssue: (issueId: string | null) => void;
  setErrorBanner: (message: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedIssueId: null,
  errorBanner: null,
  selectIssue: (issueId) => set({ selectedIssueId: issueId }),
  setErrorBanner: (message) => set({ errorBanner: message })
}));

import { create } from 'zustand';

interface UiState {
  errorBanner: string | null;
  issueModalId: string | null;
  setErrorBanner: (message: string) => void;
  clearErrorBanner: () => void;
  openIssueModal: (issueId: string) => void;
  closeIssueModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  errorBanner: null,
  issueModalId: null,
  setErrorBanner: (message) => set({ errorBanner: message }),
  clearErrorBanner: () => set({ errorBanner: null }),
  openIssueModal: (issueId) => set({ issueModalId: issueId }),
  closeIssueModal: () => set({ issueModalId: null })
}));

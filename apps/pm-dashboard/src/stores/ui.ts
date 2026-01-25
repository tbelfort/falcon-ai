import { create } from 'zustand';

interface UiStore {
  selectedIssueId: string | null;
  isModalOpen: boolean;
  errorBanner: string | null;
  openIssue: (issueId: string) => void;
  closeIssue: () => void;
  setError: (message: string) => void;
  clearError: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedIssueId: null,
  isModalOpen: false,
  errorBanner: null,
  openIssue: (issueId) => set({ selectedIssueId: issueId, isModalOpen: true }),
  closeIssue: () => set({ isModalOpen: false }),
  setError: (message) => set({ errorBanner: message }),
  clearError: () => set({ errorBanner: null })
}));

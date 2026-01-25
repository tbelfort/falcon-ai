import { create } from 'zustand';

interface UiState {
  activeIssueId: string | null;
  openIssue: (issueId: string) => void;
  closeIssue: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeIssueId: null,
  openIssue: (issueId) => set({ activeIssueId: issueId }),
  closeIssue: () => set({ activeIssueId: null })
}));

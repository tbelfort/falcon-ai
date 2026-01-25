import { create } from 'zustand';

interface UiState {
  isModalOpen: boolean;
  modalIssueId: string | null;

  openModal: (issueId: string) => void;
  closeModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isModalOpen: false,
  modalIssueId: null,

  openModal: (issueId: string) => {
    set({ isModalOpen: true, modalIssueId: issueId });
  },

  closeModal: () => {
    set({ isModalOpen: false, modalIssueId: null });
  },
}));

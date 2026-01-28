import type { StageMessageRepo, StageMessageCreateInput } from '../../core/repos/stage-messages.js';
import type { StageMessageDto } from '../../contracts/http.js';
import type { IssueStage } from '../../core/types.js';

export class DbStageMessagesRepo implements StageMessageRepo {
  listByIssue(_issueId: string): StageMessageDto[] {
    throw new Error('DbStageMessagesRepo.listByIssue not implemented');
  }

  listUnreadByStage(_issueId: string, _stage: IssueStage): StageMessageDto[] {
    throw new Error('DbStageMessagesRepo.listUnreadByStage not implemented');
  }

  create(_input: StageMessageCreateInput): StageMessageDto {
    throw new Error('DbStageMessagesRepo.create not implemented');
  }

  markRead(_ids: string[], _readAt: number, _readBy: string): StageMessageDto[] {
    throw new Error('DbStageMessagesRepo.markRead not implemented');
  }
}

import type {
  IssueCreateInput,
  IssueRecord,
  IssueRepo,
  IssueUpdateInput,
} from '../../core/repos/issues.js';

export class DbIssuesRepo implements IssueRepo {
  listByProject(_projectId: string): IssueRecord[] {
    throw new Error('DbIssuesRepo.listByProject not implemented');
  }

  getById(_id: string): IssueRecord | null {
    throw new Error('DbIssuesRepo.getById not implemented');
  }

  create(_input: IssueCreateInput): IssueRecord {
    throw new Error('DbIssuesRepo.create not implemented');
  }

  update(_id: string, _input: IssueUpdateInput): IssueRecord | null {
    throw new Error('DbIssuesRepo.update not implemented');
  }

  delete(_id: string): IssueRecord | null {
    throw new Error('DbIssuesRepo.delete not implemented');
  }

  setLabels(_issueId: string, _labelIds: string[]): IssueRecord | null {
    throw new Error('DbIssuesRepo.setLabels not implemented');
  }

  nextNumber(_projectId: string): number {
    throw new Error('DbIssuesRepo.nextNumber not implemented');
  }
}

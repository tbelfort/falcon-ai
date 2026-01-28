import type { WorkflowRunRepo, WorkflowRunCreateInput, WorkflowRunUpdateInput } from '../../core/repos/workflow-runs.js';
import type { WorkflowRunDto } from '../../contracts/http.js';

export class DbWorkflowRunsRepo implements WorkflowRunRepo {
  listByIssue(_issueId: string): WorkflowRunDto[] {
    throw new Error('DbWorkflowRunsRepo.listByIssue not implemented');
  }

  getById(_id: string): WorkflowRunDto | null {
    throw new Error('DbWorkflowRunsRepo.getById not implemented');
  }

  create(_input: WorkflowRunCreateInput): WorkflowRunDto {
    throw new Error('DbWorkflowRunsRepo.create not implemented');
  }

  update(_id: string, _input: WorkflowRunUpdateInput): WorkflowRunDto | null {
    throw new Error('DbWorkflowRunsRepo.update not implemented');
  }
}

import type { LabelRepo, ProjectRepo } from '../repos/index.js';

export class LabelsService {
  constructor(
    private projects: ProjectRepo,
    private labels: LabelRepo
  ) {}

  async getProjectLabels(projectId: string) {
    const project = await this.projects.findById(projectId);
    if (!project) {
      throw new Error('NOT_FOUND');
    }
    const labels = await this.labels.findByProjectId(projectId);
    return {
      data: labels,
    };
  }

  async createLabel(data: {
    projectId: string;
    name: string;
    color?: string;
    description?: string;
  }) {
    const project = await this.projects.findById(data.projectId);
    if (!project) {
      throw new Error('NOT_FOUND');
    }
    const existing = await this.labels.findByName(data.projectId, data.name);
    if (existing) {
      throw new Error('CONFLICT');
    }
    const label = await this.labels.create({
      projectId: data.projectId,
      name: data.name,
      color: data.color ?? '#6b7280',
      description: data.description ?? null,
      isBuiltin: false,
    });
    return {
      data: label,
    };
  }

  async getLabel(id: string) {
    const label = await this.labels.findById(id);
    if (!label) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: label,
    };
  }

  async updateLabel(
    id: string,
    data: {
      name?: string;
      color?: string;
      description?: string;
    }
  ) {
    const existing = await this.labels.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    if (data.name && data.name !== existing.name) {
      const nameExists = await this.labels.findByName(
        existing.projectId,
        data.name
      );
      if (nameExists) {
        throw new Error('CONFLICT');
      }
    }
    const label = await this.labels.update(id, data);
    if (!label) {
      throw new Error('NOT_FOUND');
    }
    return {
      data: label,
    };
  }

  async deleteLabel(id: string) {
    const existing = await this.labels.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    if (existing.isBuiltin) {
      throw new Error('VALIDATION_ERROR');
    }
    await this.labels.delete(id);
    return {
      data: existing,
    };
  }
}
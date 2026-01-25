import type { Label } from '../types.js';
import type { ILabelRepo, IProjectRepo } from '../repos/interfaces.js';
import type { LabelDto } from '../../contracts/http.js';

export interface CreateLabelInput {
  name: string;
  color?: string;
  description?: string | null;
}

export type LabelServiceError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'VALIDATION_ERROR'; message: string; details?: unknown }
  | { code: 'CONFLICT'; message: string };

export type LabelResult<T> = { ok: true; value: T } | { ok: false; error: LabelServiceError };

function toDto(label: Label): LabelDto {
  return {
    id: label.id,
    projectId: label.projectId,
    name: label.name,
    color: label.color,
    description: label.description,
    isBuiltin: label.isBuiltin,
    createdAt: label.createdAt,
  };
}

const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export class LabelService {
  constructor(
    private readonly labelRepo: ILabelRepo,
    private readonly projectRepo: IProjectRepo
  ) {}

  async list(projectId: string): Promise<LabelResult<LabelDto[]>> {
    // Validate project exists
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Project ${projectId} not found` },
      };
    }

    const labels = await this.labelRepo.findAll(projectId);
    return { ok: true, value: labels.map(toDto) };
  }

  async get(id: string): Promise<LabelResult<LabelDto>> {
    const label = await this.labelRepo.findById(id);
    if (!label) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Label ${id} not found` } };
    }
    return { ok: true, value: toDto(label) };
  }

  async create(projectId: string, input: CreateLabelInput): Promise<LabelResult<LabelDto>> {
    // Validate project exists
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: `Project ${projectId} not found` },
      };
    }

    // Validate name
    if (!input.name || input.name.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
      };
    }

    // Validate color if provided
    if (input.color && !COLOR_REGEX.test(input.color)) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Color must be a valid hex color (e.g., #ff0000)' },
      };
    }

    // Check for duplicate name in project
    const existing = await this.labelRepo.findByName(projectId, input.name.trim());
    if (existing) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: `Label '${input.name}' already exists in this project` },
      };
    }

    const label = await this.labelRepo.create({
      projectId,
      name: input.name.trim(),
      color: input.color ?? '#6b7280',
      description: input.description ?? null,
      isBuiltin: false,
    });

    return { ok: true, value: toDto(label) };
  }

  async delete(id: string): Promise<LabelResult<void>> {
    const existing = await this.labelRepo.findById(id);
    if (!existing) {
      return { ok: false, error: { code: 'NOT_FOUND', message: `Label ${id} not found` } };
    }

    // Don't allow deleting built-in labels
    if (existing.isBuiltin) {
      return {
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot delete built-in labels' },
      };
    }

    await this.labelRepo.delete(id);
    return { ok: true, value: undefined };
  }
}

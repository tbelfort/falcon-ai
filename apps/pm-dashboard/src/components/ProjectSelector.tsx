import type { ProjectDto } from '../api/types';
import type { AsyncState } from '../utils/asyncState';
import { assertNever } from '../utils/assertNever';

interface ProjectSelectorProps {
  projectsState: AsyncState<ProjectDto[]>;
  selectedProjectId: string | null;
  onChange: (projectId: string) => void;
}

export function ProjectSelector({
  projectsState,
  selectedProjectId,
  onChange
}: ProjectSelectorProps) {
  if (projectsState.status === 'loading') {
    return <span className="text-sm text-ink-400">Loading projects...</span>;
  }

  if (projectsState.status === 'error') {
    return <span className="text-sm text-rose-600">{projectsState.error}</span>;
  }

  if (projectsState.status === 'idle') {
    return <span className="text-sm text-ink-400">No projects yet</span>;
  }

  if (projectsState.status === 'success') {
    return (
      <select
        className="rounded-full border border-ink-200/70 bg-white/80 px-4 py-2 text-sm text-ink-700 shadow-sm"
        value={selectedProjectId ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {projectsState.data.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    );
  }

  return assertNever(projectsState);
}

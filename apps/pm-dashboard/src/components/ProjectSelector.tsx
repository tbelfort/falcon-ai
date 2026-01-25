import { useProjectStore } from '../stores/projectStore';

export function ProjectSelector() {
  const { projects, selectedProjectId, selectProject } = useProjectStore();

  if (projects.status !== 'success') return null;

  return (
    <select
      value={selectedProjectId ?? ''}
      onChange={(e) => selectProject(e.target.value)}
      className="block w-full max-w-xs px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
    >
      {projects.data.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}

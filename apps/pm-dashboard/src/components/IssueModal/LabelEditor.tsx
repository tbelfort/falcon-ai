import { useState } from 'react';
import type { IssueDto } from '../../api/types';
import { useProjectStore } from '../../stores/projectStore';
import { useIssueStore } from '../../stores/issueStore';
import { useUiStore } from '../../stores/uiStore';
import { ApiClientError } from '../../api/client';

interface LabelEditorProps {
  issue: IssueDto;
}

export function LabelEditor({ issue }: LabelEditorProps) {
  const labels = useProjectStore((s) => s.labels);
  const updateIssueLabels = useIssueStore((s) => s.updateIssueLabels);
  const showError = useUiStore((s) => s.showError);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(
    new Set(issue.labels.map((l) => l.id))
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggleLabel = (labelId: string) => {
    const newSelected = new Set(selectedLabelIds);
    if (newSelected.has(labelId)) {
      newSelected.delete(labelId);
    } else {
      newSelected.add(labelId);
    }
    setSelectedLabelIds(newSelected);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateIssueLabels(issue.id, Array.from(selectedLabelIds));
    } catch (e) {
      const message =
        e instanceof ApiClientError ? e.message : 'Failed to update labels';
      showError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    selectedLabelIds.size !== issue.labels.length ||
    !issue.labels.every((l) => selectedLabelIds.has(l.id));

  if (labels.status === 'loading') {
    return <div className="text-gray-500 text-sm">Loading labels...</div>;
  }

  if (labels.status === 'error') {
    return <div className="text-red-500 text-sm">{labels.error}</div>;
  }

  if (labels.status !== 'success') {
    return null;
  }

  return (
    <div data-testid="label-editor">
      <div className="space-y-2">
        {labels.data.map((label) => (
          <label
            key={label.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedLabelIds.has(label.id)}
              onChange={() => toggleLabel(label.id)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span
              className="text-sm px-2 py-1 rounded"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          </label>
        ))}
      </div>

      {hasChanges && (
        <div className="flex justify-end mt-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="save-labels"
          >
            {isSaving ? 'Saving...' : 'Save Labels'}
          </button>
        </div>
      )}
    </div>
  );
}

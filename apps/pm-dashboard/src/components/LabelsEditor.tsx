import { LabelDto } from '../api/types';

type LabelsEditorProps = {
  labels: LabelDto[];
  selectedLabelIds: string[];
  onChange: (nextIds: string[]) => void;
};

export default function LabelsEditor({ labels, selectedLabelIds, onChange }: LabelsEditorProps) {
  if (labels.length === 0) {
    return <p className="text-sm text-[var(--ink-muted)]">No labels available.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => {
        const selected = selectedLabelIds.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => {
              const nextIds = selected
                ? selectedLabelIds.filter((id) => id !== label.id)
                : [...selectedLabelIds, label.id];
              onChange(nextIds);
            }}
            className="badge transition"
            style={{
              background: selected ? `${label.color}33` : `${label.color}1a`,
              color: label.color,
              border: `1px solid ${label.color}66`
            }}
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
}

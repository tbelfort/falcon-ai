import type { LabelDto } from '../api/types';

interface LabelPickerProps {
  labels: LabelDto[];
  selectedLabelIds: string[];
  onToggle: (labelId: string) => void;
}

export function LabelPicker({ labels, selectedLabelIds, onToggle }: LabelPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => {
        const selected = selectedLabelIds.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => onToggle(label.id)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              selected ? 'text-white' : 'text-ink-700'
            }`}
            style={{ backgroundColor: selected ? label.color : 'transparent', borderColor: label.color }}
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
}

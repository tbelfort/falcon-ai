import type { LabelDto } from '../types';

interface LabelPillProps {
  label: LabelDto;
}

export function LabelPill({ label }: LabelPillProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${label.color}22`, color: label.color }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  );
}

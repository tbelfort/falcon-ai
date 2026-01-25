import type { LabelDto } from '../api/types';

interface LabelPillProps {
  label: LabelDto;
}

const getTextColor = (hex: string) => {
  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 6) {
    return '#0f172a';
  }
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#f8fafc';
};

export function LabelPill({ label }: LabelPillProps) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium shadow-sm"
      style={{ backgroundColor: label.color, color: getTextColor(label.color) }}
    >
      {label.name}
    </span>
  );
}

import type { IssueStage } from '@/api/types';
import { getStageLabel, getStageTone } from '@/utils/stages';

interface StageBadgeProps {
  stage: IssueStage;
}

export function StageBadge({ stage }: StageBadgeProps) {
  const tone = getStageTone(stage);
  return (
    <span
      className="badge"
      style={{ backgroundColor: tone.bg, color: tone.text }}
    >
      {getStageLabel(stage)}
    </span>
  );
}

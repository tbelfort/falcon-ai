import { IssueStage } from '../api/types';
import { getStageColor, getStageLabel } from '../utils/stages';

type StageBadgeProps = {
  stage: IssueStage;
};

export default function StageBadge({ stage }: StageBadgeProps) {
  const color = getStageColor(stage);
  return (
    <span
      className="badge"
      style={{ background: `${color}22`, color: color, border: `1px solid ${color}55` }}
    >
      {getStageLabel(stage)}
    </span>
  );
}

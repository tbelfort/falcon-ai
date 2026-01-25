type AssignedAgentBadgeProps = {
  agentId: string;
};

export default function AssignedAgentBadge({ agentId }: AssignedAgentBadgeProps) {
  return (
    <span className="badge badge-muted">Agent: {agentId}</span>
  );
}

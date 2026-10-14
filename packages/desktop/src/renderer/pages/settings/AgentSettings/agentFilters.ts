import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

// ace:start agent filter tabs: split "unavailable" into missing + other
export type AgentAvailabilityFilter = 'all' | 'available' | 'missing' | 'other';

const isAgentAvailable = (agent: ManagedAgent): boolean => agent.status === 'online';

const isAgentMissing = (agent: ManagedAgent): boolean => agent.status === 'missing';

// Everything else: offline (including needs sign-in), unchecked, or no status yet.
const isAgentOther = (agent: ManagedAgent): boolean => !isAgentAvailable(agent) && !isAgentMissing(agent);

const FILTER_PREDICATES: Record<Exclude<AgentAvailabilityFilter, 'all'>, (agent: ManagedAgent) => boolean> = {
  available: isAgentAvailable,
  missing: isAgentMissing,
  other: isAgentOther,
};

export const getAgentAvailabilityFilterStats = (agents: ManagedAgent[]) => ({
  all: agents.length,
  available: agents.filter(isAgentAvailable).length,
  missing: agents.filter(isAgentMissing).length,
  other: agents.filter(isAgentOther).length,
});

export const filterAgentsByAvailability = (agents: ManagedAgent[], filter: AgentAvailabilityFilter): ManagedAgent[] =>
  filter === 'all' ? agents : agents.filter(FILTER_PREDICATES[filter]);
// ace:end

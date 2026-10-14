/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  filterAgentsByAvailability,
  getAgentAvailabilityFilterStats,
  type AgentAvailabilityFilter,
} from '@/renderer/pages/settings/AgentSettings/agentFilters';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

const agent = (id: string, status: ManagedAgent['status']): ManagedAgent =>
  ({
    id,
    name: id,
    agent_type: 'acp',
    agent_source: 'builtin',
    enabled: true,
    installed: status !== 'missing',
    status,
  }) as ManagedAgent;

// ace:start agent filter tabs: missing + other
describe('agent availability filters', () => {
  const agents = [
    agent('a', 'offline'),
    agent('b', 'online'),
    agent('c', 'missing'),
    agent('d', 'online'),
    agent('e', 'unchecked'),
    agent('f', undefined),
    agent('g', 'missing'),
  ];

  it('counts all, available, missing, and other agents', () => {
    expect(getAgentAvailabilityFilterStats(agents)).toEqual({
      all: 7,
      available: 2,
      missing: 2,
      other: 3,
    });
  });

  it('puts every agent in exactly one of available, missing, or other', () => {
    const stats = getAgentAvailabilityFilterStats(agents);
    expect(stats.available + stats.missing + stats.other).toBe(stats.all);
  });

  it.each<[AgentAvailabilityFilter, string[]]>([
    ['all', ['a', 'b', 'c', 'd', 'e', 'f', 'g']],
    ['available', ['b', 'd']],
    ['missing', ['c', 'g']],
    ['other', ['a', 'e', 'f']],
  ])('filters %s agents without changing relative order', (filter, expectedIds) => {
    expect(filterAgentsByAvailability(agents, filter).map((item) => item.id)).toEqual(expectedIds);
  });

  it('reports zero other agents when every agent is online or missing', () => {
    const settled = [agent('a', 'online'), agent('b', 'missing')];
    expect(getAgentAvailabilityFilterStats(settled).other).toBe(0);
    expect(filterAgentsByAvailability(settled, 'other')).toEqual([]);
  });
});
// ace:end

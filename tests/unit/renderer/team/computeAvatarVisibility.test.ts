import { describe, expect, it } from 'vitest';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import { computeAvatarVisibility } from '@/renderer/pages/team/components/avatarBar/MemberAvatarStrip';

const makeAssistant = (slot_id: string): TeamAssistant => ({
  slot_id,
  conversation_id: `conv-${slot_id}`,
  role: slot_id === 'lead' ? 'leader' : 'teammate',
  assistant_backend: 'claude',
  assistant_name: slot_id,
  status: 'idle',
});

describe('computeAvatarVisibility', () => {
  it('keeps every member visible when there is enough room', () => {
    const assistants = [makeAssistant('lead'), makeAssistant('a'), makeAssistant('b')];
    const result = computeAvatarVisibility(assistants, 'lead', 5);

    expect(result.visible.map((a) => a.slot_id)).toEqual(['lead', 'a', 'b']);
    expect(result.collapsedCount).toBe(0);
  });

  it('collapses overflow and keeps the active member visible when it is inside the window', () => {
    const assistants = [makeAssistant('lead'), makeAssistant('a'), makeAssistant('b'), makeAssistant('c')];
    // maxVisible 2 → window 1 + one active slot; active (lead) is already at index 0.
    const result = computeAvatarVisibility(assistants, 'lead', 2);

    expect(result.visible.map((a) => a.slot_id)).toEqual(['lead', 'a']);
    expect(result.collapsedCount).toBe(2);
  });

  it('keeps the active member visible even when it is beyond the window', () => {
    const assistants = [makeAssistant('lead'), makeAssistant('a'), makeAssistant('b'), makeAssistant('c')];
    // Active is 'c' (index 3), beyond the window of 1 → it replaces the last visible slot.
    const result = computeAvatarVisibility(assistants, 'c', 2);

    expect(result.visible.map((a) => a.slot_id)).toEqual(['lead', 'c']);
    expect(result.collapsedCount).toBe(2);
  });

  it('never collapses below one visible member', () => {
    const assistants = [makeAssistant('lead'), makeAssistant('a'), makeAssistant('b')];
    const result = computeAvatarVisibility(assistants, 'b', 1);

    expect(result.visible.map((a) => a.slot_id)).toEqual(['b']);
    expect(result.collapsedCount).toBe(2);
  });
});

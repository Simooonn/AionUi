import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import {
  conversationDeleted,
  getConversationRuntimeViewSnapshot,
  getProcessingStartedAt,
  hydrateSucceeded,
  localSendAccepted,
  localSendStarted,
  localStopAcknowledged,
  localStopRequested,
  resetConversationRuntimeViewStoreForTest,
  syncProcessingStartedAt,
  turnCompleted,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';

const idleRuntime = (): TConversationRuntimeSummary => ({
  state: 'idle',
  can_send_message: true,
  has_task: true,
  task_status: 'finished',
  is_processing: false,
  pending_confirmations: 0,
  turn_id: null,
});

const runningRuntime = (turn_id: string): TConversationRuntimeSummary => ({
  state: 'running',
  can_send_message: false,
  has_task: true,
  task_status: 'running',
  is_processing: true,
  pending_confirmations: 0,
  turn_id,
});

const cancellingRuntime = (turn_id: string): TConversationRuntimeSummary => ({
  state: 'cancelling',
  can_send_message: true,
  has_task: true,
  task_status: 'running',
  is_processing: false,
  pending_confirmations: 0,
  turn_id,
});

describe('conversationRuntimeViewStore turn id contract', () => {
  beforeEach(() => {
    resetConversationRuntimeViewStoreForTest();
  });

  it('keeps idle when turn.completed arrives before local send accepted', () => {
    localSendStarted('conv-1');
    turnCompleted('conv-1', 'turn-1', idleRuntime());
    localSendAccepted('conv-1', 'turn-1', runningRuntime('turn-1'), 'msg-1');

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.state).toBe('idle');
    expect(view.isProcessing).toBe(false);
    expect(view.canSendMessage).toBe(true);
    expect(view.localSubmitting).toBe(false);
    expect(view.activeTurnId).toBeNull();
  });

  it('keeps idle when a stale running hydrate arrives after turn.completed', () => {
    localSendStarted('conv-1');
    localSendAccepted('conv-1', 'turn-1', runningRuntime('turn-1'), 'msg-1');
    turnCompleted('conv-1', 'turn-1', idleRuntime());
    const logs = hydrateSucceeded('conv-1', runningRuntime('turn-1'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.state).toBe('idle');
    expect(view.isProcessing).toBe(false);
    expect(view.canSendMessage).toBe(true);
    expect(view.activeTurnId).toBeNull();
    expect(logs[0]).toMatchObject({
      event: 'runtime_hydrated',
      data: {
        stale_after_completed: true,
        source: 'hydrate',
      },
    });
  });

  it('keeps idle when a stale stop acknowledgement arrives after turn.completed', () => {
    hydrateSucceeded('conv-1', runningRuntime('turn-1'));
    localStopRequested('conv-1', 'turn-1');
    turnCompleted('conv-1', 'turn-1', idleRuntime());
    const logs = localStopAcknowledged('conv-1', 'turn-1', runningRuntime('turn-1'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.state).toBe('idle');
    expect(view.isProcessing).toBe(false);
    expect(view.canSendMessage).toBe(true);
    expect(view.localStopping).toBe(false);
    expect(view.activeTurnId).toBeNull();
    expect(logs[0]).toMatchObject({
      event: 'local_stop_acknowledged',
      data: {
        stale_after_completed: true,
        source: 'stop_response',
      },
    });
  });

  it('uses send response runtime summary as authoritative active turn', () => {
    localSendStarted('conv-1');
    localSendAccepted('conv-1', 'turn-1', runningRuntime('turn-1'), 'msg-1');

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.state).toBe('running');
    expect(view.isProcessing).toBe(true);
    expect(view.canSendMessage).toBe(false);
    expect(view.localSubmitting).toBe(false);
    expect(view.activeTurnId).toBe('turn-1');
  });

  it('keeps cancelling runtime gated from new sends', () => {
    hydrateSucceeded('conv-1', cancellingRuntime('turn-cancel'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.state).toBe('cancelling');
    expect(view.isProcessing).toBe(true);
    expect(view.canSendMessage).toBe(false);
    expect(view.activeTurnId).toBe('turn-cancel');
  });

  it('ignores stale stop ack for an older turn', () => {
    hydrateSucceeded('conv-1', runningRuntime('turn-2'));
    localStopRequested('conv-1', 'turn-1');
    localStopAcknowledged('conv-1', 'turn-1', runningRuntime('turn-2'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.activeTurnId).toBe('turn-2');
    expect(view.isProcessing).toBe(true);
    expect(view.localStopping).toBe(false);
  });

  it('uses cancel response runtime summary as authoritative state', () => {
    hydrateSucceeded('conv-1', runningRuntime('turn-1'));
    localStopRequested('conv-1', 'turn-1');
    localStopAcknowledged('conv-1', 'turn-1', runningRuntime('turn-2'));

    const view = getConversationRuntimeViewSnapshot('conv-1');
    expect(view.activeTurnId).toBe('turn-2');
    expect(view.isProcessing).toBe(true);
    expect(view.localStopping).toBe(false);
  });
});

describe('conversationRuntimeViewStore processing start time', () => {
  beforeEach(() => {
    resetConversationRuntimeViewStoreForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null and clears the record when not processing', () => {
    syncProcessingStartedAt('conv-1', true, 'turn-1');
    expect(getProcessingStartedAt('conv-1')).not.toBeNull();

    expect(syncProcessingStartedAt('conv-1', false, null)).toBeNull();
    expect(getProcessingStartedAt('conv-1')).toBeNull();
  });

  it('keeps a stable start time across remounts within the same run', () => {
    const first = syncProcessingStartedAt('conv-1', true, 'turn-1');
    vi.advanceTimersByTime(5000);
    // Simulates switching away and back: the run is unchanged, so the timer
    // must keep its original anchor instead of restarting from zero.
    const later = syncProcessingStartedAt('conv-1', true, 'turn-1');
    expect(later).toBe(first);
  });

  it('keeps the original start when a pending run gets its backend turn id', () => {
    const pending = syncProcessingStartedAt('conv-1', true, null);
    vi.advanceTimersByTime(3000);
    const assigned = syncProcessingStartedAt('conv-1', true, 'turn-1');
    expect(assigned).toBe(pending);
  });

  it('resets the start time when a new turn begins', () => {
    const first = syncProcessingStartedAt('conv-1', true, 'turn-1');
    vi.advanceTimersByTime(10000);
    const second = syncProcessingStartedAt('conv-1', true, 'turn-2');
    expect(second).toBeGreaterThan(first ?? 0);
  });

  it('clears the processing start when the conversation is deleted', () => {
    syncProcessingStartedAt('conv-1', true, 'turn-1');
    conversationDeleted('conv-1');
    expect(getProcessingStartedAt('conv-1')).toBeNull();
  });
});

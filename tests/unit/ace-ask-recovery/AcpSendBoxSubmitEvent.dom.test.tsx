import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSendBoxSubmitListener } from '@/renderer/ace/askRecovery/useSendBoxSubmitListener';
import { emitter } from '@/renderer/utils/emitter';

const makeProps = () => ({
  conversation_id: 'active',
  executeCommand: vi
    .fn<Parameters<typeof useSendBoxSubmitListener>[0]['executeCommand']>()
    .mockResolvedValue(undefined),
  supportsMidturnDelivery: false,
  isBusy: false,
  t: vi.fn(() => 'Cannot resend right now'),
});

const makeRequest = (conversation_id = 'active') => ({
  conversation_id,
  input: 'Recovered answer',
  ack: vi.fn(),
  resolve: vi.fn(),
  reject: vi.fn(),
});

afterEach(cleanup);

describe('programmatic SendBox submission', () => {
  it('acknowledges receipt but blocks a busy agent without mid-turn delivery', () => {
    const props = { ...makeProps(), isBusy: true };
    renderHook(() => useSendBoxSubmitListener(props));
    const request = makeRequest();

    emitter.emit('sendbox.submit', request);

    expect(request.ack).toHaveBeenCalledOnce();
    expect(request.reject).toHaveBeenCalledWith(new Error('Cannot resend right now'));
    expect(props.executeCommand).not.toHaveBeenCalled();
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('acknowledges before executing and resolves only after the command settles', async () => {
    const props = makeProps();
    const order: string[] = [];
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    props.executeCommand.mockImplementation(() => {
      order.push('execute');
      return pending;
    });
    renderHook(() => useSendBoxSubmitListener(props));
    const request = makeRequest();
    request.ack.mockImplementation(() => {
      order.push('ack');
    });
    request.resolve.mockImplementation(() => {
      order.push('resolve');
    });

    emitter.emit('sendbox.submit', request);

    expect(order).toEqual(['ack', 'execute']);
    expect(props.executeCommand).toHaveBeenCalledWith({ input: request.input, files: [], sessions: undefined });
    finish();
    await pending;
    expect(order).toEqual(['ack', 'execute', 'resolve']);
    expect(request.reject).not.toHaveBeenCalled();
  });

  it('ignores submissions addressed to a different conversation', () => {
    const props = makeProps();
    renderHook(() => useSendBoxSubmitListener(props));
    const request = makeRequest('other');

    emitter.emit('sendbox.submit', request);

    for (const callback of [request.ack, request.resolve, request.reject, props.executeCommand]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });

  it('uses the new command function after rerendering', async () => {
    const props = makeProps();
    const { rerender } = renderHook(useSendBoxSubmitListener, { initialProps: props });
    const nextProps = makeProps();
    rerender(nextProps);
    const request = makeRequest();

    emitter.emit('sendbox.submit', request);
    await Promise.resolve();

    expect(props.executeCommand).not.toHaveBeenCalled();
    expect(nextProps.executeCommand).toHaveBeenCalledOnce();
    expect(request.resolve).toHaveBeenCalledOnce();
  });

  it('rejects with the command failure rather than reporting success', async () => {
    const props = makeProps();
    const error = new Error('Send failed');
    props.executeCommand.mockRejectedValue(error);
    renderHook(() => useSendBoxSubmitListener(props));
    const request = makeRequest();

    emitter.emit('sendbox.submit', request);
    await Promise.resolve();

    expect(request.ack).toHaveBeenCalledOnce();
    expect(request.reject).toHaveBeenCalledWith(error);
    expect(request.resolve).not.toHaveBeenCalled();
  });

  it('allows a busy agent that supports mid-turn delivery to send', async () => {
    const props = { ...makeProps(), isBusy: true, supportsMidturnDelivery: true };
    renderHook(() => useSendBoxSubmitListener(props));
    const request = makeRequest();

    emitter.emit('sendbox.submit', request);
    await Promise.resolve();

    expect(props.executeCommand).toHaveBeenCalledOnce();
    expect(request.resolve).toHaveBeenCalledOnce();
    expect(request.reject).not.toHaveBeenCalled();
  });

  it('stops listening after unmounting', () => {
    const props = makeProps();
    const { unmount } = renderHook(() => useSendBoxSubmitListener(props));
    unmount();
    const request = makeRequest();

    emitter.emit('sendbox.submit', request);

    expect(request.ack).not.toHaveBeenCalled();
    expect(props.executeCommand).not.toHaveBeenCalled();
  });
});

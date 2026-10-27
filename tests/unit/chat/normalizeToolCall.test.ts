/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeAcpToolCall, normalizeToolCall } from '@/common/chat/normalizeToolCall';
import { describe, expect, it } from 'vitest';

describe('normalizeAcpToolCall', () => {
  it('preserves generated image paths for grouped tool summaries', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Revised prompt: 一张小猫照片',
              },
            },
          ],
        },
      },
    };

    const normalized = normalizeAcpToolCall(message);

    expect((normalized as { imagePath?: string } | undefined)?.imagePath).toBe(
      '/Users/test/.codex/generated_images/session/ig_test_image.png'
    );
  });
});

describe('normalizeToolCall image output', () => {
  const toolCall = (content: Partial<IMessageToolCall['content']>): IMessageToolCall => ({
    id: 'exec-1',
    conversation_id: 'conv-1',
    type: 'tool_call',
    content: { call_id: 'exec-1', name: 'imageGeneration', args: {}, status: 'completed', ...content },
  });

  it('carries the persisted image path as imagePath', () => {
    const normalized = normalizeToolCall(toolCall({ image: { path: '/w/gen.png', mime_type: 'image/png' } }));
    expect(normalized?.imagePath).toBe('/w/gen.png');
  });

  it('leaves imagePath undefined when the row has no image', () => {
    expect(normalizeToolCall(toolCall({}))?.imagePath).toBeUndefined();
  });
});

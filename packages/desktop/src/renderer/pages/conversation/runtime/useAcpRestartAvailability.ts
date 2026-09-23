/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ace: the ACP conversation header no longer mounts AcpModelSelector (model and
// thought-level controls live in the sendbox toolbar), so the restart button can
// no longer learn runtime readiness from the selector's callback. Read it from
// the runtime config options directly — the same signal the selector used.

import type { TChatConversation } from '@/common/config/storage';
import type { RuntimeRestartAvailability } from '@/renderer/components/agent/AcpRuntimeRestartButton';
import { useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';

/**
 * Availability of the header "restart runtime" button for an ACP conversation.
 *
 * Only ACP conversations render the button, so the config-options subscription
 * is enabled for them alone; other types report `initializing` without ever
 * touching the runtime. The underlying fetch is deduplicated per conversation,
 * so this does not start a second runtime next to the sendbox's own hook.
 */
export function useAcpRestartAvailability(conversation: TChatConversation | undefined): RuntimeRestartAvailability {
  const isAcp = conversation?.type === 'acp';
  const runtimeConfig = useAcpConfigOptions({
    conversation_id: conversation?.id ?? '',
    enabled: isAcp,
  });
  return isAcp && runtimeConfig.isRuntimeReady ? 'ready' : 'initializing';
}

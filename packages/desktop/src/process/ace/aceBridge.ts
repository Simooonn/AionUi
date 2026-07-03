/**
 * Self-registering IPC handler for the "import CLI sessions" fork feature.
 * Registered by a side-effect import from process/bridge/index.ts.
 */

import { ipcMain } from 'electron';
import type {
  AceLarkNotifyConfig,
  AceLarkNotifyMaskedConfig,
  AceLarkNotifySaveConfig,
  EnsureCliResumeResult,
  ImportCliSessionsResult,
  ImportConversationMessagesResult,
  LarkNotifyRow,
  LarkNotifyStatus,
} from '@/common/ace/types';
import { LARK_NOTIFY_STATUS_WEIGHT } from '@/common/ace/types';
import { LARK_NOTIFY_SUMMARY_INPUT_CAP } from '@/common/ace/larkNotify';
import { ProcessConfig } from '@process/utils/initStorage';
import { getTenantToken, resetLarkTokenCache, sendLarkNotification, sendLarkText } from './larkNotifySender';
import { importCliSessions, scanCliSessions } from './importCliSessions';
import { importConversationMessages } from './messageImporter';
import {
  checkWorkspacesExist,
  deleteOpencodeSessions,
  resolveConversationFiles,
  resolveConversationMessageCounts,
  resolveResumeCommands,
  unlinkSessionFiles,
} from './sessionFiles';
import { ensureCliSessionResumable } from './sessionResume';
import { readHudStatusline, type HudStatuslineParams, type HudStatuslineResult } from './hudStatusline';

// HUD statusline for the normal ACP chat view: synthesize the statusline
// stdin from conversation data and run the user's configured statusLine
// command (see hudStatusline.ts). Null → the renderer hides the bar.
ipcMain.handle('ace:hud-statusline', async (_event, rawParams: unknown): Promise<HudStatuslineResult> => {
  try {
    const p = (rawParams ?? {}) as Partial<HudStatuslineParams>;
    if (typeof p.workspace !== 'string' || !p.workspace) return null;
    return await readHudStatusline({
      workspace: p.workspace,
      conversationId: typeof p.conversationId === 'string' ? p.conversationId : undefined,
      modelId: typeof p.modelId === 'string' ? p.modelId : undefined,
      modelLabel: typeof p.modelLabel === 'string' ? p.modelLabel : undefined,
    });
  } catch {
    return null;
  }
});

ipcMain.handle('ace:import-cli-sessions', async (): Promise<ImportCliSessionsResult> => {
  try {
    return await importCliSessions();
  } catch (e) {
    return { imported: 0, skipped: 0, failed: 0, errors: [e instanceof Error ? e.message : String(e)] };
  }
});

// Dry-run scan behind the pre-import confirmation dialog; null → scan failed.
ipcMain.handle('ace:scan-cli-sessions', async () => {
  try {
    return await scanCliSessions();
  } catch {
    return null;
  }
});

// Defense-in-depth: aioncore conversation ids are short hex slugs; reject
// anything outside a safe charset before it reaches SQL/registry lookups
// (all SQL is parameterized — this only hardens against future regressions).
function isSafeConversationId(id: unknown): id is string {
  return typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
}

ipcMain.handle(
  'ace:import-conversation-messages',
  async (_event, conversationId: string): Promise<ImportConversationMessagesResult> => {
    if (!isSafeConversationId(conversationId)) return { imported: 0, skipped: 0, unmapped: 0 };
    try {
      return await importConversationMessages(conversationId);
    } catch {
      return { imported: 0, skipped: 0, unmapped: 0 };
    }
  }
);

ipcMain.handle('ace:ensure-cli-resume', async (_event, conversationId: string): Promise<EnsureCliResumeResult> => {
  if (!isSafeConversationId(conversationId)) return { resumable: false, reason: 'error' };
  try {
    return await ensureCliSessionResumable(conversationId);
  } catch {
    return { resumable: false, reason: 'error' };
  }
});

// Resolve on-disk session file paths (called before DB delete); ids gated.
ipcMain.handle('ace:resolve-conversation-files', async (_event, ids: string[]) => {
  try {
    const safe = Array.isArray(ids) ? ids.filter((id) => isSafeConversationId(id)) : [];
    return await resolveConversationFiles(safe);
  } catch {
    return {};
  }
});

// Resolve copyable terminal resume commands (e.g. `claude --resume <id>`) for
// app-created ACP sessions, whose CLI session id only lives in acp_session.
ipcMain.handle('ace:resolve-resume-commands', async (_event, ids: string[]) => {
  try {
    const safe = Array.isArray(ids) ? ids.filter((id) => isSafeConversationId(id)) : [];
    return await resolveResumeCommands(safe);
  } catch {
    return {};
  }
});

// Delete on-disk session files (paths confined to CLI roots inside the impl).
ipcMain.handle('ace:unlink-session-files', async (_event, paths: string[]) => {
  try {
    return await unlinkSessionFiles(Array.isArray(paths) ? paths : []);
  } catch {
    return {};
  }
});

// Controlled opencode session-row delete (db path hardcoded + id shape gated inside).
ipcMain.handle('ace:delete-opencode-sessions', async (_event, sessionIds: string[]) => {
  const ids = Array.isArray(sessionIds) ? sessionIds : [];
  try {
    return await deleteOpencodeSessions(ids);
  } catch {
    // Per-id failure (not {}) so the renderer's fileDeleteFailed flag still fires.
    return Object.fromEntries(ids.map((id) => [String(id), { deleted: false, reason: 'delete-failed' }]));
  }
});

// Authoritative message counts (the cursor-based messages API has no total).
ipcMain.handle('ace:message-counts', async (_event, ids: unknown) => {
  try {
    const safe = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    return await resolveConversationMessageCounts(safe);
  } catch {
    return {};
  }
});

// Workspace existence map for sidebar gray-out.
ipcMain.handle('ace:check-workspaces-exist', async (_event, paths: string[]) => {
  try {
    return checkWorkspacesExist(Array.isArray(paths) ? paths : []);
  } catch {
    return {};
  }
});

// ---------------------------------------------------------------------------
// Lark group notification — credentials live ONLY in main-process ProcessConfig
// (the renderer's regular config channel round-trips through aioncore HTTP,
// which must never see the app_secret).
// ---------------------------------------------------------------------------

// The config key is intentionally NOT registered in IConfigStorageRefer /
// ConfigKeyMap: that would make it reachable (and compiling) through the
// renderer's ConfigStorage/configService, whose write path round-trips
// through aioncore. This narrowed accessor is the ONLY typed surface.
const LarkConfigStore = ProcessConfig as unknown as {
  get(key: 'ace.larkNotify.config'): Promise<AceLarkNotifyConfig | undefined>;
  set(key: 'ace.larkNotify.config', value: AceLarkNotifyConfig): Promise<void>;
};

const readLarkNotifyConfig = async (): Promise<AceLarkNotifyConfig | undefined> => {
  const config = await LarkConfigStore.get('ace.larkNotify.config');
  if (!config || typeof config !== 'object') return undefined;
  return config;
};

/** Charset gates for Lark identifiers (no prototype keys, no URL surprises). */
const SAFE_LARK_ID = /^[\w.\-:@]{1,128}$/;

const MAX_IPC_ROWS = 60; // 2× render cap — anything beyond is a misbehaving caller
const MAX_TEXT_FIELD = 512;

/** Re-validate renderer-supplied rows at the trust boundary (type, enum, size). */
const sanitizeLarkRows = (raw: unknown): LarkNotifyRow[] => {
  if (!Array.isArray(raw)) return [];
  const out: LarkNotifyRow[] = [];
  for (const item of raw.slice(0, MAX_IPC_ROWS)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const status = o.status as LarkNotifyStatus;
    if (!(status in LARK_NOTIFY_STATUS_WEIGHT)) continue;
    const msg = o.last_user_message as { id?: unknown; text?: unknown } | null | undefined;
    out.push({
      conversation_id: String(o.conversation_id ?? '').slice(0, 64),
      name: String(o.name ?? '').slice(0, MAX_TEXT_FIELD),
      backend: String(o.backend ?? '').slice(0, 64),
      workspace: String(o.workspace ?? '').slice(0, MAX_TEXT_FIELD),
      activity_time: typeof o.activity_time === 'number' ? o.activity_time : 0,
      total: typeof o.total === 'number' ? o.total : null,
      status,
      last_user_message:
        msg && typeof msg.id === 'string' && typeof msg.text === 'string'
          ? { id: msg.id.slice(0, 128), text: msg.text.slice(0, LARK_NOTIFY_SUMMARY_INPUT_CAP) }
          : null,
    });
  }
  return out;
};

const isLarkNotifyConfigComplete = (config: AceLarkNotifyConfig | undefined): config is AceLarkNotifyConfig => {
  return Boolean(config && config.enabled && config.app_id && config.app_secret && config.chat_id);
};

ipcMain.handle('ace:lark-notify-get-config', async (): Promise<AceLarkNotifyMaskedConfig> => {
  const config = await readLarkNotifyConfig().catch((): undefined => undefined);
  return {
    enabled: config?.enabled === true,
    app_id: config?.app_id ?? '',
    chat_id: config?.chat_id ?? '',
    domain: config?.domain === 'lark' ? 'lark' : 'feishu',
    summary_provider: config?.summary_provider,
    has_secret: Boolean(config?.app_secret),
  };
});

ipcMain.handle('ace:lark-notify-save-config', async (_event, incoming: AceLarkNotifySaveConfig) => {
  try {
    if (!incoming || typeof incoming !== 'object') return { ok: false };
    const existing = await readLarkNotifyConfig().catch((): undefined => undefined);
    const next: AceLarkNotifyConfig = {
      enabled: incoming.enabled === true,
      app_id: typeof incoming.app_id === 'string' ? incoming.app_id.trim() : '',
      // Empty incoming secret means "keep the stored one" (the renderer never sees it back)
      app_secret:
        typeof incoming.app_secret === 'string' && incoming.app_secret.trim()
          ? incoming.app_secret.trim()
          : (existing?.app_secret ?? ''),
      chat_id: typeof incoming.chat_id === 'string' ? incoming.chat_id.trim() : '',
      // Enum gate: anything other than the literal 'lark' falls back to feishu
      domain: incoming.domain === 'lark' ? 'lark' : 'feishu',
      summary_provider:
        incoming.summary_provider &&
        typeof incoming.summary_provider.id === 'string' &&
        SAFE_LARK_ID.test(incoming.summary_provider.id) &&
        typeof incoming.summary_provider.use_model === 'string' &&
        incoming.summary_provider.use_model.length <= 128
          ? { id: incoming.summary_provider.id, use_model: incoming.summary_provider.use_model }
          : undefined,
    };
    // Identifier charset gate (rejects prototype keys / malformed ids early)
    if (next.app_id && !SAFE_LARK_ID.test(next.app_id)) return { ok: false };
    if (next.chat_id && !SAFE_LARK_ID.test(next.chat_id)) return { ok: false };
    await LarkConfigStore.set('ace.larkNotify.config', next);
    // Credentials or platform changed → drop the cached tenant token immediately
    if (
      next.app_id !== existing?.app_id ||
      next.app_secret !== existing?.app_secret ||
      next.domain !== (existing?.domain ?? 'feishu')
    ) {
      resetLarkTokenCache();
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('ace:lark-notify-test', async (): Promise<{ ok: boolean; reason?: string }> => {
  try {
    const config = await readLarkNotifyConfig();
    if (!config?.app_id || !config.app_secret || !config.chat_id) {
      return { ok: false, reason: 'incomplete-config' };
    }
    const token = await getTenantToken(config, { force: true });
    if (!token) return { ok: false, reason: 'token-unavailable' };
    return await sendLarkText(config, 'AionUi Lark 通知测试消息 ✅');
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'error' };
  }
});

ipcMain.handle('ace:lark-notify-send', async (_event, rows: unknown): Promise<{ ok: boolean; reason?: string }> => {
  try {
    const config = await readLarkNotifyConfig();
    if (!isLarkNotifyConfigComplete(config)) return { ok: false, reason: 'disabled' };
    return await sendLarkNotification(config, sanitizeLarkRows(rows));
  } catch (e) {
    console.warn('[larkNotify] send handler error:', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'error' };
  }
});

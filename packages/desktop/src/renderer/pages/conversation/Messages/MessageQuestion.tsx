/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ace:start ask answer recovery (submit strategy replaces the direct answerAsk call)
import {
  ASK_ANSWER_FAILED_ERROR,
  submitAskAnswer,
  type SubmitAskAnswerInput,
} from '@/renderer/ace/askRecovery/submitAskAnswer';
import { Attention } from '@icon-park/react';
// ace:end
import type { IAskQuestion, IMessageAsk } from '@/common/chat/chatLib';
import { Button, Card, Checkbox, Input, Radio } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
// The permission panel's stylesheet supplies the shared card chrome; own.* adds
// the question-specific pieces (option rows with secondary description lines),
// built on the same tokens so the two cards read as siblings (user feedback,
// 2026-08-04: same style family, and long text must wrap instead of clipping).
import styles from './components/MessagePermission/PermissionRequestPanel.module.css';
import own from './MessageQuestion.module.css';

const OTHER_VALUE = '__aionui_other__';

type MessageQuestionProps = {
  message: IMessageAsk;
};

type Draft = {
  /** selected option labels (multiSelect keeps several; single keeps one) */
  labels: string[];
  /** free text when the Other row is selected */
  other: string;
  otherSelected: boolean;
};

const emptyDraft = (): Draft => ({ labels: [], other: '', otherSelected: false });

/**
 * Structured question card (`ask` frame — claude AskUserQuestion).
 *
 * One submit answers EVERY question at once: claude silently DROPS unanswered
 * questions on an allow (it does not re-ask — live 2.1.178), so per-question
 * submission would be silent data loss. Submit stays disabled until every
 * question has an answer; dismiss sends an explicit decline (a deny on the
 * wire), never an empty allow.
 */
const MessageQuestion: React.FC<MessageQuestionProps> = React.memo(({ message }) => {
  const { t } = useTranslation();
  const content = message.content || ({} as IMessageAsk['content']);
  const questions = useMemo<IAskQuestion[]>(
    () => (Array.isArray(content.questions) ? content.questions : []),
    [content.questions]
  );
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(emptyDraft));
  // ace:start ask answer recovery state ('resent' = the answer went out as a chat message)
  const [submitted, setSubmitted] = useState<'answered' | 'declined' | 'resent' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{
    input: SubmitAskAnswerInput;
    outcome: 'answered' | 'declined';
  } | null>(null);
  // ace:end

  const updateDraft = useCallback((index: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }, []);

  const answered = (d: Draft) => d.labels.length > 0 || (d.otherSelected && d.other.trim().length > 0);
  const allAnswered = questions.length > 0 && drafts.every(answered);

  const requestId = content.request_id || message.id;

  // ace:start ask answer recovery: both actions go through submitAskAnswer, which
  // falls back to resending the answer as a chat message when the process is gone
  const runSubmit = useCallback(
    async (input: SubmitAskAnswerInput, outcome: 'answered' | 'declined') => {
      setLastAttempt({ input, outcome });
      setSubmitting(true);
      setFailure(null);
      try {
        const result = await submitAskAnswer(input);
        setSubmitted(result.via === 'message' ? 'resent' : outcome);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const alreadyWrapped = error instanceof Error && error.name === ASK_ANSWER_FAILED_ERROR;
        setFailure(alreadyWrapped ? reason : t('messages.askAnswerFailed', { reason }));
      } finally {
        setSubmitting(false);
      }
    },
    [t]
  );

  const handleSubmit = useCallback(async () => {
    // claude keys its answers map by the question TEXT; a multi-select answer
    // is an array of labels (claude joins with ", "). Other-text rides as a
    // plain label — claude accepts arbitrary answer strings. Sent over the
    // DEDICATED ask channel, not the permission confirm endpoint.
    const answers = questions.map((q, i) => {
      const d = drafts[i];
      const labels = [...d.labels];
      if (d.otherSelected && d.other.trim()) labels.push(d.other.trim());
      return { question: q.question, labels };
    });
    await runSubmit(
      { conversation_id: message.conversation_id, request_id: requestId, questions, answers, source: content.source },
      'answered'
    );
  }, [drafts, questions, message.conversation_id, requestId, content.source, runSubmit]);

  const handleDecline = useCallback(async () => {
    await runSubmit(
      {
        conversation_id: message.conversation_id,
        request_id: requestId,
        questions,
        decline: true,
        source: content.source,
      },
      'declined'
    );
  }, [questions, message.conversation_id, requestId, content.source, runSubmit]);

  const handleRetry = useCallback(() => {
    if (lastAttempt) void runSubmit(lastAttempt.input, lastAttempt.outcome);
  }, [lastAttempt, runSubmit]);

  const handleResendAsMessage = useCallback(() => {
    if (lastAttempt) void runSubmit({ ...lastAttempt.input, force: 'message' }, lastAttempt.outcome);
  }, [lastAttempt, runSubmit]);
  // ace:end

  if (!questions.length) return null;

  return (
    <Card className={styles.card} bordered={false} data-testid='message-question'>
      <div className={styles.panel}>
        {/* ace:start history-derived card: the original process is gone */}
        {content.source === 'history' ? (
          <div className={own.staleHint} data-testid='message-question-stale-hint'>
            {t('messages.askStaleHint')}
          </div>
        ) : null}
        {/* ace:end */}
        {questions.map((q, qi) => {
          const d = drafts[qi] ?? emptyDraft();
          // Wire spelling is multi_select (the ws relay snake_cases all keys).
          const multi = q.multiSelect === true || q.multi_select === true;
          return (
            <div key={qi} className={own.questionBlock} data-testid={`message-question-item-${qi}`}>
              {q.header ? <div className={own.header}>{q.header}</div> : null}
              <div className={own.question}>{q.question}</div>
              {multi ? (
                <Checkbox.Group
                  className={own.optionList}
                  value={d.labels}
                  onChange={(labels) => updateDraft(qi, { labels: labels as string[] })}
                  disabled={submitted !== null}
                >
                  {q.options.map((opt) => (
                    <Checkbox
                      key={opt.label}
                      className={own.optionRow}
                      value={opt.label}
                      data-testid={`message-question-option-${qi}-${opt.label}`}
                    >
                      <span className={own.optionText}>
                        <span className={own.optionLabel}>{opt.label}</span>
                        {opt.description ? <span className={own.optionDesc}>{opt.description}</span> : null}
                      </span>
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              ) : (
                <Radio.Group
                  className={own.optionList}
                  value={d.otherSelected ? OTHER_VALUE : d.labels[0]}
                  onChange={(value) =>
                    value === OTHER_VALUE
                      ? updateDraft(qi, { labels: [], otherSelected: true })
                      : updateDraft(qi, { labels: [value], otherSelected: false })
                  }
                  disabled={submitted !== null}
                >
                  {q.options.map((opt) => (
                    <Radio
                      key={opt.label}
                      className={own.optionRow}
                      value={opt.label}
                      data-testid={`message-question-option-${qi}-${opt.label}`}
                    >
                      <span className={own.optionText}>
                        <span className={own.optionLabel}>{opt.label}</span>
                        {opt.description ? <span className={own.optionDesc}>{opt.description}</span> : null}
                      </span>
                    </Radio>
                  ))}
                  <Radio
                    className={own.optionRow}
                    value={OTHER_VALUE}
                    data-testid={`message-question-option-${qi}-other`}
                  >
                    <span className={own.optionText}>
                      <span className={own.optionLabel}>{t('messages.askOther')}</span>
                    </span>
                  </Radio>
                  {d.otherSelected ? (
                    <Input
                      className={own.otherInput}
                      placeholder={t('messages.askOtherPlaceholder')}
                      value={d.other}
                      onChange={(v) => updateDraft(qi, { other: v })}
                      disabled={submitted !== null}
                      data-testid={`message-question-other-input-${qi}`}
                    />
                  ) : null}
                </Radio.Group>
              )}
            </div>
          );
        })}
        {submitted === null ? (
          // Plain Arco buttons on purpose: styles.optionButton resets the button
          // chrome to a transparent full-width list row (for permission option
          // lists), which turned the primary submit into white-on-white.
          <div className={own.actions}>
            <Button
              type='primary'
              size='small'
              // ace:start lock both actions while a submit is in flight
              disabled={!allAnswered || submitting}
              // ace:end
              onClick={handleSubmit}
              data-testid='message-question-submit'
            >
              {t('messages.askSubmit')}
            </Button>
            <Button
              size='small'
              // ace:start lock both actions while a submit is in flight
              disabled={submitting}
              // ace:end
              onClick={handleDecline}
              data-testid='message-question-decline'
            >
              {t('messages.askDecline')}
            </Button>
          </div>
        ) : (
          <div
            className={`${styles.feedback} ${styles.success}`}
            role='status'
            aria-live='polite'
            data-testid='message-question-status'
          >
            <CheckOne theme='outline' size='16' aria-hidden='true' />
            {/* ace:start resent-as-message status */}
            <span>
              {submitted === 'resent' && t('messages.askResent')}
              {submitted === 'answered' && t('messages.askAnswered')}
              {submitted === 'declined' && t('messages.askDeclined')}
            </span>
            {/* ace:end */}
          </div>
        )}
        {/* ace:start submit failure: retry the same submit or resend it as a chat message */}
        {submitted === null && failure !== null ? (
          <div
            className={`${styles.feedback} ${styles.error} ${own.failure}`}
            role='alert'
            aria-live='assertive'
            data-testid='message-question-error'
          >
            <div className={own.failureText}>
              <Attention theme='outline' size='16' aria-hidden='true' />
              <span>{failure}</span>
            </div>
            <div className={own.failureActions}>
              <Button size='mini' disabled={submitting} onClick={handleRetry} data-testid='message-question-retry'>
                {t('messages.askRetry')}
              </Button>
              <Button
                size='mini'
                disabled={submitting}
                onClick={handleResendAsMessage}
                data-testid='message-question-resend'
              >
                {t('messages.askResendAsMessage')}
              </Button>
            </div>
          </div>
        ) : null}
        {/* ace:end */}
      </div>
    </Card>
  );
});

export default MessageQuestion;

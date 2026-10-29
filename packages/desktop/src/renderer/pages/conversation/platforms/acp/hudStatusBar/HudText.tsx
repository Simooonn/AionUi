/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Statusline output rendered inside the context-usage popover: one block per
// line, ANSI colors mapped to CSS-module classes by `parseAnsiLine`.
import React from 'react';
import { parseAnsiLine } from './ansiText';
import styles from './HudText.module.css';

const HudText: React.FC<{ text: string }> = ({ text }) => (
  <div className={styles.hud} data-testid='chat-hud-statusline'>
    {text.split('\n').map((line, lineIdx) => (
      <div key={lineIdx} className={styles.line}>
        {parseAnsiLine(line).map((seg, segIdx) => (
          <span
            key={segIdx}
            className={
              seg.classes
                .map((c) => styles[c])
                .filter(Boolean)
                .join(' ') || undefined
            }
          >
            {seg.text}
          </span>
        ))}
      </div>
    ))}
  </div>
);

export default HudText;

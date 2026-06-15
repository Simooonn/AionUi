/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

type SortablePinnedProjectProps = {
  workspace: string;
  disabled?: boolean;
  children: React.ReactNode;
};

/** Sortable wrapper for a pinned project folder. Drag order persists to config via the parent's reorder. */
const SortablePinnedProject: React.FC<SortablePinnedProjectProps> = ({ workspace, disabled, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace,
    disabled,
    data: {
      type: 'pinned-project',
      workspace,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

export default SortablePinnedProject;

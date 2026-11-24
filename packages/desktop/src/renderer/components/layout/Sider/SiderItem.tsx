/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { MoreOne, Pushpin } from '@icon-park/react';
import classNames from 'classnames';
import React, { useState } from 'react';

export type SiderMenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
};

export type SiderItemProps = {
  icon: React.ReactNode;
  name: string;
  selected?: boolean;
  pinned?: boolean;
  // ace:start workspace-label — optional directory label rendered after the name
  /** Last path segment of the item's workspace, shown after the name (team sider rows). */
  workspaceLabel?: string;
  /** Full workspace path, shown in the hover tooltip for `workspaceLabel`. */
  workspacePath?: string;
  // ace:end
  menuItems?: SiderMenuItem[];
  onMenuAction?: (key: string) => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

const SiderItem: React.FC<SiderItemProps> = ({
  icon,
  name,
  selected,
  pinned,
  workspaceLabel,
  workspacePath,
  menuItems,
  onMenuAction,
  onClick,
  onContextMenu,
}) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const hasMenu = menuItems && menuItems.length > 0;

  return (
    <Tooltip
      content={name}
      disabled={!name}
      trigger='hover'
      popupVisible={name ? undefined : false}
      unmountOnExit
      popupHoverStay={false}
      position='top'
    >
      <div
        className={classNames(
          'h-34px rd-8px flex items-center gap-8px ps-10px pe-8px cursor-pointer relative overflow-hidden shrink-0 group min-w-0 transition-colors',
          {
            'hover:bg-fill-3': !selected,
            '!bg-fill-3': selected,
          }
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* Leading icon — pushpin overlays this slot on hover when row is pinned */}
        <span className='size-22px flex items-center justify-center shrink-0 line-height-0 text-t-primary relative'>
          <span
            className={classNames('flex items-center justify-center', {
              'group-hover:opacity-0 transition-opacity': hasMenu && pinned,
            })}
          >
            {icon}
          </span>
          {hasMenu && pinned && (
            <span
              className='absolute inset-0 flex-center text-t-secondary pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity'
              style={{ lineHeight: 0 }}
            >
              <Pushpin theme='outline' size='14' />
            </span>
          )}
        </span>

        {/* Name with truncation — reserve room for the hover three-dot menu */}
        <div className='h-24px min-w-0 flex-1 overflow-hidden pe-12px'>
          <div className='overflow-hidden text-ellipsis block w-full text-14px font-[500] lh-24px whitespace-nowrap min-w-0 text-t-primary'>
            <span className='block overflow-hidden text-ellipsis whitespace-nowrap'>{name}</span>
          </div>
        </div>

        {/* ace:start workspace-label — directory label after the name; mirrors the
            recent-section projectLabel in ConversationRow (same truncation + tertiary
            color + menu-button clearance). The name div is min-w-0 so the name yields first. */}
        {workspaceLabel && (
          <Tooltip
            content={workspacePath}
            disabled={!workspacePath}
            trigger='hover'
            popupVisible={workspacePath ? undefined : false}
            unmountOnExit
            popupHoverStay={false}
            position='top'
          >
            <span
              className={classNames(
                'shrink-0 max-w-96px truncate text-12px font-[400] text-t-tertiary',
                isMobile || menuVisible ? 'me-16px' : 'group-hover:me-16px'
              )}
              data-testid='sider-item-workspace-label'
            >
              {workspaceLabel}
            </span>
          </Tooltip>
        )}
        {/* ace:end */}

        {/* Hover/active actions: three-dot menu */}
        {hasMenu && (
          <div
            className={classNames('absolute end-8px top-1/2 -translate-y-1/2 items-center justify-end', {
              flex: isMobile || menuVisible,
              'hidden group-hover:flex': !isMobile && !menuVisible,
            })}
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    setMenuVisible(false);
                    onMenuAction?.(key);
                  }}
                >
                  {menuItems.map((item) => (
                    <Menu.Item key={item.key}>
                      <div
                        className={classNames('flex items-center gap-8px', {
                          'text-[rgb(var(--warning-6))]': item.danger,
                        })}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </Menu.Item>
                  ))}
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={setMenuVisible}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                data-testid='sider-item-menu-trigger'
                className={classNames(
                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                  {
                    flex: isMobile || menuVisible,
                    'hidden group-hover:flex': !isMobile && !menuVisible,
                  }
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuVisible(true);
                }}
              >
                <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default SiderItem;

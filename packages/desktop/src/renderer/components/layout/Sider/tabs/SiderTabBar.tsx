import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import type { SidebarTab } from './useSiderTab';

type SiderTabBarProps = {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  disabled?: boolean;
};

const TAB_ORDER: { key: SidebarTab; labelKey: string }[] = [
  { key: 'recent', labelKey: 'conversation.sider.tabRecent' },
  { key: 'team', labelKey: 'conversation.sider.tabTeam' },
  { key: 'project', labelKey: 'conversation.sider.tabProject' },
];

/**
 * The three sidebar view tabs rendered below the pinned region. The pinned
 * conversations and pinned projects stay above this bar, independent of the
 * selected tab.
 */
const SiderTabBar: React.FC<SiderTabBarProps> = ({ activeTab, onTabChange, disabled = false }) => {
  const { t } = useTranslation();

  return (
    <div
      data-testid='sider-tab-bar'
      className={classNames('flex items-center gap-2px px-10px pb-2px shrink-0', {
        'pointer-events-none opacity-50': disabled,
      })}
    >
      {TAB_ORDER.map(({ key, labelKey }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            type='button'
            data-testid={`sider-tab-${key}`}
            data-active={isActive ? 'true' : 'false'}
            aria-pressed={isActive}
            disabled={disabled}
            className={classNames(
              'flex-1 h-28px rounded-6px text-13px font-500 transition-colors cursor-pointer whitespace-nowrap',
              isActive ? 'bg-fill-2 text-t-primary' : 'text-t-secondary hover:text-t-primary hover:bg-fill-1'
            )}
            onClick={() => onTabChange(key)}
          >
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
};

export default SiderTabBar;

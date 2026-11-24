import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type SidebarTab = 'recent' | 'team' | 'project';

const STORAGE_KEY = 'sidebar-active-tab';
const VALID_TABS: SidebarTab[] = ['recent', 'team', 'project'];

const isSidebarTab = (value: string | null): value is SidebarTab =>
  value !== null && (VALID_TABS as string[]).includes(value);

/**
 * Persisted sidebar view tab. Manual selection is remembered in localStorage
 * (matching the other sidebar UI state like `team-section-expanded`); the tab
 * auto-follows route changes only for external entries (`/team/:id` → team,
 * `/conversation/:id` → recent) so browsing a list is never interrupted by the
 * content the user happens to open.
 */
export function useSiderTab(): { activeTab: SidebarTab; setActiveTab: (tab: SidebarTab) => void } {
  const [activeTab, setActiveTabState] = useState<SidebarTab>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSidebarTab(stored) ? stored : 'recent';
  });
  const { pathname } = useLocation();

  const setActiveTab = useCallback((tab: SidebarTab) => {
    setActiveTabState(tab);
    localStorage.setItem(STORAGE_KEY, tab);
  }, []);

  // External-entry auto-switch: only a route *change* into a team/conversation
  // page drives the tab. Manual clicks don't navigate, so they are unaffected.
  useEffect(() => {
    if (pathname.startsWith('/team/')) {
      setActiveTab('team');
    } else if (pathname.startsWith('/conversation/')) {
      setActiveTab('recent');
    }
  }, [pathname, setActiveTab]);

  return { activeTab, setActiveTab };
}

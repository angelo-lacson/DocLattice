import React from "react";
import { CorpusSidebarHeader } from "./CorpusSidebarHeader";
import {
  SidebarContainer,
  BottomSheetHandle,
  NavSection,
  NavGroup,
  NavGroupLabel,
  NavItem,
  NavItemLabel,
  NavItemBadge,
} from "./styles";

export interface NavigationItem {
  /** Unique ID for the navigation item */
  id: string;
  /** Display label */
  label: string;
  /** Icon component */
  icon: React.ReactNode;
  /** Optional badge count */
  badge?: number;
  /** Whether this item requires update permission */
  requiresUpdate?: boolean;
}

export interface NavigationGroup {
  /** Group ID */
  id: string;
  /** Group label displayed above items */
  label: string;
  /** Items in this group */
  items: NavigationItem[];
}

export interface CorpusSidebarProps {
  /** Corpus title */
  corpusTitle?: string;
  /** Whether the corpus is public */
  isPublic?: boolean;
  /** Currently active navigation item ID */
  activeItemId: string;
  /** Callback when a navigation item is clicked */
  onNavigate: (itemId: string) => void;
  /** Whether the sidebar is expanded */
  isExpanded: boolean;
  /** Callback to toggle sidebar expansion */
  onToggleExpand: () => void;
  /** Navigation groups to display */
  groups: NavigationGroup[];
  /** Whether the user can update the corpus (for filtering CONFIGURE items) */
  canUpdate?: boolean;
  /** Test ID for the component */
  testId?: string;
}

/**
 * CorpusSidebar - Navigation sidebar for the corpus detail page
 *
 * Features:
 * - Collapsible sidebar with corpus header
 * - Grouped navigation items (OVERVIEW, CONTENT, CONFIGURE)
 * - Badge counts for items with data
 * - Mobile-friendly bottom sheet mode
 * - Active state highlighting
 */
export const CorpusSidebar: React.FC<CorpusSidebarProps> = ({
  corpusTitle,
  isPublic = false,
  activeItemId,
  onNavigate,
  isExpanded,
  onToggleExpand,
  groups,
  canUpdate = false,
  testId = "corpus-sidebar",
}) => {
  return (
    <SidebarContainer
      $isExpanded={isExpanded}
      data-testid={testId}
      initial={false}
      animate={{ width: isExpanded ? 280 : 72 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <BottomSheetHandle />

      <CorpusSidebarHeader
        title={corpusTitle}
        isPublic={isPublic}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        testId={`${testId}-header`}
      />

      <NavSection data-testid={`${testId}-nav`}>
        {groups.map((group) => {
          // Filter items that require update permission if user can't update
          const visibleItems = group.items.filter(
            (item) => !item.requiresUpdate || canUpdate
          );

          // Skip empty groups
          if (visibleItems.length === 0) return null;

          return (
            <NavGroup
              key={group.id}
              data-testid={`${testId}-group-${group.id}`}
            >
              <NavGroupLabel $isExpanded={isExpanded}>
                {group.label}
              </NavGroupLabel>
              {visibleItems.map((item) => (
                <NavItem
                  key={item.id}
                  $isActive={activeItemId === item.id}
                  $isExpanded={isExpanded}
                  onClick={() => onNavigate(item.id)}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  title={!isExpanded ? item.label : undefined}
                  data-testid={`${testId}-item-${item.id}`}
                >
                  {item.icon}
                  <NavItemLabel $isExpanded={isExpanded}>
                    {item.label}
                  </NavItemLabel>
                  {item.badge !== undefined && item.badge > 0 && (
                    <NavItemBadge $isExpanded={isExpanded}>
                      {item.badge.toLocaleString()}
                    </NavItemBadge>
                  )}
                </NavItem>
              ))}
            </NavGroup>
          );
        })}
      </NavSection>
    </SidebarContainer>
  );
};

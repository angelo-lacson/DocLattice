import { NavBar } from "@os-legal/ui";
import type { NavItem, UserMenuItem } from "@os-legal/ui";
import { useNavigate } from "react-router-dom";
import { showExportModal, showUserSettingsModal } from "../../graphql/cache";
import UserSettingsModal from "../modals/UserSettingsModal";
import { VERSION_TAG } from "../../assets/configurations/constants";
import { useNavMenu } from "./useNavMenu";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import logo from "../../assets/images/os_legal_128.png";

// Custom styles for navbar
const navbarCustomStyles = `
  /* Version badge - filled background */
  .oc-navbar .oc-chip {
    background: rgba(255, 255, 255, 0.15) !important;
    color: rgba(255, 255, 255, 0.9) !important;
  }
  /* Keep brand name visible on mobile */
  .oc-navbar__brand-name {
    display: block !important;
  }
`;

// Icons for user menu
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8.75 1a.75.75 0 00-1.5 0v6.59L5.53 5.87a.75.75 0 00-1.06 1.06l3 3a.75.75 0 001.06 0l3-3a.75.75 0 10-1.06-1.06L8.75 7.59V1z" />
    <path d="M1.75 10a.75.75 0 00-.75.75v2.5A1.75 1.75 0 002.75 15h10.5A1.75 1.75 0 0015 13.25v-2.5a.75.75 0 00-1.5 0v2.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25v-2.5a.75.75 0 00-.75-.75z" />
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3z" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M8 4.754a3.246 3.246 0 100 6.492 3.246 3.246 0 000-6.492zM5.754 8a2.246 2.246 0 114.492 0 2.246 2.246 0 01-4.492 0z"
    />
    <path
      fillRule="evenodd"
      d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 01-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 01-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 01.52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 011.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 011.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 01.52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 01-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 01-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 002.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 001.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 00-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 00-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 00-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 001.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 003.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 002.692-1.115l.094-.319z"
    />
  </svg>
);

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M6 12.5a.5.5 0 00.5.5h8a.5.5 0 00.5-.5v-9a.5.5 0 00-.5-.5h-8a.5.5 0 00-.5.5v2a.5.5 0 01-1 0v-2A1.5 1.5 0 016.5 2h8A1.5 1.5 0 0116 3.5v9a1.5 1.5 0 01-1.5 1.5h-8A1.5 1.5 0 015 12.5v-2a.5.5 0 011 0v2z"
    />
    <path
      fillRule="evenodd"
      d="M.146 8.354a.5.5 0 010-.708l3-3a.5.5 0 11.708.708L1.707 7.5H10.5a.5.5 0 010 1H1.707l2.147 2.146a.5.5 0 01-.708.708l-3-3z"
    />
  </svg>
);

export const NavMenu = () => {
  const {
    user,
    isLoading,
    REACT_APP_USE_AUTH0,
    public_header_items,
    private_header_items,
    show_export_modal,
    isActive,
    requestLogout,
    doLogin,
  } = useNavMenu();
  const navigate = useNavigate();
  const { width } = useWindowDimensions();

  // On mobile (< 1100px where NavBar collapses), hide version badge but keep brand name
  const isMobile = width < 1100;
  const versionDisplay = isMobile ? undefined : VERSION_TAG;

  const isSuperuser = user && (user as any).isSuperuser;

  // Build nav items from menu configuration
  const baseNavItems = [
    ...public_header_items,
    ...(user ? private_header_items : []),
  ];

  // Add superuser-only Badge Management item
  const allMenuItems = isSuperuser
    ? [
        ...baseNavItems,
        {
          title: "Badge Management",
          route: "/admin/badges",
          id: "admin_badges_menu_button",
          protected: true,
        },
      ]
    : baseNavItems;

  // Map to NavItem format with onClick handlers for navigation
  const navItems: NavItem[] = allMenuItems.map((item) => ({
    id: item.id,
    label: item.title,
    onClick: () => navigate(item.route),
  }));

  // Login button for unauthenticated users (rendered on right side via actions prop)
  const handleLogin = REACT_APP_USE_AUTH0 ? doLogin : () => navigate("/login");

  // Build user menu items
  const userMenuItems: UserMenuItem[] = user
    ? [
        {
          id: "exports",
          label: "Exports",
          icon: <DownloadIcon />,
          onClick: () => showExportModal(!show_export_modal),
        },
        {
          id: "profile",
          label: "Profile",
          icon: <UserIcon />,
          onClick: () => showUserSettingsModal(true),
        },
        ...(isSuperuser
          ? [
              {
                id: "admin",
                label: "Admin Settings",
                icon: <SettingsIcon />,
                onClick: () => navigate("/admin/settings"),
              },
            ]
          : []),
        { id: "divider", label: "", divider: true },
        {
          id: "logout",
          label: "Logout",
          icon: <LogoutIcon />,
          danger: true,
          onClick: requestLogout,
        },
      ]
    : [];

  // Find active nav item by checking routes
  const findActiveId = (): string | undefined => {
    for (const item of allMenuItems) {
      if (isActive(item.route)) {
        return item.id;
      }
    }
    return undefined;
  };

  const activeId = findActiveId();

  // Handle navigation from NavBar
  const handleNavigate = (id: string) => {
    const item = navItems.find((i) => i.id === id);
    item?.onClick?.();
  };

  return (
    <>
      <style>{navbarCustomStyles}</style>
      <UserSettingsModal />
      <NavBar
        logo={
          <img
            src={logo}
            alt="Open Contracts Logo"
            style={{ width: 32, height: 32, objectFit: "contain" }}
          />
        }
        brandName="Open Contracts"
        version={versionDisplay}
        items={navItems}
        activeId={activeId}
        onNavigate={handleNavigate}
        userName={
          user ? (user as any).name || (user as any).username : undefined
        }
        userMenuItems={userMenuItems}
        hideUserMenu={isLoading || !user}
        actions={
          !user && !isLoading ? (
            <button
              onClick={handleLogin}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "6px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Login
            </button>
          ) : undefined
        }
      />
    </>
  );
};

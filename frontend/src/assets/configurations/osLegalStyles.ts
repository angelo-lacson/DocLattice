/**
 * OS Legal Style Design System Tokens
 *
 * Shared styling constants for the Documents tab and related components.
 * This file defines the visual language for folder browsing, document cards,
 * and related UI elements following a clean, professional aesthetic.
 *
 * ## Usage Guidelines
 *
 * ### Colors
 * - **accent/accentHover**: Use for primary actions, selected states, and brand emphasis
 * - **textPrimary**: Main content text, headings, and important labels
 * - **textSecondary**: Supporting text, metadata, and secondary information
 * - **textMuted**: Placeholder text, disabled states, and tertiary content
 * - **surface/surfaceHover**: Card backgrounds, input fields, and interactive surfaces
 * - **border/borderHover**: Dividers, input borders, and subtle separations
 * - **selected***: Highlight selected items in lists and trees
 * - **dropTarget***: Visual feedback during drag-and-drop operations
 * - **folder***: Folder-specific styling (icon color, gradient backgrounds)
 * - **danger/success**: Semantic colors for destructive/positive actions
 *
 * ### Typography
 * - **fontFamilySerif**: Legal documents, formal content, and headings
 * - **fontFamilySans**: UI elements, buttons, and general interface text
 *
 * ### Spacing
 * - **borderRadiusCard**: Larger containers like cards and panels (12px)
 * - **borderRadiusButton**: Smaller elements like buttons and inputs (8px)
 * - **shadow***: Elevation levels for layered UI elements
 *
 * ## Accessibility Notes
 * - accent (#0f766e) on white background: 4.57:1 contrast ratio (WCAG AA compliant)
 * - textPrimary (#1e293b) on white: 12.63:1 contrast ratio (WCAG AAA compliant)
 * - textSecondary (#64748b) on white: 4.54:1 contrast ratio (WCAG AA compliant)
 * - textMuted (#94a3b8) on white: 2.78:1 contrast ratio (use for large text only)
 * - For critical UI elements, prefer textPrimary or textSecondary over textMuted
 */

/**
 * Color palette for the OS Legal design system.
 * All colors are defined as constants to ensure consistency across components.
 */
export const OS_LEGAL_COLORS = {
  // Brand accent colors - teal theme
  /** Primary accent color - teal (#0f766e). Use for buttons, links, and emphasis. */
  accent: "#0f766e",
  /** Hover state for accent color. Slightly darker for visual feedback. */
  accentHover: "#0d6860",
  /** Light accent background. Use for selected items and subtle highlights. */
  accentLight: "rgba(15, 118, 110, 0.1)",

  // Interactive colors - blue theme
  /** Primary interactive blue - buttons, focus rings, toggles, active states. */
  primaryBlue: "#3b82f6",

  // Text colors - slate scale
  /** Primary text color - dark slate. Use for headings and main content. */
  textPrimary: "#1e293b",
  /** Secondary text color - medium slate. Use for supporting text and metadata. */
  textSecondary: "#64748b",
  /** Tertiary text color - dark medium slate. Between primary and secondary. */
  textTertiary: "#475569",
  /** Muted text color - light slate. Use sparingly; does not meet WCAG AA for small text. */
  textMuted: "#94a3b8",

  // Surface and background colors
  /** Page background color - off-white for subtle depth. */
  background: "#fafafa",
  /** Card and panel surface color - pure white. */
  surface: "white",
  /** Hover state for surfaces - very light gray. */
  surfaceHover: "#f8fafc",
  /** Light surface - subtle gray for badges, tags, and secondary surfaces. */
  surfaceLight: "#f1f5f9",

  // Border colors
  /** Default border color - light gray for subtle separation. */
  border: "#e2e8f0",
  /** Hover state for borders - slightly darker for emphasis. */
  borderHover: "#cbd5e1",

  // Selection states
  /** Background for selected items. Uses accent color with low opacity. */
  selectedBg: "rgba(15, 118, 110, 0.1)",
  /** Border for selected items. Uses solid accent color. */
  selectedBorder: "#0f766e",

  // Drag-and-drop visual feedback - green theme for positive action
  /** Drop target background - green tint indicates valid drop zone. */
  dropTargetBg: "rgba(34, 197, 94, 0.1)",
  /** Drop target border - green outline for clear visual feedback. */
  dropTargetBorder: "rgba(34, 197, 94, 0.3)",
  /** Drop target active/hover state - more prominent green. */
  dropTargetActive: "rgba(34, 197, 94, 0.5)",

  // Folder-specific colors - amber/golden theme
  /** Folder icon color - amber/golden for visual distinction from documents. */
  folderIcon: "#D97706",
  /** Folder background gradient - warm amber tones. */
  folderIconBg: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)",

  // Semantic colors for actions
  /** Danger/destructive color - red. Use for delete, remove, and warning states. */
  danger: "#dc2626",
  /** Danger hover state - darker red. */
  dangerHover: "#b91c1c",
  /** Danger background - light red tint. */
  dangerLight: "rgba(220, 38, 38, 0.1)",
  /** Danger surface background - very light red for panels/modals. */
  dangerSurface: "#fef2f2",
  /** Danger surface hover state - slightly darker. */
  dangerSurfaceHover: "#fee2e2",
  /** Danger border color - light red for subtle borders. */
  dangerBorder: "#fecaca",
  /** Danger border hover state - more prominent red. */
  dangerBorderHover: "#f87171",
  /** Danger text color - dark red for text on danger surfaces. */
  dangerText: "#991b1b",

  /** Success color - green. Use for confirmations and positive feedback. */
  success: "#16a34a",
  /** Success hover state - darker green. */
  successHover: "#15803d",
  /** Success background - light green tint. */
  successLight: "rgba(22, 163, 74, 0.1)",
  /** Success surface background - very light green for panels/messages. */
  successSurface: "#f0fdf4",
  /** Success border color - light green for subtle borders. */
  successBorder: "#bbf7d0",
  /** Success text color - dark green for text on success surfaces. */
  successText: "#166534",

  // Info colors - blue theme for informational messages
  /** Info surface background - very light blue. */
  infoSurface: "#f0f9ff",
  /** Info border color - light blue. */
  infoBorder: "#bae6fd",
  /** Info text color - dark blue. */
  infoText: "#0369a1",

  // Warning colors - amber theme for caution messages
  /** Warning surface background - very light amber. */
  warningSurface: "#fefce8",
  /** Warning border color - amber. */
  warningBorder: "#fde68a",
  /** Warning text color - dark amber. */
  warningText: "#854d0e",
} as const;

/**
 * Typography definitions for the OS Legal design system.
 */
export const OS_LEGAL_TYPOGRAPHY = {
  /** Serif font stack - for legal documents and formal content. */
  fontFamilySerif: '"Georgia", "Times New Roman", serif',
  /** Sans-serif font stack - for UI elements and general text. */
  fontFamilySans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
} as const;

/**
 * Spacing and dimension constants for the OS Legal design system.
 */
export const OS_LEGAL_SPACING = {
  /** Border radius for cards and larger containers. */
  borderRadiusCard: "12px",
  /** Border radius for buttons and smaller elements. */
  borderRadiusButton: "8px",
  /** Default card shadow - subtle elevation. */
  shadowCard: "0 4px 12px rgba(0, 0, 0, 0.04)",
  /** Hover card shadow - more prominent elevation. */
  shadowCardHover: "0 8px 24px rgba(0, 0, 0, 0.08)",
} as const;

// os-legal-style design system tokens
// Shared styling constants for the Documents tab and related components

export const OS_LEGAL_COLORS = {
  accent: "#0f766e", // Teal
  accentHover: "#0d6860",
  accentLight: "rgba(15, 118, 110, 0.1)",
  textPrimary: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  background: "#fafafa",
  surface: "white",
  surfaceHover: "#f8fafc",
  border: "#e2e8f0",
  borderHover: "#cbd5e1",
  selectedBg: "rgba(15, 118, 110, 0.1)",
  selectedBorder: "#0f766e",
  dropTargetBg: "rgba(34, 197, 94, 0.1)", // Keep green for drop targets
  dropTargetBorder: "rgba(34, 197, 94, 0.3)",
} as const;

export const OS_LEGAL_TYPOGRAPHY = {
  fontFamilySerif: '"Georgia", "Times New Roman", serif',
  fontFamilySans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
} as const;

export const OS_LEGAL_SPACING = {
  borderRadiusCard: "12px",
  borderRadiusButton: "8px",
  shadowCard: "0 4px 12px rgba(0, 0, 0, 0.04)",
  shadowCardHover: "0 8px 24px rgba(0, 0, 0, 0.08)",
} as const;

import React from "react";

import type { LucideIcon } from "lucide-react";

import { DYNAMIC_ICON_DEFAULT_SIZE } from "../../../assets/configurations/constants";
import { resolveIcon } from "../../../utils/iconCompat";

export interface DynamicIconProps {
  /** SUI or Lucide icon name (e.g. "trash", "file-text", "warning sign"). */
  name: string;
  /** Pixel size for width and height. Defaults to DYNAMIC_ICON_DEFAULT_SIZE. */
  size?: number;
  /** Icon colour (any valid CSS colour). */
  color?: string;
  /** Accessible label. When provided the icon is visible to screen readers. */
  "aria-label"?: string;
  /** When true (default) the icon is hidden from assistive technology. */
  "aria-hidden"?: boolean;
  /** Additional CSS class names. */
  className?: string;
  /** Stroke width passed to the Lucide component. */
  strokeWidth?: number;
}

/**
 * Render any icon by string name, supporting both legacy Semantic UI names
 * and native Lucide kebab-case names.
 *
 * Unknown names gracefully fall back to a `HelpCircle` icon.
 */
export const DynamicIcon: React.FC<DynamicIconProps> = ({
  name,
  size = DYNAMIC_ICON_DEFAULT_SIZE,
  color,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
  className,
  strokeWidth,
}) => {
  const IconComponent: LucideIcon = resolveIcon(name);

  return (
    <IconComponent
      size={size}
      color={color}
      className={className}
      strokeWidth={strokeWidth}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden ?? !ariaLabel}
      role={ariaLabel ? "img" : undefined}
    />
  );
};

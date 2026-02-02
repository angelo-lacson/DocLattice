import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * Geometric icon for Docling parser (IBM Research)
 * Represents document layers/structure extraction
 */
export const DoclingIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Stacked document layers */}
    <rect
      x="8"
      y="6"
      width="28"
      height="36"
      rx="2"
      fill="#3B82F6"
      opacity="0.2"
    />
    <rect
      x="10"
      y="8"
      width="28"
      height="36"
      rx="2"
      fill="#3B82F6"
      opacity="0.4"
    />
    <rect x="12" y="10" width="28" height="36" rx="2" fill="#3B82F6" />
    {/* Document lines */}
    <rect x="16" y="16" width="16" height="2" rx="1" fill="white" />
    <rect
      x="16"
      y="22"
      width="20"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="16"
      y="28"
      width="14"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="16"
      y="34"
      width="18"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
  </svg>
);

/**
 * Geometric icon for LlamaParse (LlamaIndex)
 * Represents AI/llama with document parsing
 */
export const LlamaParseIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Llama ear shapes */}
    <path d="M14 8 L10 18 L18 16 Z" fill="#8B5CF6" />
    <path d="M34 8 L38 18 L30 16 Z" fill="#8B5CF6" />
    {/* Head circle */}
    <circle cx="24" cy="22" r="12" fill="#8B5CF6" />
    {/* Eyes */}
    <circle cx="20" cy="20" r="2" fill="white" />
    <circle cx="28" cy="20" r="2" fill="white" />
    {/* Snout */}
    <ellipse cx="24" cy="27" rx="4" ry="3" fill="#A78BFA" />
    {/* Document below */}
    <rect
      x="16"
      y="36"
      width="16"
      height="10"
      rx="1"
      fill="#8B5CF6"
      opacity="0.5"
    />
    <rect x="18" y="38" width="8" height="1" rx="0.5" fill="white" />
    <rect
      x="18"
      y="41"
      width="10"
      height="1"
      rx="0.5"
      fill="white"
      opacity="0.7"
    />
  </svg>
);

/**
 * Geometric icon for text parser
 * Simple text/document representation
 */
export const TextParserIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Document */}
    <rect x="8" y="4" width="32" height="40" rx="2" fill="#64748B" />
    {/* Text lines */}
    <rect x="12" y="10" width="20" height="3" rx="1" fill="white" />
    <rect
      x="12"
      y="16"
      width="24"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="12"
      y="21"
      width="18"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="12"
      y="26"
      width="22"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="12"
      y="31"
      width="16"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="12"
      y="36"
      width="20"
      height="2"
      rx="1"
      fill="white"
      opacity="0.7"
    />
  </svg>
);

/**
 * Geometric icon for PDF thumbnail generator
 * Represents image/preview generation from PDF
 */
export const PdfThumbnailIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Image frame */}
    <rect x="6" y="8" width="36" height="32" rx="3" fill="#EC4899" />
    {/* Inner frame */}
    <rect x="9" y="11" width="30" height="26" rx="2" fill="white" />
    {/* Mountain landscape (thumbnail preview) */}
    <path d="M9 32 L18 22 L26 28 L34 18 L39 25 L39 35 L9 35 Z" fill="#F9A8D4" />
    <circle cx="32" cy="17" r="4" fill="#FBCFE8" />
    {/* PDF badge */}
    <rect x="28" y="30" width="14" height="10" rx="1" fill="#BE185D" />
    <text
      x="35"
      y="38"
      fontSize="6"
      fill="white"
      textAnchor="middle"
      fontWeight="bold"
    >
      PDF
    </text>
  </svg>
);

/**
 * Geometric icon for text thumbnail generator
 */
export const TextThumbnailIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Preview frame */}
    <rect x="6" y="8" width="36" height="32" rx="3" fill="#F59E0B" />
    <rect x="9" y="11" width="30" height="26" rx="2" fill="white" />
    {/* Text preview lines */}
    <rect x="12" y="15" width="18" height="2" rx="1" fill="#FCD34D" />
    <rect x="12" y="20" width="24" height="2" rx="1" fill="#FDE68A" />
    <rect x="12" y="25" width="20" height="2" rx="1" fill="#FDE68A" />
    <rect x="12" y="30" width="16" height="2" rx="1" fill="#FDE68A" />
    {/* TXT badge */}
    <rect x="28" y="30" width="14" height="10" rx="1" fill="#B45309" />
    <text
      x="35"
      y="38"
      fontSize="5"
      fill="white"
      textAnchor="middle"
      fontWeight="bold"
    >
      TXT
    </text>
  </svg>
);

/**
 * Geometric icon for ModernBERT embedder
 * Neural network / transformer representation
 */
export const ModernBertIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Neural network nodes */}
    {/* Input layer */}
    <circle cx="10" cy="14" r="4" fill="#10B981" />
    <circle cx="10" cy="24" r="4" fill="#10B981" />
    <circle cx="10" cy="34" r="4" fill="#10B981" />
    {/* Hidden layer */}
    <circle cx="24" cy="12" r="4" fill="#34D399" />
    <circle cx="24" cy="24" r="4" fill="#34D399" />
    <circle cx="24" cy="36" r="4" fill="#34D399" />
    {/* Output layer */}
    <circle cx="38" cy="18" r="4" fill="#6EE7B7" />
    <circle cx="38" cy="30" r="4" fill="#6EE7B7" />
    {/* Connections */}
    <line
      x1="14"
      y1="14"
      x2="20"
      y2="12"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="14"
      y1="14"
      x2="20"
      y2="24"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="14"
      y1="24"
      x2="20"
      y2="12"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="14"
      y1="24"
      x2="20"
      y2="24"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="14"
      y1="24"
      x2="20"
      y2="36"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="14"
      y1="34"
      x2="20"
      y2="24"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="14"
      y1="34"
      x2="20"
      y2="36"
      stroke="#10B981"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="28"
      y1="12"
      x2="34"
      y2="18"
      stroke="#34D399"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="28"
      y1="12"
      x2="34"
      y2="30"
      stroke="#34D399"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="28"
      y1="24"
      x2="34"
      y2="18"
      stroke="#34D399"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="28"
      y1="24"
      x2="34"
      y2="30"
      stroke="#34D399"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="28"
      y1="36"
      x2="34"
      y2="18"
      stroke="#34D399"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="28"
      y1="36"
      x2="34"
      y2="30"
      stroke="#34D399"
      strokeWidth="1"
      opacity="0.5"
    />
  </svg>
);

/**
 * Geometric icon for Sentence Transformer microservice
 * Represents distributed/cloud computing
 */
export const SentenceTransformerIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Cloud shape */}
    <path
      d="M38 28 C42 28 44 24 44 21 C44 17 40 14 36 14 C36 10 32 6 26 6 C20 6 16 10 16 14 C16 14 16 14 16 14 C10 14 6 18 6 23 C6 28 10 32 16 32 L38 32 C38 32 38 28 38 28"
      fill="#6366F1"
    />
    {/* Network dots inside cloud */}
    <circle cx="18" cy="20" r="3" fill="white" />
    <circle cx="28" cy="18" r="3" fill="white" />
    <circle cx="36" cy="22" r="3" fill="white" />
    <circle cx="24" cy="26" r="3" fill="white" />
    {/* Connection lines */}
    <line
      x1="20"
      y1="21"
      x2="25"
      y2="19"
      stroke="white"
      strokeWidth="1"
      opacity="0.6"
    />
    <line
      x1="30"
      y1="19"
      x2="34"
      y2="21"
      stroke="white"
      strokeWidth="1"
      opacity="0.6"
    />
    <line
      x1="26"
      y1="25"
      x2="34"
      y2="23"
      stroke="white"
      strokeWidth="1"
      opacity="0.6"
    />
    <line
      x1="20"
      y1="22"
      x2="22"
      y2="24"
      stroke="white"
      strokeWidth="1"
      opacity="0.6"
    />
    {/* Server base */}
    <rect x="14" y="36" width="20" height="8" rx="2" fill="#4F46E5" />
    <circle cx="18" cy="40" r="1.5" fill="#A5B4FC" />
    <rect x="22" y="39" width="8" height="2" rx="1" fill="#A5B4FC" />
  </svg>
);

/**
 * Geometric icon for Multimodal embedder
 * Represents text + image processing
 */
export const MultimodalIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Text document (left) */}
    <rect x="4" y="8" width="18" height="24" rx="2" fill="#0EA5E9" />
    <rect x="7" y="12" width="10" height="2" rx="1" fill="white" />
    <rect
      x="7"
      y="17"
      width="12"
      height="1.5"
      rx="0.75"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="7"
      y="21"
      width="8"
      height="1.5"
      rx="0.75"
      fill="white"
      opacity="0.7"
    />
    <rect
      x="7"
      y="25"
      width="11"
      height="1.5"
      rx="0.75"
      fill="white"
      opacity="0.7"
    />

    {/* Image (right) */}
    <rect x="26" y="8" width="18" height="24" rx="2" fill="#0EA5E9" />
    <rect x="28" y="10" width="14" height="18" rx="1" fill="white" />
    <path d="M28 24 L33 18 L38 22 L42 16 L42 26 L28 26 Z" fill="#7DD3FC" />
    <circle cx="37" cy="14" r="2" fill="#BAE6FD" />

    {/* Merge arrow / connection */}
    <path
      d="M13 34 L13 38 L24 44 L35 38 L35 34"
      stroke="#0284C7"
      strokeWidth="2"
      fill="none"
    />
    <circle cx="24" cy="44" r="3" fill="#0284C7" />

    {/* Plus symbol in center */}
    <circle cx="24" cy="20" r="6" fill="#0369A1" />
    <rect x="22" y="17" width="4" height="6" rx="1" fill="white" />
    <rect x="21" y="18.5" width="6" height="3" rx="1" fill="white" />
  </svg>
);

/**
 * Generic fallback icon for unknown components
 */
export const GenericComponentIcon: React.FC<IconProps> = ({
  size = 48,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Gear/cog shape */}
    <path
      d="M24 8 L27 8 L28 12 L32 13 L35 10 L37 12 L35 16 L36 20 L40 21 L40 24 L36 25 L35 29 L38 32 L36 35 L32 32 L28 34 L27 38 L24 38 L23 34 L19 33 L16 36 L13 34 L15 30 L14 26 L10 25 L10 22 L14 21 L15 17 L12 14 L14 11 L18 14 L22 12 L23 8 Z"
      fill="#94A3B8"
    />
    <circle cx="24" cy="23" r="6" fill="white" />
    <circle cx="24" cy="23" r="3" fill="#94A3B8" />
  </svg>
);

/**
 * Map component class names to their icons
 */
export const getComponentIcon = (className: string): React.FC<IconProps> => {
  const lowerName = className.toLowerCase();

  if (lowerName.includes("docling")) return DoclingIcon;
  if (lowerName.includes("llama")) return LlamaParseIcon;
  if (
    lowerName.includes("txt") ||
    lowerName.includes("text_parser") ||
    lowerName.includes("oc_text")
  )
    return TextParserIcon;
  if (lowerName.includes("pdf") && lowerName.includes("thumb"))
    return PdfThumbnailIcon;
  if (lowerName.includes("text") && lowerName.includes("thumb"))
    return TextThumbnailIcon;
  if (lowerName.includes("modernbert") || lowerName.includes("modern_bert"))
    return ModernBertIcon;
  if (
    lowerName.includes("sent") ||
    lowerName.includes("sentence") ||
    lowerName.includes("microservice")
  )
    return SentenceTransformerIcon;
  if (lowerName.includes("multimodal")) return MultimodalIcon;

  return GenericComponentIcon;
};

/**
 * Get a friendly display name from a component class path
 */
export const getComponentDisplayName = (
  className: string,
  title?: string
): string => {
  if (title) return title;

  // Extract just the class name from the full path
  const parts = className.split(".");
  const name = parts[parts.length - 1];

  // Convert CamelCase to readable format
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

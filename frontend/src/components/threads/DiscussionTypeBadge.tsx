import React from "react";
import styled from "styled-components";
import { HelpCircle, Lightbulb, AlertCircle, CheckCircle } from "lucide-react";
import { color } from "../../theme/colors";

/**
 * Discussion category types that can be inferred from thread content
 * or explicitly set via a future backend field.
 */
export type DiscussionCategory = "question" | "idea" | "help" | "answered";

interface DiscussionTypeBadgeProps {
  category: DiscussionCategory;
  compact?: boolean;
}

const BadgeContainer = styled.span<{ $category: DiscussionCategory }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;

  ${(props) => {
    switch (props.$category) {
      case "question":
        return `
          background: ${color.T2};
          color: ${color.T9};
          border: 1px solid ${color.T4};
        `;
      case "idea":
        return `
          background: ${color.G2};
          color: ${color.G9};
          border: 1px solid ${color.G4};
        `;
      case "help":
        return `
          background: ${color.R2};
          color: ${color.R8};
          border: 1px solid ${color.R4};
        `;
      case "answered":
        return `
          background: ${color.G2};
          color: ${color.G8};
          border: 1px solid ${color.G5};
        `;
      default:
        return `
          background: ${color.N3};
          color: ${color.N8};
          border: 1px solid ${color.N5};
        `;
    }
  }}

  svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
`;

const categoryConfig: Record<
  DiscussionCategory,
  { icon: React.ReactNode; label: string }
> = {
  question: { icon: <HelpCircle />, label: "Question" },
  idea: { icon: <Lightbulb />, label: "Idea" },
  help: { icon: <AlertCircle />, label: "Help Wanted" },
  answered: { icon: <CheckCircle />, label: "Answered" },
};

/**
 * Infer discussion category from thread title and description.
 * This is a simple heuristic that can be replaced with a backend field.
 */
export function inferDiscussionCategory(
  title: string,
  description?: string | null
): DiscussionCategory {
  const text = `${title} ${description || ""}`.toLowerCase();

  // Check for question indicators
  if (
    text.includes("?") ||
    text.includes("question") ||
    text.includes("how do") ||
    text.includes("how to") ||
    text.includes("what is") ||
    text.includes("why does") ||
    text.includes("can someone") ||
    text.includes("anyone know")
  ) {
    return "question";
  }

  // Check for help/issue indicators
  if (
    text.includes("help") ||
    text.includes("issue") ||
    text.includes("problem") ||
    text.includes("bug") ||
    text.includes("error") ||
    text.includes("stuck") ||
    text.includes("not working")
  ) {
    return "help";
  }

  // Check for idea/suggestion indicators
  if (
    text.includes("idea") ||
    text.includes("suggest") ||
    text.includes("proposal") ||
    text.includes("feature") ||
    text.includes("would be nice") ||
    text.includes("best practice")
  ) {
    return "idea";
  }

  // Default to question for general discussion
  return "question";
}

/**
 * Visual badge for discussion type/category.
 * Shows icon and label to categorize threads.
 */
export function DiscussionTypeBadge({
  category,
  compact = false,
}: DiscussionTypeBadgeProps) {
  const config = categoryConfig[category];

  return (
    <BadgeContainer $category={category}>
      {config.icon}
      {!compact && <span>{config.label}</span>}
    </BadgeContainer>
  );
}

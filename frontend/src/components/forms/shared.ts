import styled from "styled-components";

export const FormField = styled.div`
  margin-bottom: var(--oc-spacing-md, 1rem);

  &:last-child {
    margin-bottom: 0;
  }
`;

/**
 * Validates that title and description are non-empty.
 * Stable reference — safe to pass as a prop without busting memoization.
 */
export const validateTitleAndDescription = (
  data: Record<string, any>
): string[] => {
  const errors: string[] = [];
  if (!data.title?.trim()) errors.push("Title is required");
  if (!data.description?.trim()) errors.push("Description is required");
  return errors;
};

import styled from "styled-components";

/**
 * Shared form field wrapper with label styling.
 * Renders a required asterisk when $required is true.
 */
export const FormField = styled.div<{ $required?: boolean }>`
  margin-bottom: 1rem;

  > label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.875rem;

    ${({ $required }) =>
      $required &&
      `
      &::after {
        content: " *";
        color: #ef4444;
      }
    `}
  }
`;

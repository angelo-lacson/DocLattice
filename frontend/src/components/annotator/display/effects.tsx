import { keyframes } from "styled-components";

export const pulseGreen = keyframes`
  0% {
    box-shadow: 0 0 10px 3px rgba(46, 204, 113, 0.15),
               0 0 4px 1px rgba(46, 204, 113, 0.10);
  }
  50% {
    box-shadow: 0 0 18px 6px rgba(46, 204, 113, 0.22),
               0 0 6px 2px rgba(46, 204, 113, 0.14);
  }
  100% {
    box-shadow: 0 0 10px 3px rgba(46, 204, 113, 0.15),
               0 0 4px 1px rgba(46, 204, 113, 0.10);
  }
`;

export const pulseMaroon = keyframes`
  0% {
    box-shadow: 0 0 10px 3px rgba(180, 40, 40, 0.15),
               0 0 4px 1px rgba(180, 40, 40, 0.10);
  }
  50% {
    box-shadow: 0 0 18px 6px rgba(180, 40, 40, 0.22),
               0 0 6px 2px rgba(180, 40, 40, 0.14);
  }
  100% {
    box-shadow: 0 0 10px 3px rgba(180, 40, 40, 0.15),
               0 0 4px 1px rgba(180, 40, 40, 0.10);
  }
`;

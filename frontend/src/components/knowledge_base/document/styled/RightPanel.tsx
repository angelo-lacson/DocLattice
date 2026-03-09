import { motion } from "framer-motion";
import styled from "styled-components";
import { OS_LEGAL_COLORS } from "../../../../assets/configurations/osLegalStyles";

export const ControlButtonGroupLeft = styled.div`
  position: absolute;
  left: -0.5rem; // Slightly closer to panel
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
`;

interface ConnectionStatusProps {
  $isConnected: boolean;
}

export const ConnectionStatus = styled(motion.div)<ConnectionStatusProps>`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) =>
    props.$isConnected ? OS_LEGAL_COLORS.greenMedium : OS_LEGAL_COLORS.danger};

  /* Flash animation for disconnected state */
  animation: ${(props) =>
    !props.$isConnected ? "flashDisconnected 1s infinite" : "none"};

  @keyframes flashDisconnected {
    0%,
    100% {
      opacity: 1;
      transform: translateY(-50%) scale(1);
    }
    50% {
      opacity: 0.5;
      transform: translateY(-50%) scale(0.85);
    }
  }
`;

export const ControlButtonWrapper = styled.div`
  /* Desktop remains unchanged */
  @media (min-width: 769px) {
    position: absolute;
    left: -1.25rem;
    top: 50%;
    transform: translateY(-50%);
    width: 2.5rem;
    height: 6rem;
    z-index: 2001;
  }

  /* Mobile - Step 1: Perfect vertical center */
  @media (max-width: 768px) {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    left: 0;
    width: 3rem;
    height: 3rem;
    z-index: 2001;
  }
`;

export const ControlButton = styled(motion.button)`
  position: absolute;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  transform-style: preserve-3d;
  overflow: visible;

  /* The tear in reality */
  &::before {
    content: "";
    position: absolute;
    inset: -1px;
    background: linear-gradient(
      90deg,
      rgba(0, 149, 255, 0.95) 0%,
      rgba(0, 149, 255, 0.2) 100%
    );
    clip-path: polygon(
      100% 0%,
      100% 100%,
      20% 100%,
      0% 85%,
      15% 50%,
      0% 15%,
      20% 0%
    );
    filter: blur(0.5px);
    transform: translateZ(1px);
    box-shadow: 0 0 20px rgba(0, 149, 255, 0.5), 0 0 40px rgba(0, 149, 255, 0.3),
      0 0 60px rgba(0, 149, 255, 0.1);
    animation: pulseGlow 4s ease-in-out infinite;
  }

  /* The energy ripple */
  &::after {
    content: "";
    position: absolute;
    inset: -1px;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.9) 0%,
      transparent 100%
    );
    clip-path: polygon(
      100% 0%,
      100% 100%,
      20% 100%,
      0% 85%,
      15% 50%,
      0% 15%,
      20% 0%
    );
    opacity: 0;
    transform: translateZ(2px);
    animation: energyRipple 3s ease-in-out infinite;
  }

  /* Inner glow */
  .inner-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at right,
      rgba(0, 149, 255, 0.4) 0%,
      transparent 70%
    );
    clip-path: polygon(
      100% 0%,
      100% 100%,
      20% 100%,
      0% 85%,
      15% 50%,
      0% 15%,
      20% 0%
    );
    transform: translateZ(0.5px);
    mix-blend-mode: screen;
  }

  .arrow-wrapper {
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%) translateZ(3px);

    svg {
      width: 1.25rem;
      height: 1.25rem;
      color: white;
      filter: drop-shadow(0 0 8px rgba(0, 149, 255, 0.8));
      transition: all 0.3s ease;
    }
  }

  @keyframes pulseGlow {
    0%,
    100% {
      filter: blur(0.5px) brightness(1);
      transform: translateZ(1px);
    }
    50% {
      filter: blur(0.5px) brightness(1.3);
      transform: translateZ(1.5px);
    }
  }

  @keyframes energyRipple {
    0%,
    100% {
      opacity: 0;
      transform: translateX(0) translateZ(2px);
    }
    50% {
      opacity: 0.5;
      transform: translateX(-10px) translateZ(2px);
    }
  }

  /* Hover state intensifies everything */
  &:hover {
    &::before {
      animation: pulseGlow 2s ease-in-out infinite;
      filter: blur(0.5px) brightness(1.4);
      box-shadow: 0 0 30px rgba(0, 149, 255, 0.6),
        0 0 60px rgba(0, 149, 255, 0.4), 0 0 90px rgba(0, 149, 255, 0.2);
    }

    &::after {
      animation: energyRipple 1.5s ease-in-out infinite;
    }

    .arrow-wrapper svg {
      transform: translateX(-2px);
      filter: drop-shadow(0 0 12px rgba(0, 149, 255, 1));
    }
  }

  /* Mobile - LIQUID SMOOTH */
  @media (max-width: 768px) {
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0 12px 12px 0; // Softer curve

    /* Ethereal gradient blend */
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0.99) 0%,
      rgba(255, 255, 255, 0.99) 50%,
      rgba(255, 255, 255, 0.95) 70%,
      rgba(255, 255, 255, 0.8) 85%,
      rgba(255, 255, 255, 0) 100%
    );

    /* Gossamer shadow */
    box-shadow: inset -12px 0 16px -8px rgba(0, 0, 0, 0.03),
      2px 0 12px -6px rgba(0, 0, 0, 0.06);

    .arrow-wrapper {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 0.75rem; // More space for fade
      opacity: 0.9; // Soften the arrow too

      svg {
        width: 20px;
        height: 20px;
        color: rgb(0, 149, 255);
        transform: rotate(180deg);
      }
    }
  }
`;

interface SlidingPanelProps {
  pushContent?: boolean;
  panelWidth: number; // percentage 0-100
}

export const SlidingPanel = styled(motion.div)<SlidingPanelProps>`
  /* Preserve existing base styling */
  position: absolute;
  top: 0;
  right: 0;
  z-index: 100001; /* Above UnifiedLabelSelector (100000) */

  width: ${(props) => props.panelWidth}%;
  height: 100%;

  /* Enhanced background and effects */
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  box-shadow: -4px 0 25px rgba(0, 0, 0, 0.05), -1px 0 2px rgba(0, 0, 0, 0.02);
  border-left: 1px solid rgba(226, 232, 240, 0.3);

  display: flex;
  flex-direction: column;
  overflow: visible; // Allow our button to breach containment
  transform-style: preserve-3d; // For that sweet 3D effect

  /* Fancy edge highlight */
  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(
      to bottom,
      transparent,
      rgba(26, 115, 232, 0.2),
      transparent
    );
    transform: translateX(-1px);
  }

  /* Mobile responsiveness preserved */
  @media (max-width: 768px) {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    padding-top: max(env(safe-area-inset-top), 1rem);
    background: white;
    overflow: visible !important; // CRUCIAL: Let the button breathe!
  }
`;

export const ChatIndicator = styled(motion.button)`
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 80px;
  background: ${OS_LEGAL_COLORS.primaryBlue};
  border: none;
  border-radius: 24px 0 0 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: -4px 0 12px rgba(66, 153, 225, 0.2);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1999;

  &::before {
    content: "";
    position: absolute;
    inset: 2px;
    right: 0;
    background: linear-gradient(
      135deg,
      #5ba3eb 0%,
      ${OS_LEGAL_COLORS.primaryBlue} 100%
    );
    border-radius: 22px 0 0 22px;
  }

  svg {
    width: 24px;
    height: 24px;
    color: white;
    position: relative;
    z-index: 1;
  }

  &:hover {
    width: 56px;
    box-shadow: -6px 0 20px rgba(66, 153, 225, 0.3);

    svg {
      transform: scale(1.1);
    }
  }

  /* Pulse animation */
  &::after {
    content: "";
    position: absolute;
    inset: -8px;
    right: -4px;
    background: ${OS_LEGAL_COLORS.primaryBlue};
    border-radius: 28px 0 0 28px;
    opacity: 0;
    animation: chatPulse 2s ease-out infinite;
  }

  @keyframes chatPulse {
    0% {
      opacity: 0.4;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.2);
    }
  }

  /* Adjust for mobile */
  @media (max-width: 768px) {
    right: 0;
    bottom: auto;
    top: 50%;
    transform: translateY(-50%);
    width: 56px;
    height: 56px;
    border-radius: 28px 0 0 28px;

    &::before {
      border-radius: 26px 0 0 26px;
    }

    &::after {
      border-radius: 32px 0 0 32px;
    }
  }
`;

export const ControlButtonGroup = styled.div`
  position: absolute;
  top: 1.5rem;
  right: 2rem;
  display: flex;
  gap: 0.75rem;
`;

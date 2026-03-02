import styled, { keyframes } from "styled-components";
import { PIPELINE_UI } from "../../../assets/configurations/constants";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

// ============================================================================
// Animation Keyframes
// ============================================================================

export const etherealFlow = keyframes`
  0% { top: -10px; opacity: 0; transform: scale(0.6); }
  12% { opacity: 0.7; transform: scale(1); }
  80% { opacity: 0.5; transform: scale(0.8); }
  100% { top: calc(100% + 10px); opacity: 0; transform: scale(0.4); }
`;

export const stageReveal = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const junctionPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.5); opacity: 0.1; }
`;

// ============================================================================
// Layout Styled Components
// ============================================================================

export const Container = styled.div`
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  min-height: 100%;
  overflow-y: auto;
  overflow-x: clip;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

export const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.5rem 0;
  margin-bottom: 1rem;
  transition: color 0.15s ease;

  &:hover {
    color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

export const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

export const PageTitle = styled.h1`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.75rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  margin: 0 0 0.5rem 0;

  svg {
    width: 28px;
    height: 28px;
    color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  }

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

export const PageDescription = styled.p`
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 1rem;
  margin: 0;
  line-height: 1.5;
`;

export const LastModified = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  font-size: 0.875rem;
  margin-top: 0.75rem;

  svg {
    width: 14px;
    height: 14px;
  }
`;

// ============================================================================
// Pipeline Flow Styles - Channel Layout
// ============================================================================

export const PipelineFlowContainer = styled.div`
  position: relative;
  margin-bottom: 2rem;
  isolation: isolate;
`;

export const ChannelTrack = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: ${PIPELINE_UI.CHANNEL_WIDTH_PX}px;
  z-index: 1;
  pointer-events: none;
`;

export const ChannelGlow = styled.div`
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  width: 18px;
  background: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}08;
  border-radius: 10px;
`;

export const ChannelCenterLine = styled.div`
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  width: 2px;
  background: #e0e0e0;
  border-radius: 1px;
`;

export const FlowParticle = styled.div<{
  $size: number;
  $xOffset: number;
  $duration: number;
  $delay: number;
}>`
  position: absolute;
  left: ${(props) => props.$xOffset}px;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size * 1.8}px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}90,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}20
  );
  box-shadow: 0 0 ${(props) => props.$size * 2}px
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}30;
  animation: ${etherealFlow} ${(props) => props.$duration}s ease-in-out infinite;
  animation-delay: ${(props) => props.$delay}s;
  opacity: 0;
  filter: blur(0.5px);
`;

export const PipelineContentColumn = styled.div`
  position: relative;
  z-index: 3;
`;

export const StageRow = styled.div<{ $delay?: number }>`
  display: flex;
  align-items: stretch;
  animation: ${stageReveal} 0.5s ease-out both;
  animation-delay: ${(props) => `${0.1 + (props.$delay ?? 0) * 0.12}s`};
`;

export const StageRowSpacer = styled.div`
  height: ${PIPELINE_UI.STAGE_SPACING_PX}px;
`;

export const JunctionColumn = styled.div<{ $active?: boolean }>`
  width: ${PIPELINE_UI.CHANNEL_WIDTH_PX}px;
  flex-shrink: 0;
  position: relative;
`;

export const JunctionDot = styled.div<{ $active?: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  width: ${PIPELINE_UI.JUNCTION_SIZE_PX}px;
  height: ${PIPELINE_UI.JUNCTION_SIZE_PX}px;
  border-radius: 50%;
  background: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#fff"};
  border: 2.5px solid
    ${(props) => (props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#D0D0D0")};
  box-shadow: ${(props) =>
    props.$active ? `0 0 12px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}40` : "none"};
  transition: all 0.4s ease;
`;

export const JunctionPulseRing = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
  width: ${PIPELINE_UI.JUNCTION_SIZE_PX + 16}px;
  height: ${PIPELINE_UI.JUNCTION_SIZE_PX + 16}px;
  border-radius: 50%;
  background: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}12;
  animation: ${junctionPulse} 2.5s ease-in-out infinite;
`;

export const ConnectorArm = styled.div<{ $active?: boolean }>`
  width: ${PIPELINE_UI.CONNECTOR_ARM_WIDTH_PX}px;
  position: relative;
  flex-shrink: 0;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1.5px;
    background: ${(props) =>
      props.$active
        ? `linear-gradient(90deg, ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}30, ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}15)`
        : "#E0E0E0"};
    transform: translateY(-50%);
    transition: background 0.4s;
  }
`;

// ============================================================================
// Stage Card Styled Components
// ============================================================================

export const StageCardContainer = styled.div<{ $active?: boolean }>`
  flex: 1;
  background: #fff;
  border-radius: 14px;
  border: 1px solid
    ${(props) =>
      props.$active ? `${PIPELINE_UI.PRIMARY_ACCENT_COLOR}25` : "#EBEBEB"};
  box-shadow: ${(props) =>
    props.$active
      ? `0 2px 12px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}08, 0 1px 4px rgba(0, 0, 0, 0.03)`
      : "0 1px 4px rgba(0, 0, 0, 0.03)"};
  position: relative;
  transition: all 0.3s ease;
  overflow: hidden;
`;

export const StageCardAccentBar = styled.div`
  position: absolute;
  top: 0;
  left: 20px;
  right: 20px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: linear-gradient(
    90deg,
    transparent,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}60,
    transparent
  );
`;

export const StageCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
`;

export const StageNumberBadge = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: ${(props) =>
    props.$active ? `${PIPELINE_UI.PRIMARY_ACCENT_COLOR}10` : "#F5F5F5"};
  font-size: 0.6875rem;
  font-weight: 700;
  color: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#BBB"};
  transition: all 0.3s;
`;

export const StageHeaderInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
`;

export const StageTitle = styled.h2`
  font-size: 0.9375rem;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
  letter-spacing: -0.01em;
`;

export const StageSubtitle = styled.p`
  font-size: 0.75rem;
  color: #999;
  margin: 0.125rem 0 0 0;
`;

export const MimeSelector = styled.div`
  display: flex;
  gap: 0.3125rem;
`;

export const MimeButton = styled.button<{ $active: boolean }>`
  padding: 0.1875rem 0.5625rem;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: none;
  background: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#F0F0F0"};
  color: ${(props) => (props.$active ? "#fff" : "#999")};
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${(props) =>
      props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#E8E8E8"};
    color: ${(props) => (props.$active ? "#fff" : "#666")};
  }
`;

export const StageCardContent = styled.div`
  padding: 0 1.25rem 1.125rem;
`;

// ============================================================================
// Component Grid Styled Components
// ============================================================================

export const ComponentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(${PIPELINE_UI.COMPONENT_GRID_MIN_WIDTH}px, 1fr)
  );
  gap: 1rem;

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

export const ComponentCard = styled.button<{
  $selected: boolean;
  $color: string;
}>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.25rem 1rem;
  background: ${(props) => (props.$selected ? `${props.$color}10` : OS_LEGAL_COLORS.surfaceHover)};
  border: 2px solid ${(props) => (props.$selected ? props.$color : OS_LEGAL_COLORS.border)};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-height: ${PIPELINE_UI.COMPONENT_CARD_MIN_HEIGHT_PX}px;

  &:hover {
    border-color: ${(props) => props.$color};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  ${(props) =>
    props.$selected &&
    `
    box-shadow: 0 0 0 3px ${props.$color}20;
  `}
`;

export const SelectedBadge = styled.div<{ $color: string }>`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: ${(props) => props.$color};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 12px;
    height: 12px;
    color: white;
  }
`;

export const ComponentIconWrapper = styled.div`
  margin-bottom: 0.5rem;
`;

export const ComponentName = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textPrimary};
  text-align: center;
  line-height: 1.3;
`;

export const VectorBadge = styled.span`
  font-size: 0.625rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  margin-top: 0.25rem;
`;

export const NoComponents = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  font-size: 0.875rem;
  font-style: italic;
`;

// ============================================================================
// Collapsible Settings Styled Components
// ============================================================================

export const AdvancedSettingsToggle = styled.button<{ $expanded: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  margin-top: 1rem;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceLight};
    color: ${OS_LEGAL_COLORS.textTertiary};
  }

  svg {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
    transform: rotate(${(props) => (props.$expanded ? "90deg" : "0deg")});
  }
`;

export const AdvancedSettingsContent = styled.div<{ $expanded: boolean }>`
  display: ${(props) => (props.$expanded ? "block" : "none")};
  margin-top: 0.75rem;
  padding: 1rem;
  background: #fafafa;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
`;

export const RequiredBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.625rem;
  font-weight: 500;
  border-radius: 4px;
  margin-left: auto;

  svg {
    width: 10px;
    height: 10px;
  }
`;

// ============================================================================
// Intake and Output Points
// ============================================================================

export const IntakeCard = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 1.125rem 1.5rem;
  border-radius: 14px;
  border: 1.5px dashed #ddd;
  background: #fafafa;
  transition: all 0.25s ease;

  svg {
    width: 20px;
    height: 20px;
    color: #aaa;
  }
`;

export const IntakeText = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #888;
`;

export const IntakeNode = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}50;
  background: radial-gradient(
    circle,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}20,
    transparent
  );
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const IntakeNodeCenter = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  box-shadow: 0 0 8px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}50;
`;

export const OutputCheckmark = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR},
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}dd
  );
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}35;

  svg {
    width: 12px;
    height: 12px;
    color: #fff;
  }
`;

export const OutputInfo = styled.div`
  flex: 1;
  padding: 0.5rem 0;
`;

export const OutputTitle = styled.span`
  font-size: 0.8125rem;
  font-weight: 700;
  color: #666;
`;

export const OutputSubtitle = styled.p`
  margin: 0.125rem 0 0;
  font-size: 0.6875rem;
  color: #aaa;
`;

// ============================================================================
// Bottom Sections
// ============================================================================

export const Section = styled.div`
  background: white;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  margin: 0;

  svg {
    width: 18px;
    height: 18px;
    color: #6366f1;
  }
`;

export const SectionDescription = styled.p`
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 0.875rem;
  margin: 0 0 1rem 0;
`;

export const SecretKeyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const SecretKeyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  font-size: 0.8125rem;
`;

export const SecretKeyName = styled.span`
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textPrimary};
  font-family: monospace;
  font-size: 0.75rem;
`;

export const SecretStatusIndicator = styled.span<{ $populated: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
  margin-left: auto;
  background: ${(props) => (props.$populated ? "#ecfdf5" : "#fef3c7")};
  color: ${(props) => (props.$populated ? "#065f46" : "#92400e")};

  svg {
    width: 10px;
    height: 10px;
  }
`;

export const EmptyValue = styled.span`
  color: ${OS_LEGAL_COLORS.textMuted};
  font-style: italic;
  font-size: 0.875rem;
`;

export const DefaultEmbedderDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
`;

export const DefaultEmbedderInfo = styled.div`
  flex: 1;
`;

export const DefaultEmbedderPath = styled.code`
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  word-break: break-all;
`;

export const ActionButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${OS_LEGAL_COLORS.border};
`;

// ============================================================================
// Loading / Error / Warning States
// ============================================================================

export const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 1rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
`;

export const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 1rem;
  padding: 2rem;
  text-align: center;

  svg {
    width: 48px;
    height: 48px;
    color: #ef4444;
  }
`;

export const ErrorMessage = styled.p`
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 0.875rem;
  margin: 0;
`;

export const WarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  margin-bottom: 1.5rem;

  svg {
    width: 20px;
    height: 20px;
    color: #d97706;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
`;

export const WarningText = styled.div`
  font-size: 0.875rem;
  color: #92400e;
  line-height: 1.5;

  strong {
    font-weight: 600;
  }
`;

// ============================================================================
// Form / Secret Field Styled Components
// ============================================================================

export const SecretFieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const SecretFieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

export const SecretFieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const FormField = styled.div`
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.375rem;
`;

export const FormHelperText = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.375rem 0 0 0;
`;

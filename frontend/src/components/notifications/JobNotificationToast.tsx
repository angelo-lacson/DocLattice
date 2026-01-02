import React from "react";
import styled from "styled-components";
import {
  FileText,
  Table2,
  BarChart3,
  Download,
  XCircle,
  LucideIcon,
} from "lucide-react";
import type { JobNotification } from "../../hooks/useJobNotifications";
import type { NotificationType } from "../../hooks/useNotificationWebSocket";

const ToastContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const IconContainer = styled.div<{ $color: string }>`
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${({ $color }) => $color}20;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ $color }) => $color};

  svg {
    width: 18px;
    height: 18px;
  }
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: #1f2937;
  margin-bottom: 2px;
`;

const Message = styled.div`
  font-size: 13px;
  color: #6b7280;
  line-height: 1.3;
`;

interface JobNotificationConfig {
  icon: LucideIcon;
  color: string;
  title: string;
  getMessage: (data: Record<string, unknown>) => string;
}

const JOB_NOTIFICATION_CONFIG: Record<string, JobNotificationConfig> = {
  DOCUMENT_PROCESSED: {
    icon: FileText,
    color: "#4CAF50",
    title: "Document Ready",
    getMessage: (data) =>
      `"${(data.documentTitle as string) || "Document"}" finished processing`,
  },
  EXTRACT_COMPLETE: {
    icon: Table2,
    color: "#2196F3",
    title: "Extract Complete",
    getMessage: (data) =>
      `"${(data.extractName as string) || "Extract"}" completed (${
        data.documentCount || 0
      } docs)`,
  },
  ANALYSIS_COMPLETE: {
    icon: BarChart3,
    color: "#4CAF50",
    title: "Analysis Complete",
    getMessage: (data) =>
      `"${(data.analyzerName as string) || "Analysis"}" finished successfully`,
  },
  ANALYSIS_FAILED: {
    icon: XCircle,
    color: "#F44336",
    title: "Analysis Failed",
    getMessage: (data) =>
      `"${(data.analyzerName as string) || "Analysis"}" encountered an error`,
  },
  EXPORT_COMPLETE: {
    icon: Download,
    color: "#4CAF50",
    title: "Export Ready",
    getMessage: (data) =>
      `"${
        (data.exportName as string) || (data.corpusName as string) || "Export"
      }" is ready for download`,
  },
};

export interface JobNotificationToastProps {
  notification: JobNotification;
}

/**
 * Toast component for job completion notifications.
 * Issue #624: Real-time notifications for job completion.
 */
export function JobNotificationToast({
  notification,
}: JobNotificationToastProps) {
  const config =
    JOB_NOTIFICATION_CONFIG[notification.type] ||
    JOB_NOTIFICATION_CONFIG.DOCUMENT_PROCESSED;

  const Icon = config.icon;

  return (
    <ToastContainer>
      <IconContainer $color={config.color}>
        <Icon />
      </IconContainer>
      <Content>
        <Title>{config.title}</Title>
        <Message>{config.getMessage(notification.data)}</Message>
      </Content>
    </ToastContainer>
  );
}

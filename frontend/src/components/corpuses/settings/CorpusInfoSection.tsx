/**
 * CorpusInfoSection - Metadata grid showing corpus information
 */
import React from "react";
import { Lock, Unlock, MessageSquare, Scale } from "lucide-react";
import { LICENSE_OPTIONS } from "../../../assets/configurations/constants";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardTitle,
  SettingsCardContent,
  MetadataGrid,
  MetadataItem,
  StatusBadge,
} from "../styles/corpusSettingsStyles";

interface CorpusInfoSectionProps {
  corpus: {
    creator?: {
      email: string;
    };
    preferredEmbedder?: string | null;
    created?: string;
    modified?: string;
    isPublic?: boolean;
    allowComments?: boolean;
    license?: string | null;
    licenseLink?: string | null;
  };
}

export const CorpusInfoSection: React.FC<CorpusInfoSectionProps> = ({
  corpus,
}) => {
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <SettingsCard>
      <SettingsCardHeader>
        <SettingsCardTitle>Corpus Information</SettingsCardTitle>
      </SettingsCardHeader>

      <SettingsCardContent>
        <MetadataGrid>
          <MetadataItem>
            <div className="label">Created by</div>
            <div className="value">{corpus.creator?.email || "Unknown"}</div>
          </MetadataItem>

          <MetadataItem>
            <div className="label">Preferred Embedder</div>
            <div className="value">{corpus.preferredEmbedder || "Default"}</div>
          </MetadataItem>

          <MetadataItem>
            <div className="label">Created</div>
            <div className="value">{formatDate(corpus.created)}</div>
          </MetadataItem>

          <MetadataItem>
            <div className="label">Last Updated</div>
            <div className="value">{formatDate(corpus.modified)}</div>
          </MetadataItem>

          <MetadataItem>
            <div className="label">Visibility</div>
            <div className="value">
              <StatusBadge variant={corpus.isPublic ? "public" : "private"}>
                {corpus.isPublic ? <Unlock size={14} /> : <Lock size={14} />}
                {corpus.isPublic ? "Public" : "Private"}
              </StatusBadge>
            </div>
          </MetadataItem>

          {corpus.allowComments && (
            <MetadataItem>
              <div className="label">Comments</div>
              <div className="value">
                <StatusBadge variant="public">
                  <MessageSquare size={14} />
                  Enabled
                </StatusBadge>
              </div>
            </MetadataItem>
          )}

          {corpus.license && (
            <MetadataItem>
              <div className="label">License</div>
              <div className="value">
                <StatusBadge variant="public">
                  <Scale size={14} />
                  {LICENSE_OPTIONS.find((o) => o.value === corpus.license)
                    ?.label || corpus.license}
                </StatusBadge>
              </div>
            </MetadataItem>
          )}
        </MetadataGrid>
      </SettingsCardContent>
    </SettingsCard>
  );
};

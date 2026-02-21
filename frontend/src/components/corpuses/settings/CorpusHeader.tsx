/**
 * CorpusHeader - Header section with title, description, and edit button
 */
import React from "react";
import { Icon } from "semantic-ui-react";
import { Button } from "@os-legal/ui";
import { Edit } from "lucide-react";
import { editingCorpus } from "../../../graphql/cache";
import { CorpusType } from "../../../types/graphql-api";
import {
  CorpusHeaderContainer,
  TitleArea,
  CorpusTitle,
  CorpusDescription,
} from "../styles/corpusSettingsStyles";

interface CorpusHeaderProps {
  corpus: {
    id: string;
    title: string;
    description: string;
  };
}

export const CorpusHeader: React.FC<CorpusHeaderProps> = ({ corpus }) => {
  return (
    <CorpusHeaderContainer>
      <TitleArea>
        <CorpusTitle>{corpus.title}</CorpusTitle>
        <CorpusDescription>
          {corpus.description || "No description provided."}
        </CorpusDescription>
      </TitleArea>
      <Button
        variant="primary"
        onClick={() => editingCorpus(corpus as unknown as CorpusType)}
      >
        <Edit size={16} style={{ marginRight: "0.5rem" }} />
        Edit
      </Button>
    </CorpusHeaderContainer>
  );
};

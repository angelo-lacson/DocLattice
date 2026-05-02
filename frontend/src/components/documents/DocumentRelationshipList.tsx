import React from "react";
import { ArrowRight, FileText, Link2 } from "lucide-react";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";
import { DocumentRelationshipType } from "../../types/graphql-api";
import {
  LinkedDocTitle,
  PopupContent,
  PopupHeader,
  RelationshipDetails,
  RelationshipDirection,
  RelationshipIcon,
  RelationshipItem,
  RelationshipLabel,
} from "./ModernDocumentItem.styles";

interface DocumentRelationshipListProps {
  /** ID of the document the popup is anchored to (used to determine direction). */
  documentId: string;
  /** Number of relationships to advertise in the header. */
  relationshipCount: number;
  /** Resolved relationship rows; may be undefined while still loading. */
  relationships?: DocumentRelationshipType[];
}

/**
 * Shared relationship popup body used by both the card and list views of
 * `ModernDocumentItem`. Renders a header with the count plus a scrollable
 * list of linked documents (or a loading placeholder).
 */
export const DocumentRelationshipList: React.FC<
  DocumentRelationshipListProps
> = ({ documentId, relationshipCount, relationships }) => (
  <>
    <PopupHeader>
      <Link2 />
      <span>
        {relationshipCount} Linked Document
        {relationshipCount !== 1 ? "s" : ""}
      </span>
    </PopupHeader>
    <PopupContent>
      {relationships && relationships.length > 0 ? (
        relationships.map((rel) => {
          const isSource = rel.sourceDocument?.id === documentId;
          const linkedDoc = isSource ? rel.targetDocument : rel.sourceDocument;
          const labelColor = rel.annotationLabel?.color;

          return (
            <RelationshipItem key={rel.id}>
              <RelationshipIcon $color={labelColor || "#14b8a6"}>
                <FileText />
              </RelationshipIcon>
              <RelationshipDetails>
                {rel.annotationLabel?.text && (
                  <RelationshipLabel $color={labelColor}>
                    {rel.annotationLabel.text}
                  </RelationshipLabel>
                )}
                <LinkedDocTitle>
                  {linkedDoc?.title || "Untitled Document"}
                </LinkedDocTitle>
                <RelationshipDirection>
                  {isSource ? (
                    <>
                      This doc <ArrowRight size={10} /> linked doc
                    </>
                  ) : (
                    <>
                      Linked doc <ArrowRight size={10} /> this doc
                    </>
                  )}
                </RelationshipDirection>
              </RelationshipDetails>
            </RelationshipItem>
          );
        })
      ) : (
        <div
          style={{
            color: OS_LEGAL_COLORS.textMuted,
            fontSize: "0.75rem",
          }}
        >
          Loading relationships...
        </div>
      )}
    </PopupContent>
  </>
);

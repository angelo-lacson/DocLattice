import { useState } from "react";
import { Card, Dimmer, Loader } from "semantic-ui-react";
import { useDropzone } from "react-dropzone";
import styled from "styled-components";

import _ from "lodash";

import { DocumentItem } from "./DocumentItem";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { DocumentType, PageInfo } from "../../types/graphql-api";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { determineCardColCount } from "../../utils/layout";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

const ResponsiveCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 24px;
  width: 100%;
  padding: 24px;
  align-content: start;
  background: linear-gradient(
    180deg,
    rgba(249, 250, 251, 0.5) 0%,
    rgba(255, 255, 255, 0) 100%
  );

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    padding: 16px;
    gap: 16px;
  }

  @media (min-width: 481px) and (max-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 20px;
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (min-width: 1025px) and (max-width: 1440px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 1441px) {
    grid-template-columns: repeat(4, 1fr);
    max-width: 1800px;
    margin: 0 auto;
  }
`;

const DropZoneOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.95) 0%,
    rgba(139, 92, 246, 0.95) 100%
  );
  backdrop-filter: blur(10px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const DropZoneContent = styled.div`
  padding: 40px;
  background: white;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
  animation: slideUp 0.3s ease;

  h3 {
    margin: 0 0 8px 0;
    font-size: 1.5rem;
    font-weight: 600;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  p {
    margin: 0;
    color: #64748b;
    font-size: 0.95rem;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

interface DocumentCardProps {
  style?: Record<string, any>;
  containerStyle?: React.CSSProperties;
  items: DocumentType[];
  pageInfo: PageInfo | undefined;
  loading: boolean;
  loading_message: string;
  onShiftClick?: (document: DocumentType) => void;
  onClick?: (document: DocumentType) => void;
  removeFromCorpus?: (doc_ids: string[]) => void | any;
  fetchMore: (args?: any) => void | any;
  onDrop: (acceptedFiles: File[]) => void;
  corpusId: string | null;
}

export const DocumentCards = ({
  containerStyle,
  style,
  items,
  pageInfo,
  loading,
  loading_message,
  onShiftClick,
  onClick,
  removeFromCorpus,
  fetchMore,
  onDrop,
  corpusId,
}: DocumentCardProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;
  const card_cols = determineCardColCount(width);

  const [contextMenuOpen, setContextMenuOpen] = useState<string | null>(null);

  const handleUpdate = () => {
    if (!loading && pageInfo?.hasNextPage) {
      console.log("cursor", pageInfo.endCursor);
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  let cards = [
    <PlaceholderCard
      key="PlaceholderCard"
      title="No Matching Documents..."
      style={{
        minHeight: "200px",
        background:
          "linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)",
        border: "2px dashed rgba(99, 102, 241, 0.2)",
        borderRadius: "16px",
      }}
    />,
  ];

  if (items && items.length > 0) {
    cards = items.map((node, index: number) => {
      return (
        <DocumentItem
          key={node?.id ? node.id : `doc_item_${index}`}
          item={node}
          onClick={onClick}
          onShiftClick={onShiftClick}
          contextMenuOpen={contextMenuOpen}
          setContextMenuOpen={setContextMenuOpen}
          removeFromCorpus={removeFromCorpus}
        />
      );
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div
      {...getRootProps()}
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)",
        ...containerStyle,
      }}
    >
      <input {...getInputProps()} />
      {isDragActive && (
        <DropZoneOverlay>
          <DropZoneContent>
            <h3>Drop your files here</h3>
            <p>Release to upload documents to this corpus</p>
          </DropZoneContent>
        </DropZoneOverlay>
      )}
      <Dimmer active={loading} inverted>
        <Loader size="large" content={loading_message} />
      </Dimmer>
      <div
        className="DocumentCards"
        style={{
          width: "100%",
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          minHeight: 0,
          ...style,
        }}
      >
        <ResponsiveCardGrid>{cards}</ResponsiveCardGrid>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </div>
    </div>
  );
};

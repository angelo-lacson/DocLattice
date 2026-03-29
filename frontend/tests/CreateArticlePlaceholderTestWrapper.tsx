import React from "react";
import { CreateArticlePlaceholder } from "../src/components/documents/CreateArticlePlaceholder";

interface Props {
  viewMode?: "modern-card" | "modern-list";
}

export const CreateArticlePlaceholderHarness: React.FC<Props> = ({
  viewMode = "modern-card",
}) => {
  const [clicked, setClicked] = React.useState(false);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#f5f5f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
      data-testid="harness-root"
    >
      <CreateArticlePlaceholder
        viewMode={viewMode}
        onClick={() => setClicked(true)}
      />
      {clicked && <div data-testid="click-detected">Clicked!</div>}
    </div>
  );
};

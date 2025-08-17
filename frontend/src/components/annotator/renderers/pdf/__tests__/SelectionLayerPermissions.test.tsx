import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Provider as JotaiProvider } from "jotai";
import SelectionLayer from "../SelectionLayer";
import { PDFPageInfo } from "../../../types/pdf";
import { AnnotationLabelType } from "../../../../../types/graphql-api";

// Mock the hooks and external dependencies
vi.mock("../../../context/CorpusAtom", () => ({
  useCorpusState: vi.fn(),
}));

vi.mock("../../../hooks/useAnnotationSelection", () => ({
  useAnnotationSelection: () => ({
    setSelectedAnnotations: vi.fn(),
  }),
}));

vi.mock("jotai", async () => {
  const actual = await vi.importActual("jotai");
  return {
    ...actual,
    useAtom: vi.fn(() => [false, vi.fn()]),
  };
});

import { useCorpusState } from "../../../context/CorpusAtom";

describe("SelectionLayer Permissions", () => {
  const mockPageInfo = {
    page: { pageNumber: 1 },
    getPageAnnotationJson: vi.fn(() => ({
      rawText: "Selected text",
      tokensJsons: [],
    })),
    getAnnotationForBounds: vi.fn(),
  } as unknown as PDFPageInfo;

  const mockActiveLabel: AnnotationLabelType = {
    id: "label-1",
    text: "Test Label",
    color: "#0066cc",
    description: "Test label for annotations",
    labelType: "SPAN_LABEL" as any,
    icon: "tag" as any,
    readOnly: false,
  };

  const mockCreateAnnotation = vi.fn();

  const renderSelectionLayer = (props: Partial<any> = {}) => {
    const defaultProps = {
      pageInfo: mockPageInfo,
      read_only: false,
      activeSpanLabel: mockActiveLabel,
      createAnnotation: mockCreateAnnotation,
      pageNumber: 0,
      ...props,
    };

    return render(
      <JotaiProvider>
        <SelectionLayer {...defaultProps} />
      </JotaiProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("User has UPDATE permissions", () => {
    beforeEach(() => {
      (useCorpusState as any).mockReturnValue({
        canUpdateCorpus: true,
        myPermissions: ["CAN_REMOVE", "CAN_CREATE", "CAN_READ", "CAN_UPDATE"],
        selectedCorpus: { id: "corpus-1" },
        humanSpanLabels: [mockActiveLabel],
        humanTokenLabels: [],
      });
    });

    it("should allow text selection and show annotation options when not read-only", async () => {
      renderSelectionLayer({ read_only: false });

      const selectionLayer = screen.getByRole("generic"); // The main div

      // Simulate mouse selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseMove(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      // Should show the action menu with annotation option
      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
        expect(screen.getByTestId("copy-text-button")).toBeInTheDocument();
        expect(screen.getByTestId("apply-label-button")).toBeInTheDocument();
      });
    });

    it("should allow applying labels when user has permissions and not read-only", async () => {
      renderSelectionLayer({ read_only: false });

      const selectionLayer = screen.getByRole("generic");

      // Simulate selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("apply-label-button")).toBeInTheDocument();
      });

      // Click apply label
      await userEvent.click(screen.getByTestId("apply-label-button"));

      // Should call createAnnotation
      await waitFor(() => {
        expect(mockCreateAnnotation).toHaveBeenCalled();
      });
    });
  });

  describe("User lacks UPDATE permissions", () => {
    beforeEach(() => {
      (useCorpusState as any).mockReturnValue({
        canUpdateCorpus: false,
        myPermissions: ["CAN_READ"],
        selectedCorpus: { id: "corpus-1" },
        humanSpanLabels: [mockActiveLabel],
        humanTokenLabels: [],
      });
    });

    it("should only allow copying when user lacks UPDATE permissions", async () => {
      renderSelectionLayer({ read_only: false });

      const selectionLayer = screen.getByRole("generic");

      // Simulate selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
        expect(screen.getByTestId("copy-text-button")).toBeInTheDocument();

        // Should NOT show apply label button
        expect(
          screen.queryByTestId("apply-label-button")
        ).not.toBeInTheDocument();

        // Should show helpful message about lack of permissions
        expect(screen.getByText("No corpus permissions")).toBeInTheDocument();
      });
    });
  });

  describe("Read-only mode", () => {
    beforeEach(() => {
      (useCorpusState as any).mockReturnValue({
        canUpdateCorpus: true,
        myPermissions: ["CAN_REMOVE", "CAN_CREATE", "CAN_READ", "CAN_UPDATE"],
        selectedCorpus: { id: "corpus-1" },
        humanSpanLabels: [mockActiveLabel],
        humanTokenLabels: [],
      });
    });

    it("should only allow copying when explicitly read-only", async () => {
      renderSelectionLayer({ read_only: true });

      const selectionLayer = screen.getByRole("generic");

      // Simulate selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
        expect(screen.getByTestId("copy-text-button")).toBeInTheDocument();

        // Should NOT show apply label button even with permissions
        expect(
          screen.queryByTestId("apply-label-button")
        ).not.toBeInTheDocument();

        // Should show read-only message
        expect(screen.getByText("Document is read-only")).toBeInTheDocument();
      });
    });

    it("should show read-only message even with UPDATE permissions", async () => {
      renderSelectionLayer({ read_only: true });

      const selectionLayer = screen.getByRole("generic");

      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        // Should show read-only message instead of permission message
        expect(screen.getByText("Document is read-only")).toBeInTheDocument();
        expect(
          screen.queryByText("No corpus permissions")
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("No labelset configured", () => {
    beforeEach(() => {
      (useCorpusState as any).mockReturnValue({
        canUpdateCorpus: true,
        myPermissions: ["CAN_REMOVE", "CAN_CREATE", "CAN_READ", "CAN_UPDATE"],
        selectedCorpus: null, // No corpus = no labelset
        humanSpanLabels: [],
        humanTokenLabels: [],
      });
    });

    it("should show helpful message when no labelset is configured", async () => {
      renderSelectionLayer({ read_only: false, activeSpanLabel: null });

      const selectionLayer = screen.getByRole("generic");

      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
        expect(screen.getByTestId("copy-text-button")).toBeInTheDocument();

        // Should show helpful message about no labelset
        expect(screen.getByText("No labelset configured")).toBeInTheDocument();
        expect(
          screen.getByText(
            "Click the label selector (bottom right) to create one"
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe("Keyboard shortcuts", () => {
    beforeEach(() => {
      (useCorpusState as any).mockReturnValue({
        canUpdateCorpus: true,
        myPermissions: ["CAN_REMOVE", "CAN_CREATE", "CAN_READ", "CAN_UPDATE"],
        selectedCorpus: { id: "corpus-1" },
        humanSpanLabels: [mockActiveLabel],
        humanTokenLabels: [],
      });
    });

    it("should handle copy shortcut (C key)", async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      renderSelectionLayer({ read_only: false });

      const selectionLayer = screen.getByRole("generic");

      // Create selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
      });

      // Press C key for copy
      fireEvent.keyDown(document, { key: "c" });

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith("Selected text");
      });
    });

    it("should handle apply annotation shortcut (A key) when not read-only", async () => {
      renderSelectionLayer({ read_only: false });

      const selectionLayer = screen.getByRole("generic");

      // Create selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
      });

      // Press A key for apply annotation
      fireEvent.keyDown(document, { key: "a" });

      await waitFor(() => {
        expect(mockCreateAnnotation).toHaveBeenCalled();
      });
    });

    it("should handle escape key to cancel selection", async () => {
      renderSelectionLayer({ read_only: false });

      const selectionLayer = screen.getByRole("generic");

      // Create selection
      fireEvent.mouseDown(selectionLayer, {
        clientX: 100,
        clientY: 100,
        buttons: 1,
      });

      fireEvent.mouseUp(selectionLayer, {
        clientX: 200,
        clientY: 150,
      });

      await waitFor(() => {
        expect(screen.getByTestId("selection-action-menu")).toBeInTheDocument();
      });

      // Press Escape to cancel
      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => {
        expect(
          screen.queryByTestId("selection-action-menu")
        ).not.toBeInTheDocument();
      });
    });
  });
});

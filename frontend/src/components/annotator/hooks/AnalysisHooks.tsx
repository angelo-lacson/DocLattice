import { useEffect, useMemo, useCallback } from "react";
import { useQuery, useLazyQuery, useReactiveVar } from "@apollo/client";
import { toast } from "react-toastify";
import _ from "lodash";
import { useAtom, useAtomValue } from "jotai";

import {
  AnalysisType,
  ExtractType,
  LabelType,
  LabelDisplayBehavior,
} from "../../../types/graphql-api";
import {
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
  GetDocumentAnalysesAndExtractsOutput,
  GetDocumentAnalysesAndExtractsInput,
  GET_ANNOTATIONS_FOR_ANALYSIS,
  GetAnnotationsForAnalysisOutput,
  GetAnnotationsForAnalysisInput,
  GET_DATACELLS_FOR_EXTRACT,
  GetDatacellsForExtractOutput,
  GetDatacellsForExtractInput,
} from "../../../graphql/queries";
import {
  analysisRowsAtom,
  dataCellsAtom,
  columnsAtom,
  analysesAtom,
  extractsAtom,
  selectedAnalysisAtom,
  selectedExtractAtom,
  allowUserInputAtom,
} from "../context/AnalysisAtoms";
import {
  showAnnotationBoundingBoxesAtom,
  showAnnotationLabelsAtom,
  showSelectedAnnotationOnlyAtom,
} from "../context/UISettingsAtom";
import { useInitialAnnotations, usePdfAnnotations } from "./AnnotationHooks";
import { useCorpusState } from "../context/CorpusAtom";
import {
  useQueryLoadingStates,
  useQueryErrors,
} from "../context/UISettingsAtom";
import {
  convertToServerAnnotation,
  convertToDocTypeAnnotation,
} from "../../../utils/transform";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
} from "../types/annotations";
import { selectedDocumentAtom } from "../context/DocumentAtom";
import {
  selectedAnalysesIds,
  selectedExtractIds,
} from "../../../graphql/cache";

/**
 * Custom hook to manage analysis and extract data using Jotai atoms.
 * @returns An object containing analysis and extract data and related functions.
 */
export const useAnalysisManager = () => {
  // Get document and corpus from atoms instead of props
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const { selectedCorpus } = useCorpusState();

  // Use atoms for state management
  const [analysisRows, setAnalysisRows] = useAtom(analysisRowsAtom);
  const [dataCells, setDataCells] = useAtom(dataCellsAtom);
  const [columns, setColumns] = useAtom(columnsAtom);
  const [analyses, setAnalyses] = useAtom(analysesAtom);
  const [extracts, setExtracts] = useAtom(extractsAtom);

  const [selected_analysis, setSelectedAnalysis] =
    useAtom(selectedAnalysisAtom);
  const [selected_extract, setSelectedExtract] = useAtom(selectedExtractAtom);

  const [, setAllowUserInput] = useAtom(allowUserInputAtom);
  const [, setShowAnnotationBoundingBoxes] = useAtom(
    showAnnotationBoundingBoxesAtom
  );
  const [, setShowAnnotationLabels] = useAtom(showAnnotationLabelsAtom);
  const [, setShowSelectedAnnotationOnly] = useAtom(
    showSelectedAnnotationOnlyAtom
  );

  const { replaceDocTypeAnnotations, replaceAnnotations, replaceRelations } =
    usePdfAnnotations();
  const { setCorpus } = useCorpusState();

  const { setQueryLoadingStates } = useQueryLoadingStates();
  const { setQueryErrors } = useQueryErrors();

  const {
    data: analysesData,
    loading: analysesLoading,
    error: analysesError,
    refetch: fetchDocumentAnalysesAndExtracts,
  } = useQuery<
    GetDocumentAnalysesAndExtractsOutput,
    GetDocumentAnalysesAndExtractsInput
  >(GET_DOCUMENT_ANALYSES_AND_EXTRACTS, {
    variables: {
      documentId: selectedDocument?.id ?? "",
      ...(selectedCorpus?.id ? { corpusId: selectedCorpus.id } : {}),
    },
    skip: !selectedDocument?.id,
    fetchPolicy: "network-only",
  });

  const [
    fetchAnnotationsForAnalysis,
    {
      loading: annotationsLoading,
      error: annotationsError,
      data: annotationsData,
    },
  ] = useLazyQuery<
    GetAnnotationsForAnalysisOutput,
    GetAnnotationsForAnalysisInput
  >(GET_ANNOTATIONS_FOR_ANALYSIS);

  const [
    fetchDataCellsForExtract,
    { loading: datacellsLoading, error: datacellsError, data: datacellsData },
  ] = useLazyQuery<GetDatacellsForExtractOutput, GetDatacellsForExtractInput>(
    GET_DATACELLS_FOR_EXTRACT
  );

  // Access initial annotations and relations
  const { initialAnnotations, initialRelations } = useInitialAnnotations();

  /**
   * Resets the analysis, data cell, and column states.
   */
  const resetStates = () => {
    setAnalysisRows([]);
    setDataCells([]);
    setColumns([]);
  };

  // Update query loading states and errors for analyses
  useEffect(() => {
    setQueryLoadingStates((prevState) => ({
      ...prevState,
      analyses: analysesLoading,
    }));

    if (analysesError) {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        analyses: analysesError,
      }));
      toast.error("Failed to fetch document analyses and extracts");
      console.error(analysesError);
    } else {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        analyses: undefined,
      }));
    }
  }, [analysesLoading, analysesError]);

  // Fetch analyses and extracts when the component mounts or the document changes.
  useEffect(() => {
    if (analysesData && analysesData.documentCorpusActions) {
      const { analysisRows, extracts } = analysesData.documentCorpusActions;
      setAnalysisRows(analysisRows);
      setExtracts(extracts);
      const fetchedAnalyses = analysisRows
        .map((row) => row.analysis)
        .filter((a): a is AnalysisType => a !== null && a !== undefined);
      setAnalyses(fetchedAnalyses);

      console.log(
        "[AnalysisHooks] ✅ Loaded analyses and extracts:",
        fetchedAnalyses.length,
        "analyses,",
        extracts.length,
        "extracts"
      );
      console.log(
        "[AnalysisHooks] Analysis IDs:",
        fetchedAnalyses.map((a) => a.id)
      );
      console.log(
        "[AnalysisHooks] Extract IDs:",
        extracts.map((e) => e.id)
      );
    }
  }, [analysesData]);

  // Reactively read ID selections from reactive vars (set by CentralRouteManager)
  const analysis_ids_from_reactive_var = useReactiveVar(selectedAnalysesIds);
  const extract_ids_from_reactive_var = useReactiveVar(selectedExtractIds);

  // Sync reactive var IDs → Jotai atoms (find full objects in fetched lists)
  // CentralRouteManager sets IDs, we resolve them to full objects for UI
  useEffect(() => {
    if (analyses.length === 0 && extracts.length === 0) {
      return; // Wait for data to load
    }

    // Sync analysis: ID → full object
    if (analysis_ids_from_reactive_var.length > 0) {
      const analysisId = analysis_ids_from_reactive_var[0];
      if (!selected_analysis || selected_analysis.id !== analysisId) {
        const matchingAnalysis = analyses.find((a) => a.id === analysisId);
        if (matchingAnalysis) {
          console.log(
            "[AnalysisHooks] ✅ Setting analysis:",
            matchingAnalysis.id
          );
          setSelectedAnalysis(matchingAnalysis);
        } else {
          console.warn("[AnalysisHooks] ❌ Analysis not found:", analysisId);
        }
      }
    } else if (selected_analysis) {
      // Clear selection if reactive var is empty
      setSelectedAnalysis(null);
    }

    // Sync extract: ID → full object
    if (extract_ids_from_reactive_var.length > 0) {
      const extractId = extract_ids_from_reactive_var[0];
      if (!selected_extract || selected_extract.id !== extractId) {
        const matchingExtract = extracts.find((e) => e.id === extractId);
        if (matchingExtract) {
          console.log(
            "[AnalysisHooks] ✅ Setting extract:",
            matchingExtract.id
          );
          setSelectedExtract(matchingExtract);
        } else {
          console.warn("[AnalysisHooks] ❌ Extract not found:", extractId);
        }
      }
    } else if (selected_extract) {
      // Clear selection if reactive var is empty
      setSelectedExtract(null);
    }
  }, [
    analyses,
    extracts,
    analysis_ids_from_reactive_var,
    extract_ids_from_reactive_var,
  ]);

  // Fetch analyses and extracts only when we have a valid document
  useEffect(() => {
    console.log("selectedDocument", selectedDocument);
    if (selectedDocument?.id) {
      fetchDocumentAnalysesAndExtracts();
    }
  }, [selectedDocument?.id]);

  // Reset states when the selected analysis or extract changes.
  useEffect(() => {
    resetStates();
    if (!selected_analysis && !selected_extract) {
      fetchDocumentAnalysesAndExtracts();
    }
  }, [selected_analysis, selected_extract]);

  // Fetch annotations for the selected analysis.
  useEffect(() => {
    if (!selected_analysis) {
      // When analysis is deselected, restore initial annotations AND relations
      // BUT only if extract is also not selected (extract effect handles that case)
      if (!selected_extract) {
        replaceAnnotations(initialAnnotations);
        replaceRelations(initialRelations);
        replaceDocTypeAnnotations([]);
        setDataCells([]);
      }
      return;
    }

    // Otherwise fetch new annotations
    fetchAnnotationsForAnalysis({
      variables: {
        analysisId: selected_analysis.id,
      },
    });
  }, [
    selected_analysis,
    selected_extract,
    initialAnnotations,
    initialRelations,
  ]);

  // Update query loading states and errors for annotations
  useEffect(() => {
    setQueryLoadingStates((prevState) => ({
      ...prevState,
      annotations: annotationsLoading,
    }));

    if (annotationsError) {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        annotations: annotationsError,
      }));
      toast.error("Failed to fetch annotations for analysis");
      console.error(annotationsError);
    } else {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        annotations: undefined,
      }));
    }

    if (
      annotationsData &&
      annotationsData.analysis &&
      annotationsData.analysis.fullAnnotationList
    ) {
      // Clear existing annotations, relations, and datacell data
      // Analysis annotations should show ONLY analysis data, not mixed with document relations
      replaceAnnotations([]);
      replaceRelations([]);
      replaceDocTypeAnnotations([]);
      setDataCells([]);

      console.log("Annotations data retrieved!", annotationsData);

      // Process span annotations
      const rawSpanAnnotations =
        annotationsData.analysis.fullAnnotationList.filter(
          (annot) =>
            annot.annotationLabel.labelType === LabelType.TokenLabel ||
            annot.annotationLabel.labelType === LabelType.SpanLabel
        );

      // Process span annotations
      const processedSpanAnnotations = rawSpanAnnotations.map((annotation) =>
        convertToServerAnnotation(annotation)
      ) as (ServerTokenAnnotation | ServerSpanAnnotation)[];

      // Replace processed span annotations
      replaceAnnotations(processedSpanAnnotations);

      // Update span labels
      const uniqueSpanLabels = _.uniqBy(
        processedSpanAnnotations.map((a) => a.annotationLabel),
        "id"
      );
      setCorpus({ spanLabels: uniqueSpanLabels });

      // Process doc type annotations
      const rawDocAnnotations =
        annotationsData.analysis.fullAnnotationList.filter(
          (annot) => annot.annotationLabel.labelType === LabelType.DocTypeLabel
        );

      const processedDocAnnotations = rawDocAnnotations.map((annotation) =>
        convertToDocTypeAnnotation(annotation)
      );

      // Replace doc type annotations
      replaceDocTypeAnnotations(processedDocAnnotations);

      // Update doc type labels
      const uniqueDocLabels = _.uniqBy(
        processedDocAnnotations.map((a) => a.annotationLabel),
        "id"
      );
      setCorpus({ docTypeLabels: uniqueDocLabels });
    }
  }, [annotationsLoading, annotationsError, annotationsData]);

  // Fetch data cells for the selected extract.
  useEffect(() => {
    if (selected_extract) {
      console.log(
        "selected_extract changed in AnalysisHooks",
        selected_extract
      );
      setAllowUserInput(false);
      setSelectedAnalysis(null);

      // Clear existing annotations and datacell data
      replaceAnnotations([]);
      replaceDocTypeAnnotations([]);
      setDataCells([]);

      fetchDataCellsForExtract({
        variables: {
          extractId: selected_extract.id,
        },
      });
    } else {
      setAllowUserInput(true);

      // Don't restore annotations here - the analysis effect (Effect 1) handles
      // restoring initialAnnotations when both analysis and extract are null
    }
  }, [selected_extract, selectedDocument?.id, selectedCorpus?.id]);

  // Update query loading states and errors for datacells
  useEffect(() => {
    setQueryLoadingStates((prevState) => ({
      ...prevState,
      datacells: datacellsLoading,
    }));

    if (datacellsError) {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        datacells: datacellsError,
      }));
      toast.error("Failed to fetch data cells for extract");
      console.error(datacellsError);
    } else {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        datacells: undefined,
      }));
    }

    if (datacellsData?.extract && selectedDocument?.id) {
      // Clear existing datacell data and annotations
      setDataCells([]);
      replaceAnnotations([]);

      // Filter datacells to only include those matching the selected document
      const filteredDatacells = (
        datacellsData.extract.fullDatacellList || []
      ).filter((datacell) => datacell.document?.id === selectedDocument.id);

      // Set new datacell data and columns
      setDataCells(filteredDatacells);
      setColumns(datacellsData.extract.fieldset.fullColumnList || []);

      // Process annotations from filtered datacells
      const processedAnnotations = filteredDatacells
        .flatMap((datacell) => datacell.fullSourceList || [])
        .map((annotation) => convertToServerAnnotation(annotation));

      // Replace annotations with processed annotations
      replaceAnnotations(processedAnnotations);
    }
  }, [datacellsLoading, datacellsError, datacellsData, selectedDocument?.id]);

  /**
   * Handles selection of an analysis.
   *
   * @param analysis The analysis to select.
   */
  const onSelectAnalysis = useCallback(
    (analysis: AnalysisType | null) => {
      // When a new analysis is loaded, reset the view behaviors
      setShowAnnotationBoundingBoxes(true);
      setShowAnnotationLabels(LabelDisplayBehavior.ON_HOVER);
      setShowSelectedAnnotationOnly(false);
      setSelectedAnalysis(analysis);
      setSelectedExtract(null);

      // Update reactive var so CentralRouteManager syncs to URL
      selectedAnalysesIds(analysis ? [analysis.id] : []);
      selectedExtractIds([]);
    },
    [
      setShowAnnotationBoundingBoxes,
      setShowAnnotationLabels,
      setShowSelectedAnnotationOnly,
      setSelectedAnalysis,
      setSelectedExtract,
    ]
  );

  /**
   * Handles selection of an extract.
   *
   * @param extract The extract to select.
   */
  const onSelectExtract = (extract: ExtractType | null) => {
    setSelectedExtract(extract);
    setSelectedAnalysis(null);

    // Update reactive var so CentralRouteManager syncs to URL
    selectedExtractIds(extract ? [extract.id] : []);
    selectedAnalysesIds([]);
  };

  return {
    analysisRows,
    dataCells,
    columns,
    analyses,
    extracts,
    fetchDocumentAnalysesAndExtracts,
    resetStates,
    onSelectAnalysis,
    onSelectExtract,
    setDataCells,
  };
};

/**
 * Hook to manage selection state for analyses and extracts.
 * @returns Object containing selection states and setter functions
 */
export function useAnalysisSelection() {
  const [selectedAnalysis, setSelectedAnalysis] = useAtom(selectedAnalysisAtom);
  const [selectedExtract, setSelectedExtract] = useAtom(selectedExtractAtom);

  return useMemo(
    () => ({
      selectedAnalysis,
      setSelectedAnalysis,
      selectedExtract,
      setSelectedExtract,
      // Helper to clear both selections
      clearSelections: () => {
        setSelectedAnalysis(null);
        setSelectedExtract(null);
      },
    }),
    [selectedAnalysis, setSelectedAnalysis, selectedExtract, setSelectedExtract]
  );
}

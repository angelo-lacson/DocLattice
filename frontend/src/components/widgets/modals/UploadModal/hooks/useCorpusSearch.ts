import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@apollo/client";
import _ from "lodash";
import {
  GET_CORPUSES,
  GetCorpusesInputs,
  GetCorpusesOutputs,
} from "../../../../../graphql/queries";
import { CorpusType } from "../../../../../types/graphql-api";
import { getPermissions } from "../../../../../utils/transform";
import { PermissionTypes } from "../../../../types";

interface UseCorpusSearchProps {
  /** Skip query when modal is closed */
  skip?: boolean;
  /** Filter to only show corpuses user can update */
  requireUpdatePermission?: boolean;
}

interface UseCorpusSearchReturn {
  corpuses: CorpusType[];
  loading: boolean;
  error: any;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  debouncedSetSearchTerm: (term: string) => void;
  refetch: () => void;
}

/**
 * Hook for searching and filtering corpuses.
 * Includes debounced search and permission filtering.
 */
export function useCorpusSearch({
  skip = false,
  requireUpdatePermission = true,
}: UseCorpusSearchProps = {}): UseCorpusSearchReturn {
  const [searchTerm, setSearchTerm] = useState("");

  // Memoize variables to prevent Apollo refetch loops
  const variables = useMemo(() => ({ textSearch: searchTerm }), [searchTerm]);

  const { data, loading, error, refetch } = useQuery<
    GetCorpusesOutputs,
    GetCorpusesInputs
  >(GET_CORPUSES, {
    variables,
    notifyOnNetworkStatusChange: true,
    skip,
  });

  // Refetch when search term changes
  useEffect(() => {
    if (!skip) {
      refetch();
    }
  }, [searchTerm, skip, refetch]);

  // Debounced search term setter
  const debouncedSetSearchTerm = useCallback(
    _.debounce(
      (term: string) => {
        setSearchTerm(term);
      },
      400,
      { maxWait: 1000 }
    ),
    []
  );

  // Extract and filter corpuses
  const corpuses = useMemo(() => {
    const allCorpuses = data?.corpuses?.edges
      ? data.corpuses.edges
          .map((edge) => edge?.node)
          .filter((item): item is CorpusType => !!item)
      : [];

    if (!requireUpdatePermission) {
      return allCorpuses;
    }

    // Filter to corpuses user can update
    return allCorpuses.filter((corpus) =>
      getPermissions(corpus?.myPermissions || []).includes(
        PermissionTypes.CAN_UPDATE
      )
    );
  }, [data, requireUpdatePermission]);

  return {
    corpuses,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    debouncedSetSearchTerm,
    refetch,
  };
}

export default useCorpusSearch;

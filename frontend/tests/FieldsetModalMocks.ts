/**
 * GraphQL mock builders for `FieldsetModal` Playwright CT tests.
 *
 * Split into a separate module from `FieldsetModalTestWrapper.tsx` because
 * Playwright CT's babel plugin requires that wrapper files only export
 * mountable components.
 */
import { MockedResponse } from "@apollo/client/testing";
import { REQUEST_GET_FIELDSET } from "../src/graphql/queries";
import { FieldsetType, ColumnType } from "../src/types/graphql-api";

/**
 * Must match `DEFAULT_TASK` in
 * `frontend/src/components/widgets/modals/CreateColumnModal.tsx`. The
 * production constant is not exported, so we keep a single copy here to
 * avoid duplicating the magic string across multiple mock entries.
 */
export const DEFAULT_EXTRACT_TASK_NAME =
  "opencontractserver.tasks.data_extract_tasks.doc_extract_query_task";

export const buildGetFieldsetMock = (
  id: string,
  payload: Partial<FieldsetType> & {
    fullColumnList?: ColumnType[];
  }
): MockedResponse => ({
  request: { query: REQUEST_GET_FIELDSET, variables: { id } },
  result: {
    data: {
      fieldset: {
        __typename: "FieldsetType",
        id,
        name: payload.name ?? "Test Fieldset",
        description: payload.description ?? "",
        inUse: payload.inUse ?? false,
        creator: { __typename: "UserType", id: "u1", username: "alice" },
        fullColumnList: (payload.fullColumnList ?? []).map((col) => ({
          __typename: "ColumnType",
          mustContainText: null,
          extractIsList: false,
          instructions: "",
          matchText: "",
          limitToLabel: "",
          query: "",
          taskName: DEFAULT_EXTRACT_TASK_NAME,
          outputType: "str",
          ...col,
        })),
      },
    },
  },
});

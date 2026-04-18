/**
 * GraphQL mock builders for `FieldsetModal` Playwright CT tests.
 *
 * Split into a separate module from `FieldsetModalTestWrapper.tsx` because
 * Playwright CT's babel plugin requires that wrapper files only export
 * mountable components.
 */
import { MockedResponse } from "@apollo/client/testing";
import { REQUEST_GET_FIELDSET } from "../src/graphql/queries";
import {
  REQUEST_CREATE_FIELDSET,
  REQUEST_UPDATE_FIELDSET,
  REQUEST_CREATE_COLUMN,
  REQUEST_DELETE_COLUMN,
} from "../src/graphql/mutations";
import { FieldsetType, ColumnType } from "../src/types/graphql-api";

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
          taskName:
            "opencontractserver.tasks.data_extract_tasks.doc_extract_query_task",
          outputType: "str",
          ...col,
        })),
      },
    },
  },
});

export const buildCreateFieldsetMock = (
  name: string,
  description = ""
): MockedResponse => ({
  request: {
    query: REQUEST_CREATE_FIELDSET,
    variables: { name, description },
  },
  result: {
    data: {
      createFieldset: {
        __typename: "CreateFieldsetOutputType",
        ok: true,
        message: "ok",
        obj: {
          __typename: "FieldsetType",
          id: "new-fieldset-id",
          name,
          description,
        },
      },
    },
  },
});

export const buildUpdateFieldsetMock = (
  id: string,
  name: string,
  description = ""
): MockedResponse => ({
  request: {
    query: REQUEST_UPDATE_FIELDSET,
    variables: { id, name, description },
  },
  result: {
    data: {
      updateFieldset: {
        __typename: "UpdateFieldsetOutputType",
        ok: true,
        msg: "ok",
        obj: {
          __typename: "FieldsetType",
          id,
          name,
          description,
        },
      },
    },
  },
});

export const buildCreateColumnMock = (
  fieldsetId: string,
  columnName: string,
  query: string,
  outputType = "str"
): MockedResponse => ({
  request: {
    query: REQUEST_CREATE_COLUMN,
    variables: {
      fieldsetId,
      name: columnName,
      query,
      matchText: "",
      outputType,
      limitToLabel: "",
      instructions: "",
      taskName:
        "opencontractserver.tasks.data_extract_tasks.doc_extract_query_task",
    },
  },
  result: {
    data: {
      createColumn: {
        __typename: "CreateColumnOutputType",
        ok: true,
        message: "ok",
        obj: {
          __typename: "ColumnType",
          id: `new-column-${columnName}`,
          name: columnName,
          query,
          matchText: "",
          outputType,
          limitToLabel: "",
          instructions: "",
          taskName:
            "opencontractserver.tasks.data_extract_tasks.doc_extract_query_task",
        },
      },
    },
  },
});

export const buildDeleteColumnMock = (id: string): MockedResponse => ({
  request: { query: REQUEST_DELETE_COLUMN, variables: { id } },
  result: {
    data: {
      deleteColumn: {
        __typename: "DeleteColumnOutputType",
        ok: true,
        message: "ok",
        deletedId: id,
      },
    },
  },
});

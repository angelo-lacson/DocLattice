/**
 * Form field definitions for CRUDModal forms.
 *
 * These use a lightweight JSON-Schema-like format consumed by DynamicSchemaForm.
 * Only schemas that are actively imported elsewhere are kept here.
 */

// ── Document Edit / View ────────────────────────────────────────────────────

export const editDocForm_Schema = {
  title: "Document Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    slug: {
      type: "string",
      title: "Slug:",
      description:
        "Case-sensitive; allowed characters: A-Z, a-z, 0-9, and hyphen (-). Leave blank to auto-generate.",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const editDocForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};

// ── Label Set Create ────────────────────────────────────────────────────────

export const newLabelSetForm_Schema = {
  title: "Label Set Details",
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "Title:",
    },
    description: {
      type: "string",
      title: "Description:",
    },
  },
  required: ["title", "description"],
};

export const newLabelSetForm_Ui_Schema = {
  description: {
    "ui:widget": "textarea",
    "ui:placeholder": "Add a description...",
  },
};

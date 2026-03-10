import React, { useCallback } from "react";
import { Input, Textarea } from "@os-legal/ui";
import styled from "styled-components";

/**
 * Minimal JSON Schema property definition.
 * Covers the subset of JSON Schema used by backend inputSchemas
 * and the static CRUD schemas in this project.
 */
interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * UI hints that mirror the subset of RJSF uiSchema previously used.
 * Keys are property names; values control widget choice and read-only state.
 */
interface UiHints {
  [propertyName: string]:
    | {
        "ui:widget"?: string;
        "ui:placeholder"?: string;
        "ui:readonly"?: boolean;
      }
    | boolean
    | Record<string, unknown>;
}

export interface DynamicSchemaFormProps {
  /** JSON Schema describing the form fields. */
  schema: JsonSchema;
  /** Optional UI hints (widget type, placeholder, readonly). */
  uiSchema?: UiHints;
  /** Current form values keyed by property name. */
  formData: Record<string, unknown>;
  /** Called with the full updated formData on every field change. */
  onChange: (formData: Record<string, unknown>) => void;
  /** When true all fields are rendered as disabled/readonly. */
  disabled?: boolean;
}

const FormField = styled.div`
  margin-bottom: var(--oc-spacing-md, 1rem);

  &:last-child {
    margin-bottom: 0;
  }
`;

/**
 * Renders a JSON Schema as OS-Legal/ui form fields.
 *
 * Supports string (Input / Textarea), number, integer, and boolean property
 * types.  For backend-provided dynamic schemas (analyzer & post-processor
 * inputSchemas) this covers all current use-cases without pulling in RJSF.
 */
export const DynamicSchemaForm: React.FC<DynamicSchemaFormProps> = ({
  schema,
  uiSchema = {},
  formData,
  onChange,
  disabled = false,
}) => {
  const properties = schema.properties ?? {};
  const requiredFields = schema.required ?? [];

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      onChange({ ...formData, [field]: value });
    },
    [formData, onChange]
  );

  const propertyEntries = Object.entries(properties);

  if (propertyEntries.length === 0) {
    return null;
  }

  return (
    <div>
      {propertyEntries.map(([fieldName, prop]) => {
        const hints =
          typeof uiSchema[fieldName] === "object" ? uiSchema[fieldName] : {};
        const uiHints = hints as Record<string, unknown>;
        const isRequired = requiredFields.includes(fieldName);
        const isReadonly =
          disabled ||
          uiHints["ui:readonly"] === true ||
          (typeof uiSchema["ui:readonly"] === "boolean" &&
            uiSchema["ui:readonly"]);
        const placeholder = (uiHints["ui:placeholder"] as string) ?? undefined;
        const useTextarea = uiHints["ui:widget"] === "textarea";

        const label = `${prop.title ?? fieldName}${isRequired ? " *" : ""}`;
        const currentValue = formData[fieldName];
        const fieldType = prop.type ?? "string";

        if (fieldType === "boolean") {
          return (
            <FormField key={fieldName}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: isReadonly ? "default" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(currentValue)}
                  disabled={isReadonly}
                  onChange={(e) => handleChange(fieldName, e.target.checked)}
                />
                <span>{label}</span>
              </label>
              {prop.description && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--oc-fg-secondary)",
                    marginTop: "0.25rem",
                  }}
                >
                  {prop.description}
                </div>
              )}
            </FormField>
          );
        }

        if (fieldType === "number" || fieldType === "integer") {
          return (
            <FormField key={fieldName}>
              <Input
                id={`schema-field-${fieldName}`}
                label={label}
                type="number"
                placeholder={placeholder}
                value={currentValue != null ? String(currentValue) : ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    handleChange(fieldName, undefined);
                  } else {
                    handleChange(
                      fieldName,
                      fieldType === "integer"
                        ? parseInt(raw, 10)
                        : parseFloat(raw)
                    );
                  }
                }}
                disabled={isReadonly}
                helperText={prop.description}
                fullWidth
              />
            </FormField>
          );
        }

        // Default: string
        if (useTextarea) {
          return (
            <FormField key={fieldName}>
              <Textarea
                id={`schema-field-${fieldName}`}
                label={label}
                placeholder={placeholder}
                value={typeof currentValue === "string" ? currentValue : ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleChange(fieldName, e.target.value)
                }
                disabled={isReadonly}
                fullWidth
                autoResize
                maxRows={6}
              />
              {prop.description && (
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--oc-fg-secondary)",
                    marginTop: "0.25rem",
                  }}
                >
                  {prop.description}
                </div>
              )}
            </FormField>
          );
        }

        return (
          <FormField key={fieldName}>
            <Input
              id={`schema-field-${fieldName}`}
              label={label}
              placeholder={placeholder}
              value={typeof currentValue === "string" ? currentValue : ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleChange(fieldName, e.target.value)
              }
              disabled={isReadonly}
              helperText={prop.description}
              fullWidth
            />
          </FormField>
        );
      })}
    </div>
  );
};

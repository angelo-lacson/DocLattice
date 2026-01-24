/**
 * CategoriesSection - Category selector for corpus organization
 */
import React from "react";
import { Button, Icon } from "semantic-ui-react";
import { AlertTriangle } from "lucide-react";
import { CategorySelector } from "../CategorySelector";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardTitle,
  SettingsCardContent,
  FormField,
  PermissionBanner,
  HelperText,
} from "../styles/corpusSettingsStyles";

interface CategoriesSectionProps {
  categoriesDraft: string[];
  setCategoriesDraft: (value: string[]) => void;
  originalCategories: string[];
  canUpdate: boolean;
  onSave: () => void;
  loading: boolean;
}

export const CategoriesSection: React.FC<CategoriesSectionProps> = ({
  categoriesDraft,
  setCategoriesDraft,
  originalCategories,
  canUpdate,
  onSave,
  loading,
}) => {
  const hasChanges =
    JSON.stringify([...categoriesDraft].sort()) !==
    JSON.stringify([...originalCategories].sort());

  return (
    <SettingsCard>
      <SettingsCardHeader>
        <SettingsCardTitle>Categories</SettingsCardTitle>
      </SettingsCardHeader>
      <SettingsCardContent>
        {!canUpdate && (
          <PermissionBanner>
            <AlertTriangle size={20} />
            <span>
              You don't have permission to update categories. Contact the corpus
              owner for access.
            </span>
          </PermissionBanner>
        )}

        <FormField disabled={!canUpdate}>
          <div className="field-label">
            Corpus Categories
            {!canUpdate && <span className="no-permission">No permission</span>}
          </div>
          <CategorySelector
            selectedIds={categoriesDraft}
            onChange={setCategoriesDraft}
            disabled={!canUpdate}
          />
          <HelperText>
            Select one or more categories to organize this corpus.
          </HelperText>
        </FormField>

        <div style={{ marginTop: "1.5rem" }}>
          <Button
            primary
            loading={loading}
            disabled={!canUpdate || !hasChanges}
            onClick={onSave}
            style={{
              background: !canUpdate ? "#e2e8f0" : undefined,
              cursor: !canUpdate ? "not-allowed" : undefined,
            }}
          >
            <Icon name="save" /> Save Categories
          </Button>
        </div>
      </SettingsCardContent>
    </SettingsCard>
  );
};

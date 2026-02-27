import { gql } from "@apollo/client";
import {
  PipelineSettingsType,
  PipelineComponentsType,
} from "../../../types/graphql-api";

// ============================================================================
// GraphQL Query/Mutation Result Types
// ============================================================================

export interface PipelineSettingsQueryResult {
  pipelineSettings: PipelineSettingsType;
}

export interface PipelineComponentsQueryResult {
  pipelineComponents: PipelineComponentsType;
}

// ============================================================================
// GraphQL Operations
// ============================================================================

export const GET_PIPELINE_SETTINGS = gql`
  query GetPipelineSettings {
    pipelineSettings {
      preferredParsers
      preferredEmbedders
      preferredThumbnailers
      parserKwargs
      componentSettings
      defaultEmbedder
      componentsWithSecrets
      modified
      modifiedBy {
        id
        username
      }
    }
  }
`;

export const GET_PIPELINE_COMPONENTS = gql`
  query GetPipelineComponents {
    pipelineComponents {
      parsers {
        name
        title
        description
        className
        supportedFileTypes
        settingsSchema {
          name
          settingType
          pythonType
          required
          description
          default
          envVar
          hasValue
          currentValue
        }
      }
      embedders {
        name
        title
        description
        className
        vectorSize
        supportedFileTypes
        settingsSchema {
          name
          settingType
          pythonType
          required
          description
          default
          envVar
          hasValue
          currentValue
        }
      }
      thumbnailers {
        name
        title
        description
        className
        supportedFileTypes
        settingsSchema {
          name
          settingType
          pythonType
          required
          description
          default
          envVar
          hasValue
          currentValue
        }
      }
    }
  }
`;

export const UPDATE_PIPELINE_SETTINGS = gql`
  mutation UpdatePipelineSettings(
    $preferredParsers: GenericScalar
    $preferredEmbedders: GenericScalar
    $preferredThumbnailers: GenericScalar
    $parserKwargs: GenericScalar
    $componentSettings: GenericScalar
    $defaultEmbedder: String
  ) {
    updatePipelineSettings(
      preferredParsers: $preferredParsers
      preferredEmbedders: $preferredEmbedders
      preferredThumbnailers: $preferredThumbnailers
      parserKwargs: $parserKwargs
      componentSettings: $componentSettings
      defaultEmbedder: $defaultEmbedder
    ) {
      ok
      message
      pipelineSettings {
        preferredParsers
        preferredEmbedders
        preferredThumbnailers
        parserKwargs
        componentSettings
        defaultEmbedder
        componentsWithSecrets
        modified
        modifiedBy {
          id
          username
        }
      }
    }
  }
`;

export const RESET_PIPELINE_SETTINGS = gql`
  mutation ResetPipelineSettings {
    resetPipelineSettings {
      ok
      message
      pipelineSettings {
        preferredParsers
        preferredEmbedders
        preferredThumbnailers
        parserKwargs
        componentSettings
        defaultEmbedder
        componentsWithSecrets
        modified
        modifiedBy {
          id
          username
        }
      }
    }
  }
`;

export const UPDATE_COMPONENT_SECRETS = gql`
  mutation UpdateComponentSecrets(
    $componentPath: String!
    $secrets: GenericScalar!
    $merge: Boolean
  ) {
    updateComponentSecrets(
      componentPath: $componentPath
      secrets: $secrets
      merge: $merge
    ) {
      ok
      message
      componentsWithSecrets
    }
  }
`;

export const DELETE_COMPONENT_SECRETS = gql`
  mutation DeleteComponentSecrets($componentPath: String!) {
    deleteComponentSecrets(componentPath: $componentPath) {
      ok
      message
      componentsWithSecrets
    }
  }
`;

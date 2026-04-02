// Parser (upstream-liftable, zero-dep)
export { extractInlineDirectives } from "./inlineDirectives";
export type {
  CamlInlineDirective,
  DirectiveExtractionResult,
} from "./inlineDirectives";

// Directive registry (generic, agent-agnostic)
export {
  registerDirectiveHandler,
  unregisterDirectiveHandler,
  getDirectiveHandler,
  getRegisteredAgents,
  clearDirectiveHandlers,
} from "./directiveRegistry";
export type {
  DirectiveHandlerHook,
  DirectiveHandlerContext,
  DirectiveHandlerResult,
} from "./directiveRegistry";

// Generic renderer
export { CamlDirectiveRenderer } from "./CamlDirectiveRenderer";
export type { CamlDirectiveRendererProps } from "./CamlDirectiveRenderer";

// Citation UI components (used by useCiteHandler, also available standalone)
export {
  CamlCitationChip,
  CamlCitationError,
  CamlCitationLoading,
} from "./CamlCitationChip";
export type { ResolvedCitation } from "./CamlCitationChip";

// OC-specific handlers
export { useCiteHandler } from "./useCiteHandler";

# Manual Corpus Action Trigger — Design

**Goal**: Allow superusers to manually run a specific corpus action against a chosen document, bypassing the automatic trigger pipeline. This eliminates the upload-process-wait cycle during action development and testing.

**Architecture**: A new `RunCorpusAction` GraphQL mutation dispatches the existing `run_agent_corpus_action` Celery task directly. A small frontend modal on each action card lets the superuser pick a document and fire the mutation.

## Backend

### RunCorpusAction Mutation

- **Inputs**: `corpus_action_id` (required), `document_id` (required)
- **Permission**: `@user_passes_test(lambda user: user.is_superuser)` + `ADMIN_OPERATION` rate limit
- **Validation**:
  1. CorpusAction exists and is an agent action (`is_agent_action` property)
  2. Document exists and belongs to the action's corpus
- **Execution**:
  1. Create `CorpusActionExecution` record (status=QUEUED, trigger=action's trigger, action_type=AGENT)
  2. Call `run_agent_corpus_action.delay(corpus_action_id, document_id, user_id, execution_id)`
- **Returns**: `{ok, message, obj: CorpusActionExecutionType}`
- **Location**: `config/graphql/mutations.py`, wired into root Mutation in `config/graphql/schema.py`

### Scope Limitation

Agent-based actions only. Fieldset and analyzer actions require different dispatch paths (Extract/Analysis creation) and are out of scope for this feature.

## Frontend

### Action Card Run Button

- Add a "play" icon button to each action card in `CorpusActionsSection`
- Placement: alongside existing Edit and Delete buttons
- Visibility: superuser only (check user object)
- Disabled with tooltip for non-agent actions

### RunCorpusActionModal

- Triggered by the play button
- Header: action name
- Body: searchable dropdown of documents in the corpus
- Footer: Run + Cancel buttons
- On success: toast message ("Action queued"), close modal
- Location: `frontend/src/components/corpuses/RunCorpusActionModal.tsx`

### GraphQL Operation

- New `RUN_CORPUS_ACTION` mutation in `frontend/src/graphql/mutations.ts`
- Refetches `GET_CORPUS_ACTION_EXECUTIONS` on success so the execution trail updates

## What This Does NOT Change

- Existing automatic trigger pipeline (`process_corpus_action`, signals, `set_doc_lock_state`)
- `run_agent_corpus_action` task signature or behavior
- CorpusAction model
- Non-superuser UI

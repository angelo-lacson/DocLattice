# Design: Agent Config Flow Screenshots

## Purpose

Add auto-generated documentation screenshots for the corpus action configuration flow, replacing manual screenshots with CI-maintained ones.

## Screenshots to Capture

| Screenshot name | State | Source |
|---|---|---|
| `corpus-actions--create-modal--initial` | Modal open, default fieldset + add_document | Existing test |
| `corpus-actions--create-modal--fieldset-config` | Fieldset action type selected | Existing test |
| `corpus-actions--create-modal--analyzer-config` | Analyzer action type selected | Existing test |
| `corpus-actions--create-modal--agent-document` | Agent type with document trigger | Existing test |
| `corpus-actions--create-modal--agent-thread-quick` | Thread trigger, quick-create moderator mode | Existing test |
| `corpus-actions--create-modal--agent-thread-existing` | Thread trigger, use existing agent mode | New/extended test |
| `corpus-actions--list-view--with-actions` | CorpusActionsSection with action cards | New test |

## Changes

### Test file: `frontend/tests/create-corpus-action-modal.ct.tsx`
- Import `docScreenshot` from `./utils/docScreenshot`
- Add screenshot calls after assertions in existing tests
- Add test for "Use Existing Agent" mode if not covered

### New test: `frontend/tests/corpus-actions-list.ct.tsx`
- Mount `CorpusActionsSection` with mocked action data
- Capture `corpus-actions--list-view--with-actions` screenshot

### Documentation: `docs/corpus_actions/intro_to_corpus_actions.md`
- Replace 4 manual screenshot references with auto-generated ones
- Map screenshots to relevant sections of the GUI walkthrough

## Naming Convention

Follows `{area}--{component}--{state}` convention per `docScreenshot.ts`.

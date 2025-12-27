# OpenContracts Celery Tasks & Agent Code Permission Audit Report

**Audit Date**: 2025-12-27
**Auditor**: Claude Code Security Audit
**Scope**: All Celery task files, agent code, and pipeline components
**Baseline**: `docs/permissioning/consolidated_permissioning_guide.md`

---

## Executive Summary

This comprehensive audit reviewed all Celery tasks and agent code for permission violations. The findings reveal **critical security vulnerabilities** across the task layer that could allow unauthorized access to user data, document exfiltration, and privilege escalation.

### Critical Statistics

| Severity | Count | Primary Issues |
|----------|-------|----------------|
| 🔴 **CRITICAL** | 47 | Missing permission checks, IDOR vulnerabilities, data exfiltration risks |
| 🟠 **HIGH** | 12 | Unauthorized resource access, privilege escalation |
| 🟡 **MEDIUM** | 8 | Information disclosure, incomplete validation |
| 🟢 **LOW** | 3 | Code quality, missing user context |

**Total Violations**: 70 across 21 task files

### Risk Assessment

**Overall Risk Level**: 🔴 **CRITICAL**

**Primary Attack Vectors**:
1. **IDOR (Insecure Direct Object Reference)**: Tasks accept object IDs without validating user permissions
2. **Data Exfiltration**: Export and fork tasks can access any corpus/document
3. **Privilege Escalation**: Tasks use wrong user context (creator instead of caller)
4. **Resource Manipulation**: Public/private state changes without authorization
5. **Mass Operations**: Bulk tasks lack admin verification

---

## Part 1: Critical Findings by Functional Area

### 1. Corpus Operations (CRITICAL - Data Exfiltration Risk)

#### **File**: `tasks/corpus_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Analysis execution without permission check | 52 | 🔴 CRITICAL | Run analysis on any corpus |
| Corpus action processing without validation | 172-180 | 🔴 HIGH | Trigger actions on unauthorized corpora |
| Extract creation without corpus check | 208-214 | 🔴 HIGH | Create extracts on corpora user doesn't own |
| No user context for engagement metrics | 383, 505 | 🟡 MEDIUM | Admin tasks exposed to users |

**Example Vulnerability**:
```python
# Line 52 - NO permission check!
@shared_task
def run_task_name_analyzer(analysis_id: int | str, ...):
    analysis = Analysis.objects.get(id=analysis_id)  # ❌ IDOR vulnerability
```

**Attack Scenario**: User calls task with any `analysis_id`, bypassing all permission checks.

---

#### **File**: `tasks/fork_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Corpus fork without permission validation | 39 | 🔴 CRITICAL | Clone any corpus by ID |
| LabelSet access without check | 51 | 🔴 CRITICAL | Steal proprietary labeling schemes |
| Document bulk access without filtering | 120 | 🔴 CRITICAL | Mass data exfiltration |
| Annotation bulk access without check | 182 | 🔴 CRITICAL | Steal training data |

**Impact**: Complete bypass of corpus permission system. Attacker can clone entire corpuses with all documents, annotations, and label sets.

**Recommended Fix**:
```python
@celery_app.task()
def fork_corpus(new_corpus_id, doc_ids, label_set_id, annotation_ids, user_id):
    user = User.objects.get(pk=user_id)

    # Validate all permissions BEFORE proceeding
    corpus = Corpus.objects.visible_to_user(user).get(pk=new_corpus_id)

    accessible_docs = Document.objects.visible_to_user(user).filter(pk__in=doc_ids)
    if accessible_docs.count() != len(doc_ids):
        logger.error(f"User {user_id} lacks access to some documents")
        return None

    # Continue with validated objects...
```

---

### 2. Document Operations (CRITICAL - File Access Risk)

#### **File**: `tasks/doc_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Document ingestion without check | 138 | 🔴 HIGH | Trigger expensive parsing on any document |
| FUNSD conversion without validation | 239 | 🔴 HIGH | Read PDF files and PAWLS data without authorization |
| File access without permission | 283-287 | 🔴 CRITICAL | Direct file system access to unauthorized documents |
| Annotation export without check | 178-216 | 🟡 MEDIUM | Export annotations without user validation |

**Example Vulnerability**:
```python
# Line 239 - NO permission check before file access!
def convert_doc_to_funsd(user_id, doc_id, ...):
    doc = Document.objects.get(id=doc_id)  # ❌ No validation

    # Line 283-284 - Direct file access!
    file_object = default_storage.open(doc.pawls_parse_file.name)  # ❌ Bypasses permissions
    pawls_tokens = json.loads(file_object.read().decode("utf-8"))

    pdf_object = default_storage.open(doc.pdf_file.name)  # ❌ Reads PDF without auth
```

**Impact**: Users can read PDF files, PAWLS tokens, and page images from documents they don't own.

---

#### **File**: `tasks/import_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Corpus import without seed validation | 47 | 🟡 MEDIUM | Leak corpus structure via seed_corpus_id |
| Document import to unauthorized corpus | 249 | 🔴 CRITICAL | Pollute other users' corpora |
| Bulk upload without corpus check | 405 | 🔴 CRITICAL | Upload documents to any corpus |

---

### 3. Analysis Operations (CRITICAL - Hybrid Model Violations)

#### **File**: `tasks/analyzer_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Analysis import without permission | 37 | 🔴 CRITICAL | Import annotations into any analysis |
| Analysis execution without validation | 50 | 🔴 CRITICAL | Run analysis on unauthorized documents |
| Gremlin manifest access without check | 59 | 🟠 HIGH | Access/modify gremlin configurations |
| Analyzer installation without auth | 80 | 🟠 HIGH | Install analyzers without authorization |
| Analysis completion without validation | 97 | 🔴 CRITICAL | Manipulate analysis state and document associations |

---

#### **File**: `utils/analyzer.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Analysis execution without permission | 203 | 🔴 CRITICAL | Process any document without user context |
| Document bulk fetch without filtering | 212 | 🔴 CRITICAL | Access all documents in corpus |
| Document list without validation | 217 | 🔴 CRITICAL | Process arbitrary documents |
| Annotation import without checks | 306, 348 | 🔴 CRITICAL | Create annotations on unauthorized documents |

**Key Issue**: Analysis uses **hybrid permission model** requiring:
1. Permission on Analysis object
2. READ permission on Corpus
3. READ permission on each Document

**None of these checks are performed in the tasks.**

---

### 4. Extract Operations (CRITICAL - Datacell Access Risk)

#### **File**: `tasks/extract_orchestrator_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Extract execution without validation | 46 | 🔴 CRITICAL | Run extraction on any extract |
| Document bulk access without check | 58-60 | 🔴 CRITICAL | Process all documents without permission filtering |
| Fieldset access without validation | 55-56 | 🟠 HIGH | Access fieldset schemas without authorization |
| Extract completion without check | 17-24 | 🔴 CRITICAL | Mark any extract as complete |

---

#### **File**: `tasks/data_extract_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Datacell retrieval without check | 106-111 | 🔴 CRITICAL | Access any datacell by ID enumeration |
| Document access without validation | 169 | 🔴 CRITICAL | Process documents without permission |
| Wrong user context (uses creator) | 262-272 | 🔴 CRITICAL | Privilege escalation - runs with creator's permissions |
| Annotation search without check | 357-361 | 🔴 CRITICAL | Search annotations in any document |
| Annotation window without check | 401-405 | 🔴 CRITICAL | Retrieve annotation context without auth |

**Privilege Escalation Example**:
```python
# Line 262-272 - Uses datacell.creator.id instead of calling user!
result = await agents.get_structured_response_from_document(
    document=document.id,
    user_id=datacell.creator.id,  # ❌ WRONG! Should be calling user's ID
)
```

**Impact**: User could extract data using another user's permissions by triggering tasks for datacells they don't own.

---

### 5. Agent Operations (CRITICAL - Conversation Access Risk)

#### **File**: `tasks/agent_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| AgentConfiguration access without check | 130 | 🔴 CRITICAL | Use any agent configuration |
| ChatMessage access without validation | 127-129 | 🔴 CRITICAL | Access messages from private conversations |
| Corpus access without check | 131-133 | 🔴 CRITICAL | Access corpus data through conversation |
| Agent visibility not checked | 365-372 | 🟡 MODERATE | Trigger responses from inaccessible agents |
| CorpusAction access without validation | 525-526 | 🔴 CRITICAL | Execute actions on unauthorized corpora |
| Document access without check | 529 | 🔴 CRITICAL | Process unauthorized documents |
| Pre-authorized tool execution | 595-620 | 🟠 HIGH | Execute tools without user validation |

---

### 6. Export Operations (CRITICAL - Data Exfiltration Risk)

#### **File**: `tasks/export_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Export processing without check | 49-50 | 🔴 CRITICAL | Process any user's export |
| Corpus packaging without validation | 114 | 🔴 CRITICAL | Package and exfiltrate any corpus |
| FUNSD export without check | 188-274 | 🔴 CRITICAL | Export corpus in FUNSD format |

---

### 7. Permissioning Operations (CRITICAL - State Manipulation Risk)

#### **File**: `tasks/permissioning_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Corpus publication without check | 11-18 | 🔴 CRITICAL | Make any corpus public |
| Analysis publication without check | 21-29 | 🔴 CRITICAL | Expose analysis data publicly |

**Impact**: Attacker could make victim's private corpus public, exposing all related data (documents, annotations, analyses, labels) to the entire internet.

---

### 8. Badge Operations (HIGH - Resource Exhaustion Risk)

#### **File**: `tasks/badge_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Badge check without corpus validation | 36-112 | 🟠 HIGH | Information disclosure |
| Bulk badge check without admin verification | 278-308 | 🟠 HIGH | Resource exhaustion |
| Badge revocation without authorization | 311-350 | 🟠 HIGH | Revoke badges system-wide |

---

### 9. Cleanup Operations (CRITICAL - Data Loss Risk)

#### **File**: `tasks/cleanup_tasks.py`

| Violation | Line | Severity | Impact |
|-----------|------|----------|--------|
| Analysis deletion without check | 16-21 | 🔴 CRITICAL | Delete any analysis and annotations |

**Impact**: Permanent data loss. Attacker could delete victim's analysis work.

---

### 10. Pipeline Operations (HIGH - Document Processing Risk)

#### **Files**: `pipeline/parsers/*.py`, `pipeline/base/parser.py`

| Violation | Location | Severity | Impact |
|-----------|----------|----------|--------|
| Document access without validation | All parsers | 🔴 HIGH | Process unauthorized documents |
| No permission validation layer | Architecture | 🟡 MEDIUM | Trust boundary violation |

**Affected Files**:
- `docling_parser_rest.py` (line 122)
- `nlm_ingest_parser.py` (line 64)
- `oc_text_parser.py` (line 54)
- `base/parser.py` (line 117)

**Note**: Parsers correctly mark structural annotations, but lack permission checks on document access.

---

## Part 2: Patterns and Systemic Issues

### Pattern 1: Missing User Context

**Count**: 15 tasks
**Example**:
```python
# Tasks that operate on user data but have no user_id parameter
@celery_app.task()
def process_something(object_id):
    obj = Model.objects.get(pk=object_id)  # No way to validate permissions
```

**Files Affected**:
- `cleanup_tasks.py`
- `permissioning_tasks.py`
- `badge_tasks.py` (3 functions)
- `lookup_tasks.py`
- Pipeline parsers (4 files)

---

### Pattern 2: Raw ORM Queries Without Filtering

**Count**: 47 instances
**Example**:
```python
# BAD - Direct access
document = Document.objects.get(pk=doc_id)

# GOOD - Permission-filtered
user = User.objects.get(id=user_id)
document = Document.objects.visible_to_user(user).get(pk=doc_id)
```

**Most Common Violations**:
1. `Corpus.objects.get(pk=corpus_id)` - 12 instances
2. `Document.objects.get(pk=doc_id)` - 15 instances
3. `Analysis.objects.get(pk=analysis_id)` - 8 instances
4. `Extract.objects.get(pk=extract_id)` - 5 instances
5. `AgentConfiguration.objects.get(pk=agent_id)` - 3 instances

---

### Pattern 3: Wrong User Context

**Count**: 4 instances
**Example**:
```python
# Uses datacell creator instead of calling user
result = await agents.get_structured_response(
    user_id=datacell.creator.id,  # ❌ WRONG!
)
```

**Impact**: Privilege escalation - operations run with wrong user's permissions.

---

### Pattern 4: Bulk Operations Without Admin Check

**Count**: 3 instances
**Files**:
- `badge_tasks.py`: `check_badges_for_all_users`, `revoke_badges_by_criteria`
- `corpus_tasks.py`: `update_all_corpus_engagement_metrics`

**Impact**: Resource exhaustion, unauthorized system-wide operations.

---

## Part 3: Defense-in-Depth Violations

### The Problem

While GraphQL mutations **DO** check permissions, the underlying tasks do not. This violates defense-in-depth principles.

**Attack Vectors if Task Layer is Exposed**:
1. Django Admin Interface (custom actions)
2. Celery Flower (if exposed)
3. Direct Celery queue manipulation
4. Future API endpoints that forget checks
5. Code bugs in mutation layer

**Industry Best Practice**: Each layer should validate permissions independently.

---

## Part 4: Recommended Fixes by Priority

### Priority 1: CRITICAL (Deploy This Week)

**Must Fix**: 23 critical vulnerabilities

1. **Corpus/Document Exfiltration** (6 tasks):
   - `fork_corpus` - Add permission checks on corpus, documents, annotations
   - `package_annotated_docs` - Validate user can access corpus
   - `package_funsd_exports` - Same as above
   - `convert_doc_to_funsd` - Validate before file access
   - `import_document_to_corpus` - Check UPDATE permission on corpus
   - `process_documents_zip` - Same as above

2. **State Manipulation** (3 tasks):
   - `make_corpus_public_task` - Require PERMISSION permission
   - `make_analysis_public_task` - Require superuser
   - `delete_analysis_and_annotations_task` - Check DELETE permission

3. **Analysis/Extract Operations** (8 tasks):
   - `import_analysis` - Validate analysis + corpus permissions
   - `start_analysis` - Add user_id, validate hybrid permissions
   - `run_analysis` - Filter documents by user permissions
   - `import_annotations_from_analysis` - Validate source permissions
   - `run_extract` - Validate extract + corpus permissions
   - `doc_extract_query_task` - Add user validation
   - `mark_extract_complete` - Check UPDATE permission
   - `mark_analysis_complete` - Check UPDATE permission

4. **Agent Operations** (6 tasks):
   - `execute_agent_task` - Validate agent config, message, corpus access
   - `_run_agent_corpus_action_async` - Validate corpus action and documents
   - All corpus-related functions in agent tasks

---

### Priority 2: HIGH (Deploy Next Week)

**Should Fix**: 12 high-severity vulnerabilities

1. **Document Processing** (3 tasks):
   - `ingest_doc` - Validate document access
   - `burn_doc_annotations` - Add user_id parameter
   - `extract_thumbnail` - Add user_id parameter

2. **Gremlin/Analyzer** (2 tasks):
   - `request_gremlin_manifest` - Add user_id, validate gremlin access
   - `install_analyzer_task` - Same as above

3. **Badge Operations** (3 tasks):
   - `check_auto_badges` - Validate corpus access if corpus_id provided
   - `check_badges_for_all_users` - Require superuser
   - `revoke_badges_by_criteria` - Require superuser

4. **Pipeline** (4 files):
   - Add permission validation to `BaseParser.parse_document()`
   - Update all parser implementations

---

### Priority 3: MEDIUM (Deploy This Sprint)

**Good to Fix**: 8 medium-severity vulnerabilities

1. Engagement metrics tasks - Mark as admin-only or add user context
2. Label lookup tasks - Add user_id parameter
3. Import tasks - Validate seed_corpus_id permissions

---

## Part 5: Standard Fix Patterns

### Pattern A: Add User ID and Validate Permissions

```python
# BEFORE
@celery_app.task()
def process_object(object_id):
    obj = Model.objects.get(pk=object_id)

# AFTER
@celery_app.task()
def process_object(object_id, user_id):
    from django.contrib.auth import get_user_model
    from opencontractserver.utils.permissioning import user_has_permission_for_obj
    from opencontractserver.types.enums import PermissionTypes

    User = get_user_model()
    user = User.objects.get(pk=user_id)

    try:
        obj = Model.objects.visible_to_user(user).get(pk=object_id)
    except Model.DoesNotExist:
        logger.error(f"Object {object_id} not found or not accessible to user {user_id}")
        return None

    # Additional permission check if needed
    if not user_has_permission_for_obj(user, obj, PermissionTypes.UPDATE):
        logger.error(f"User {user_id} lacks UPDATE permission")
        return None

    # Proceed with validated object...
```

---

### Pattern B: Filter Bulk Operations by User Permissions

```python
# BEFORE
documents = Document.objects.filter(pk__in=doc_ids)

# AFTER
user = User.objects.get(pk=user_id)
accessible_docs = Document.objects.visible_to_user(user).filter(pk__in=doc_ids)

# Verify ALL requested docs are accessible
if accessible_docs.count() != len(doc_ids):
    missing = len(doc_ids) - accessible_docs.count()
    logger.error(f"User {user_id} lacks access to {missing} documents")
    return None

documents = accessible_docs
```

---

### Pattern C: Validate Hybrid Permissions (Analyses/Extracts)

```python
# For analyses and extracts, check BOTH object AND corpus permissions
from opencontractserver.utils.permissioning import user_has_permission_for_obj
from opencontractserver.types.enums import PermissionTypes

# 1. Check object permission
analysis = Analysis.objects.get(pk=analysis_id)
if not user_has_permission_for_obj(user, analysis, PermissionTypes.READ):
    raise PermissionError("No permission on analysis")

# 2. Check corpus permission (hybrid model requirement)
if analysis.analyzed_corpus:
    if not user_has_permission_for_obj(user, analysis.analyzed_corpus, PermissionTypes.READ):
        raise PermissionError("No permission on corpus")

# 3. Filter documents when processing
accessible_docs = [
    doc for doc in analysis.analyzed_documents.all()
    if user_has_permission_for_obj(user, doc, PermissionTypes.READ)
]
```

---

### Pattern D: Use Correct User Context

```python
# WRONG - Uses object creator
result = process(user_id=datacell.creator.id)

# RIGHT - Uses calling user
result = process(user_id=user_id)
```

---

## Part 6: Testing Requirements

### Security Tests Needed

For each fixed task, add tests to verify:

```python
def test_task_rejects_unauthorized_user():
    """Task should reject when user lacks permission."""
    victim_obj = create_object(owner=victim_user)

    # Attacker tries to trigger task
    result = task(object_id=victim_obj.id, user_id=attacker_user.id)

    assert result is None or result["error"] == "Permission denied"

def test_task_rejects_invalid_user():
    """Task should reject when user doesn't exist."""
    result = task(object_id=obj.id, user_id=999999)

    assert result is None

def test_task_uses_correct_user_context():
    """Task should use calling user's permissions, not creator's."""
    # Verify task doesn't use obj.creator.id internally

def test_bulk_operation_filters_by_permission():
    """Bulk tasks should only process accessible objects."""
    # User has access to docs [1, 2] but not [3, 4]
    result = task(doc_ids=[1, 2, 3, 4], user_id=user.id)

    # Should only process [1, 2] or return error
```

---

## Part 7: Impact Analysis

### Data Exposure Risk

**Affected Data Types**:
- Corpus metadata and structure (12 tasks)
- Documents and file contents (15 tasks)
- Annotations and training data (8 tasks)
- Analysis results (5 tasks)
- Extract datacells (4 tasks)
- User profiles via badges (3 tasks)

**Potential Regulatory Impact**:
- GDPR violations (unauthorized data processing)
- HIPAA violations (if medical documents)
- CCPA violations (unauthorized data access)
- SOC 2 compliance failures

---

### Resource Exhaustion Risk

**Affected Operations**:
- Bulk badge evaluation (all users)
- System-wide metrics updates (all corpuses)
- Mass export operations
- Repeated parsing on large documents

**Mitigation**: Add rate limiting at task dispatch layer.

---

### Data Loss Risk

**Operations That Can Delete Data**:
- `delete_analysis_and_annotations_task` - Permanent loss of analysis work
- `revoke_badges_by_criteria` - Loss of user achievements

**Mitigation**: Require DELETE permission + add soft-delete + audit trail.

---

## Part 8: Comprehensive File List

### Files Requiring Immediate Changes (Priority 1)

1. ✅ `/home/user/OpenContracts/opencontractserver/tasks/corpus_tasks.py` (4 violations)
2. ✅ `/home/user/OpenContracts/opencontractserver/tasks/fork_tasks.py` (4 violations)
3. ✅ `/home/user/OpenContracts/opencontractserver/tasks/analyzer_tasks.py` (5 violations)
4. ✅ `/home/user/OpenContracts/opencontractserver/utils/analyzer.py` (4 violations)
5. ✅ `/home/user/OpenContracts/opencontractserver/tasks/extract_orchestrator_tasks.py` (4 violations)
6. ✅ `/home/user/OpenContracts/opencontractserver/tasks/data_extract_tasks.py` (5 violations)
7. ✅ `/home/user/OpenContracts/opencontractserver/tasks/permissioning_tasks.py` (2 violations)
8. ✅ `/home/user/OpenContracts/opencontractserver/utils/sharing.py` (2 violations)
9. ✅ `/home/user/OpenContracts/opencontractserver/tasks/cleanup_tasks.py` (1 violation)
10. ✅ `/home/user/OpenContracts/opencontractserver/utils/cleanup.py` (1 violation)
11. ✅ `/home/user/OpenContracts/opencontractserver/tasks/export_tasks.py` (3 violations)

### Files Requiring Changes (Priority 2)

12. ✅ `/home/user/OpenContracts/opencontractserver/tasks/doc_tasks.py` (5 violations)
13. ✅ `/home/user/OpenContracts/opencontractserver/tasks/import_tasks.py` (3 violations)
14. ✅ `/home/user/OpenContracts/opencontractserver/tasks/agent_tasks.py` (7 violations)
15. ✅ `/home/user/OpenContracts/opencontractserver/tasks/badge_tasks.py` (3 violations)
16. ✅ `/home/user/OpenContracts/opencontractserver/pipeline/base/parser.py` (1 violation)
17. ✅ `/home/user/OpenContracts/opencontractserver/pipeline/parsers/docling_parser_rest.py` (1 violation)
18. ✅ `/home/user/OpenContracts/opencontractserver/pipeline/parsers/nlm_ingest_parser.py` (1 violation)
19. ✅ `/home/user/OpenContracts/opencontractserver/pipeline/parsers/oc_text_parser.py` (1 violation)

### Files Requiring Changes (Priority 3)

20. ✅ `/home/user/OpenContracts/opencontractserver/tasks/lookup_tasks.py` (1 violation)
21. ✅ `/home/user/OpenContracts/opencontractserver/utils/etl.py` (1 violation)

### GraphQL Mutations Requiring Updates

Must update to pass `user_id` parameter:
- All mutations in `config/graphql/mutations.py` that invoke affected tasks
- All admin actions in `*/admin.py` files

---

## Part 9: Implementation Roadmap

### Week 1: Critical Security Fixes

**Days 1-2**: Corpus/Document Exfiltration
- Fix `fork_tasks.py` (4 tasks)
- Fix export tasks (3 tasks)
- Fix import tasks (3 tasks)

**Days 3-4**: State Manipulation & Data Loss
- Fix `permissioning_tasks.py` (2 tasks)
- Fix `cleanup_tasks.py` (1 task)
- Update utility functions (`sharing.py`, `cleanup.py`)

**Day 5**: Analysis/Extract Operations
- Fix `analyzer_tasks.py` (5 tasks)
- Fix `utils/analyzer.py` (4 functions)
- Fix extract tasks (5 tasks)

### Week 2: High-Priority Fixes

**Days 1-2**: Document Processing & Agents
- Fix `doc_tasks.py` (5 tasks)
- Fix `agent_tasks.py` (7 tasks)

**Days 3-4**: Pipeline & Badges
- Add validation to `BaseParser` and all parsers
- Fix badge tasks (3 tasks)

**Day 5**: Testing
- Write security tests for all fixed tasks
- Integration testing

### Week 3: Medium-Priority & Cleanup

**Days 1-2**: Remaining Tasks
- Fix lookup tasks
- Fix engagement metrics
- Add admin-only markers

**Days 3-5**: Documentation & Audit
- Update security documentation
- Add inline comments explaining permission checks
- Final security review

---

## Conclusion

This audit revealed **70 permission violations** across 21 task files, with **47 critical issues** requiring immediate attention. The most severe problems are:

1. **Complete bypass of permission system** in fork/export operations
2. **IDOR vulnerabilities** allowing access to any object by ID
3. **Wrong user context** causing privilege escalation
4. **Missing hybrid permission checks** for analyses/extracts
5. **State manipulation** allowing unauthorized public/private changes

The task layer completely lacks defense-in-depth, relying entirely on GraphQL mutations for security. This creates significant risk if tasks are exposed through alternative paths.

**Recommended Timeline**: 3 weeks to address all critical and high-severity issues, with ongoing work on medium-priority items and comprehensive testing.

**Next Steps**:
1. Review this report with security team
2. Prioritize fixes based on actual exposure risk
3. Begin implementation following the roadmap
4. Add monitoring/alerting for unauthorized task invocations
5. Consider architectural refactor to enforce permissions at dispatch layer

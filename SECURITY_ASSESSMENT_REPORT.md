# OpenContracts Security Assessment Report

**Assessment Date:** January 11, 2026
**Branch:** main (commit 70b0bd7)
**Methodology:** Manual code review with automated pattern scanning

---

## Executive Summary

This security assessment of the OpenContracts codebase reveals a **generally well-architected security posture** with several areas requiring attention. The application demonstrates strong foundations in permission management and authentication, but has specific vulnerabilities that should be addressed.

### Risk Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 6 | IDOR in mutations, hardcoded secrets, XSS in Django admin |
| **High** | 8 | File upload gaps, SSRF risks, missing validations |
| **Medium** | 10 | Session config, CORS settings, dependency updates |
| **Low** | 7 | Code smells, documentation gaps, minor config issues |

### Key Findings

1. **IDOR Vulnerabilities**: 6 GraphQL mutations allow object ID enumeration
2. **XSS in Django Admin**: `format_html()` used without proper escaping
3. **Hardcoded Secrets**: PostHog API key in source code
4. **File Upload Gaps**: Missing base64 size validation, temp file leaks
5. **SSRF Risks**: GremlinEngine URLs stored in database without validation

### Positive Security Observations

- ✅ Comprehensive permission system with django-guardian
- ✅ JWT authentication properly implemented
- ✅ No SQL injection vulnerabilities (proper ORM usage)
- ✅ No command injection vulnerabilities
- ✅ ZIP file security with path traversal prevention
- ✅ Active Snyk integration for dependency scanning
- ✅ Rate limiting on sensitive operations

---

## Detailed Findings

### 1. IDOR (Insecure Direct Object Reference) Vulnerabilities

**Severity: CRITICAL**

Six GraphQL mutations allow attackers to enumerate valid object IDs by distinguishing between "not found" and "permission denied" responses.

#### Affected Mutations

| Mutation | File | Line | Issue |
|----------|------|------|-------|
| `VoteMessageMutation` | `config/graphql/voting_mutations.py` | 77 | `ChatMessage.objects.get()` before permission check |
| `RemoveVoteMutation` | `config/graphql/voting_mutations.py` | 161 | Same pattern |
| `RemoveAnnotation` | `config/graphql/mutations.py` | 2177 | `Annotation.objects.get()` before permission check |
| `RejectAnnotation` | `config/graphql/mutations.py` | 2222 | Same pattern |
| `ApproveAnnotation` | `config/graphql/mutations.py` | 2282 | Same pattern |
| `RemoveRelationship` | `config/graphql/mutations.py` | 2440 | `Relationship.objects.get()` before permission check |

**Attack Vector:**
```python
# Attacker can enumerate valid IDs:
# ID 1234 → "Not found" (invalid ID)
# ID 1235 → "Permission denied" (valid ID, owned by another user)
```

**Recommendation:** Replace direct `Model.objects.get(pk=pk)` with `Model.objects.visible_to_user(user).get(pk=pk)` and return unified error messages.

**Properly Secured Examples (for reference):**
- `NotificationMutations`: Uses `Notification.objects.get(pk=pk, recipient=user)`
- `BadgeMutations`: Uses `Badge.objects.visible_to_user(user).get(pk=pk)`
- `AgentMutations`: Uses `AgentConfiguration.objects.visible_to_user(user).get(pk=pk)`

---

### 2. XSS (Cross-Site Scripting) Vulnerabilities

**Severity: CRITICAL (Django Admin), MEDIUM (Frontend)**

#### 2.1 Django Admin XSS - format_html() Misuse

Multiple Django admin methods use `format_html()` without proper escaping of user-controlled content.

| File | Line | Method | User Input |
|------|------|--------|------------|
| `opencontractserver/corpuses/admin.py` | 37 | `display_icon()` | `obj.icon.url` |
| `opencontractserver/corpuses/admin.py` | 210-214 | `document_link()` | `document.title` |
| `opencontractserver/corpuses/admin.py` | 227-231 | `corpus_link()` | `corpus.title` |
| `opencontractserver/corpuses/admin.py` | 274 | `affected_objects_display()` | JSON content |
| `opencontractserver/corpuses/admin.py` | 285 | `execution_metadata_display()` | JSON content |
| `opencontractserver/agents/admin.py` | 176-180 | `corpus_action_link()` | `name` field |
| `opencontractserver/agents/admin.py` | 193-197 | `document_link()` | `title` field |
| `opencontractserver/agents/admin.py` | 238 | `agent_response_display()` | Agent response |
| `opencontractserver/agents/admin.py` | 252 | `tools_executed_display()` | JSON content |
| `opencontractserver/agents/admin.py` | 263 | `execution_metadata_display()` | JSON content |

**Attack Vector:**
```python
# If document.title = '<script>alert("XSS")</script>'
# Result: Stored XSS in Django admin panel
```

**Recommendation:** Use `escape()` before passing user content to `format_html()`:
```python
from django.utils.html import escape, format_html

def document_link(self, obj):
    safe_title = escape(obj.document.title or "")
    return format_html('<a href="...">{}</a>', safe_title)
```

#### 2.2 Frontend innerHTML Usage

**File:** `frontend/src/components/threads/ReplyForm.tsx` (Line 274)

```typescript
const getPlainTextFromHTML = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;  // User-generated HTML from GraphQL
  return div.textContent || "";
};
```

**Assessment:** Lower risk because only `.textContent` is extracted, but still a code smell.

**Recommendation:** Replace with safe text extraction without DOM parsing.

---

### 3. Hardcoded Secrets and Credentials

**Severity: CRITICAL**

#### 3.1 PostHog API Key Exposed

**Files:**
- `config/settings/base.py` (lines 1017-1019)
- `frontend/public/env-config.js` (line 9)

```python
POSTHOG_API_KEY = env.str(
    "POSTHOG_API_KEY", default="phc_wsTXvOFv6QLDMOA3yLl16awF4DTgILi4MSVLwhwyDeJ"
)
```

**Impact:** This API key is publicly visible in the frontend and has a default value in backend settings.

**Recommendation:** Immediately rotate this key and remove the default value.

#### 3.2 Other Hardcoded Defaults

| Setting | File | Line | Issue |
|---------|------|------|-------|
| `AWS_ACCESS_KEY_ID` | `base.py` | 310 | Default: "dummy-key" |
| `AWS_SECRET_ACCESS_KEY` | `base.py` | 312 | Default: "dummy-secret" |
| `VECTOR_EMBEDDER_API_KEY` | `base.py` | 655 | Default: "abc123" |
| `TELEMETRY_IP_SALT` | `base.py` | 1023-1025 | Default: predictable salt |

**Recommendation:** Remove all default values for secrets; require explicit environment variables.

---

### 4. File Upload Security Issues

**Severity: HIGH**

#### 4.1 Missing Base64 Size Validation

**Files affected:**
- `config/graphql/mutations.py` line 1633 (`UploadDocument`)
- `config/graphql/mutations.py` line 1852 (`UploadDocumentsZip`)
- `config/graphql/mutations.py` line 1518 (`UploadCorpusImportZip`)

**Issue:** No size check before `base64.b64decode()`. Attackers can send extremely large base64 strings causing memory exhaustion (DoS).

**Proper implementation exists at:** Lines 2049-2057 (`ImportZipToCorpus`) - validates before decoding.

#### 4.2 Inconsistent Path Validation

**File:** `opencontractserver/tasks/import_tasks.py` (lines 357-580)

`process_documents_zip` function has basic path checks but lacks comprehensive validation compared to `validate_zip_for_import()` (line 819).

**Missing:**
- Path traversal (`../`) check
- Absolute path detection
- Null byte injection check
- Path length limits

#### 4.3 Temporary File Resource Leak

**File:** `opencontractserver/tasks/import_tasks.py`

Exception handlers in `process_documents_zip` and `import_zip_with_folder_structure` don't clean up temporary files:
- Line 574-578: Exception handler without cleanup
- Lines 1171-1188: Multiple exception handlers without cleanup

**Impact:** Disk exhaustion in Celery workers from orphaned temp files.

---

### 5. SSRF (Server-Side Request Forgery) Vulnerabilities

**Severity: HIGH**

#### 5.1 GremlinEngine URL Without Validation

**Files:**
- `opencontractserver/analyzer/models.py` (lines 38-42) - URL field definition
- `opencontractserver/analyzer/utils.py` (line 32) - Usage in HTTP request
- `opencontractserver/utils/analyzer.py` (line 267-269) - Usage in POST request

**Issue:** GremlinEngine URL is stored in database and used directly in `requests.get()` and `requests.post()` calls without any validation.

**Attack Vector:**
```python
# Admin creates GremlinEngine with:
# url = "http://169.254.169.254/latest/meta-data/"  # AWS metadata endpoint
# url = "http://localhost:8000/admin/"  # Internal endpoint
```

#### 5.2 Pipeline Service URLs

| Component | File | Line | Issue |
|-----------|------|------|-------|
| NLM Ingest Parser | `pipeline/parsers/nlm_ingest_parser.py` | 57, 91-96 | Endpoint from kwargs |
| Microservice Embedder | `pipeline/embedders/sent_transformer_microservice.py` | 69-77, 102-106 | Service URL from config |

**Recommendation:** Implement URL validation utility:
- Enforce HTTPS for production
- Block private IP ranges (127.0.0.1, 169.254.x.x, 10.x.x.x, 192.168.x.x)
- Whitelist allowed domains

---

### 6. SQL Injection Assessment

**Severity: LOW (One potential issue found)**

#### 6.1 Dynamic ORM Filter Keys

**File:** `opencontractserver/llms/vector_stores/core_vector_stores.py` (line 398)

```python
for key, value in filters.items():
    # ...
    else:
        queryset = queryset.filter(**{f"{key}__icontains": value})
```

**Issue:** Filter keys constructed dynamically from user-provided dictionary without whitelist validation.

**Recommendation:** Implement whitelist of allowed filter keys:
```python
ALLOWED_FILTER_KEYS = {"annotation_label", "label", "raw_text", "created_at"}
if key in ALLOWED_FILTER_KEYS:
    queryset = queryset.filter(**{f"{key}__icontains": value})
```

**Positive Finding:** No raw SQL, `.extra()`, or string interpolation in queries found elsewhere.

---

### 7. Command Injection Assessment

**Severity: NONE FOUND**

The codebase demonstrates excellent command injection prevention:

- ✅ No `shell=True` in subprocess calls
- ✅ No `os.system()` usage
- ✅ No `eval()` or `exec()` with user input
- ✅ No unsafe deserialization

The only subprocess usage is in `model_preloaders/download_spacy_models.py` (line 22) with hardcoded model names.

---

### 8. Session and CSRF Security

**Severity: MEDIUM**

#### 8.1 Missing Session Configuration

| Setting | Status | Recommendation |
|---------|--------|----------------|
| `SESSION_COOKIE_AGE` | Not set (defaults to 14 days) | Set to 1-4 hours |
| `SESSION_COOKIE_SAMESITE` | Not set | Set to 'Strict' or 'Lax' |
| `CSRF_COOKIE_SAMESITE` | Not set | Set to 'Strict' |

#### 8.2 GraphQL CSRF Exemption

**File:** `config/urls.py` (line 28)

```python
path("graphql/", csrf_exempt(GraphQLView.as_view(graphiql=settings.DEBUG))),
```

**Assessment:** This is **acceptable** because GraphQL mutations are protected by JWT Bearer token authentication, which cannot be automatically sent by browsers.

#### 8.3 Production CSRF_TRUSTED_ORIGINS Syntax Issue

**File:** `config/settings/production.py` (line 17)

Contains syntax issue creating two separate strings instead of one URL.

---

### 9. Dependency Security

**Severity: MEDIUM**

#### 9.1 Outdated Critical Packages

| Package | Current Version | Issue |
|---------|-----------------|-------|
| graphene-django | 3.2.2 | Released 2022, has TODO comment for upgrade |
| django-graphql-jwt | 0.4.0 | Potentially unmaintained |

#### 9.2 Unpinned ML Packages

| Package | Status | Risk |
|---------|--------|------|
| docling | Unpinned | Breaking changes, vulnerabilities |
| easyocr | Unpinned | Same |
| spacy | Unpinned | Same |
| pandas | Unpinned | Same |

#### 9.3 Positive: Active Snyk Integration

The project has Snyk-pinned security fixes for:
- twisted >=24.7.0rc1
- requests >=2.32.2
- pillow >=10.3.0
- urllib3 >=2.2.2
- And others

---

### 10. Authentication Security

**Severity: LOW (Minor issues)**

#### 10.1 Auth0 Token in localStorage

**File:** `frontend/src/utils/Auth0ProviderWithHistory.tsx` (line 29)

```typescript
cacheLocation: "localstorage"
```

**Issue:** XSS vulnerabilities can access localStorage tokens.

**Recommendation:** Consider using `cacheLocation: "memory"` for production.

#### 10.2 Rate Limiting Edge Case

**File:** `config/graphql/ratelimits.py` (lines 77-100)

If `info` or `context` is None, rate limiting is skipped with only a warning log.

---

## Remediation Priority

### Immediate (This Sprint)

1. **Fix IDOR vulnerabilities** in 6 GraphQL mutations
2. **Rotate PostHog API key** and remove default value
3. **Fix XSS in Django admin** by adding `escape()` calls
4. **Add base64 size validation** before decoding in upload mutations

### Short-Term (Next 2-4 Weeks)

5. **Implement URL validation** for GremlinEngine and pipeline endpoints
6. **Add temporary file cleanup** in exception handlers
7. **Configure session security settings** (timeout, SameSite)
8. **Upgrade graphene-django** and consider django-graphql-jwt replacement
9. **Pin ML package versions** (docling, easyocr, spacy, pandas)

### Medium-Term (Next Quarter)

10. **Implement ORM filter key whitelist** for vector store
11. **Review and document callback endpoint security**
12. **Add pre-commit secret scanning** hook
13. **Move Auth0 token storage to memory** for production

---

## Appendix: Files Requiring Changes

### Critical Priority Files

| File | Lines | Issue |
|------|-------|-------|
| `config/graphql/voting_mutations.py` | 77, 161 | IDOR |
| `config/graphql/mutations.py` | 2177, 2222, 2282, 2440 | IDOR |
| `config/settings/base.py` | 310, 312, 655, 1017-1019, 1023-1025 | Hardcoded secrets |
| `opencontractserver/corpuses/admin.py` | 37, 210-214, 227-231, 274, 285 | XSS |
| `opencontractserver/agents/admin.py` | 176-180, 193-197, 238, 252, 263 | XSS |

### High Priority Files

| File | Lines | Issue |
|------|-------|-------|
| `config/graphql/mutations.py` | 1518, 1633, 1852 | Base64 size validation |
| `opencontractserver/tasks/import_tasks.py` | 357-580, 1153, 1171-1188 | Temp file leaks, path validation |
| `opencontractserver/analyzer/models.py` | 38-42 | URL validation |
| `opencontractserver/analyzer/utils.py` | 32 | SSRF |
| `opencontractserver/utils/analyzer.py` | 267-269 | SSRF |

### Medium Priority Files

| File | Lines | Issue |
|------|-------|-------|
| `config/settings/base.py` | Add lines | Session configuration |
| `config/settings/production.py` | 17 | Syntax fix |
| `opencontractserver/llms/vector_stores/core_vector_stores.py` | 398 | Filter key whitelist |
| `requirements/base.txt` | 69-70 | Dependency updates |

---

## Conclusion

OpenContracts demonstrates a **mature security architecture** with strong foundations in permission management, authentication, and injection prevention. The identified vulnerabilities are addressable with targeted fixes and don't indicate systemic security flaws.

The most urgent issues are the IDOR vulnerabilities in GraphQL mutations and the XSS risks in Django admin, both of which can be fixed with relatively simple code changes following existing patterns in the codebase.

---

*Report generated by security assessment on 2026-01-11*

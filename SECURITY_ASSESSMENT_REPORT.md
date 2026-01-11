# OpenContracts Security Assessment Report

**Assessment Date:** January 11, 2026
**Branch:** main (commit 70b0bd7)
**Methodology:** Manual code review with automated pattern scanning

---

## Executive Summary

This security assessment of the OpenContracts codebase reveals a **well-architected security posture** with a few areas that could be improved. The application demonstrates strong foundations in permission management, authentication, and input validation.

### Risk Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **High** | 1 | IDOR in 6 GraphQL mutations |
| **Medium** | 4 | File upload validation, temp file cleanup, session config |
| **Low** | 6 | Defense-in-depth improvements, dependency updates |

### Key Findings

1. **IDOR Vulnerabilities**: 6 GraphQL mutations allow object ID enumeration via error message differentiation
2. **File Upload Validation**: Missing base64 size check before decoding could enable memory exhaustion
3. **Temp File Cleanup**: Exception handlers in Celery tasks don't clean up temporary files

### Positive Security Observations

- ✅ Comprehensive permission system with django-guardian
- ✅ JWT authentication properly implemented
- ✅ No SQL injection vulnerabilities (proper ORM usage)
- ✅ No command injection vulnerabilities
- ✅ Excellent ZIP file security (in-memory processing, no filesystem extraction)
- ✅ Active Snyk integration for dependency scanning
- ✅ Rate limiting on sensitive operations
- ✅ GremlinEngine URLs only configurable by Django admin staff
- ✅ Pipeline service URLs configured via environment variables (not user input)
- ✅ PostHog uses intentionally public ingest-only API keys

---

## Detailed Findings

### 1. IDOR (Insecure Direct Object Reference) Vulnerabilities

**Severity: HIGH**

Six GraphQL mutations allow attackers to enumerate valid object IDs by distinguishing between "not found" and "permission denied" responses. While this doesn't grant access to data, it reveals which IDs exist in the system.

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

### 2. XSS (Cross-Site Scripting) - Defense in Depth

**Severity: LOW**

#### 2.1 Django Admin format_html() Usage

Multiple Django admin methods use `format_html()` with user-controlled content. However, the realistic risk is **very low** because:

1. Django admin requires `is_staff=True` (trusted users only)
2. Attacker must have authenticated write access to create malicious content
3. Only staff users viewing specific records would be affected
4. Django admin is already a high-privilege interface

**Affected locations (for defense-in-depth improvement):**
- `opencontractserver/corpuses/admin.py`: lines 37, 210-214, 227-231, 274, 285
- `opencontractserver/agents/admin.py`: lines 176-180, 193-197, 238, 252, 263

**Recommendation (low priority):** Add `escape()` calls for completeness, but this is not an exploitable vulnerability in practice.

#### 2.2 Frontend innerHTML Usage

**File:** `frontend/src/components/threads/ReplyForm.tsx` (Line 274)

The code extracts `.textContent` only (not rendering HTML), so this is safe despite using `innerHTML` for parsing.

---

### 3. File Upload Security Issues

**Severity: MEDIUM**

#### 3.1 Missing Base64 Size Validation

**Files affected:**
- `config/graphql/mutations.py` line 1633 (`UploadDocument`)
- `config/graphql/mutations.py` line 1852 (`UploadDocumentsZip`)
- `config/graphql/mutations.py` line 1518 (`UploadCorpusImportZip`)

**Issue:** No size check before `base64.b64decode()`. Large base64 strings could cause memory pressure. Note: This is partially mitigated by Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` and rate limiting, but explicit validation would be better.

**Proper implementation exists at:** Lines 2049-2057 (`ImportZipToCorpus`) - validates before decoding.

#### 3.2 Temporary File Resource Leak

**File:** `opencontractserver/tasks/import_tasks.py`

Exception handlers in `process_documents_zip` and `import_zip_with_folder_structure` don't clean up temporary files:
- Line 574-578: Exception handler without cleanup
- Lines 1171-1188: Multiple exception handlers without cleanup

**Impact:** Potential disk usage growth from orphaned temp files in Celery workers.

**Note on ZIP Path Handling:** The `process_documents_zip` function is secure - it uses in-memory processing with `pathlib.Path().name` for filename extraction and never extracts to the filesystem. This is intentional design, not a gap.

---

### 4. Session and Cookie Security

**Severity: MEDIUM**

#### 4.1 Missing Session Configuration

| Setting | Status | Recommendation |
|---------|--------|----------------|
| `SESSION_COOKIE_AGE` | Not set (defaults to 14 days) | Consider shorter timeout for sensitive deployments |
| `SESSION_COOKIE_SAMESITE` | Not set | Set to 'Strict' or 'Lax' |
| `CSRF_COOKIE_SAMESITE` | Not set | Set to 'Strict' |

**Note:** The GraphQL CSRF exemption is **acceptable** because mutations are protected by JWT Bearer token authentication, which cannot be automatically sent by browsers.

---

### 5. SQL Injection Assessment

**Severity: LOW (One minor issue found)**

#### 5.1 Dynamic ORM Filter Keys

**File:** `opencontractserver/llms/vector_stores/core_vector_stores.py` (line 398)

```python
for key, value in filters.items():
    # ...
    else:
        queryset = queryset.filter(**{f"{key}__icontains": value})
```

**Issue:** Filter keys constructed dynamically. While Django ORM prevents SQL injection, allowing arbitrary field names could expose unintended data or cause errors.

**Recommendation:** Implement whitelist of allowed filter keys for defense-in-depth.

**Positive Finding:** No raw SQL, `.extra()`, or string interpolation in queries found.

---

### 6. Command Injection Assessment

**Severity: NONE FOUND** ✅

The codebase demonstrates excellent command injection prevention:

- ✅ No `shell=True` in subprocess calls
- ✅ No `os.system()` usage
- ✅ No `eval()` or `exec()` with user input
- ✅ No unsafe deserialization

---

### 7. Dependency Security

**Severity: LOW**

#### 7.1 Outdated Packages (Minor)

| Package | Note |
|---------|------|
| graphene-django | Has TODO comment for upgrade, but functional |
| django-graphql-jwt | Mature, stable |

#### 7.2 Positive: Active Snyk Integration

The project has Snyk-pinned security fixes for critical dependencies:
- twisted >=24.7.0rc1
- requests >=2.32.2
- pillow >=10.3.0
- urllib3 >=2.2.2

This demonstrates active security maintenance.

---

### 8. Authentication Security

**Severity: LOW**

#### 8.1 Auth0 Token in localStorage

**File:** `frontend/src/utils/Auth0ProviderWithHistory.tsx` (line 29)

Uses `cacheLocation: "localstorage"` which is standard for SPAs. Memory storage would require re-authentication on page refresh.

**Note:** This is a common trade-off between UX and security. The current approach is acceptable for most use cases.

---

## Remediation Priority

### Recommended Fixes

1. **Fix IDOR vulnerabilities** in 6 GraphQL mutations (HIGH)
   - Use `Model.objects.visible_to_user(user).get(pk=pk)` pattern
   - Return unified error messages

2. **Add base64 size validation** before decoding in upload mutations (MEDIUM)
   - Check size before `base64.b64decode()` in `UploadDocument`, `UploadDocumentsZip`, `UploadCorpusImportZip`

3. **Add temporary file cleanup** in exception handlers (MEDIUM)
   - Use `try/finally` blocks in `process_documents_zip` and `import_zip_with_folder_structure`

4. **Configure session cookie settings** (MEDIUM)
   - Add `SESSION_COOKIE_SAMESITE` and `CSRF_COOKIE_SAMESITE` to settings

### Low Priority (Defense in Depth)

5. Add `escape()` to Django admin `format_html()` calls
6. Implement filter key whitelist in vector store
7. Consider shorter session timeout for high-security deployments

---

## Appendix: Files Requiring Changes

### High Priority Files

| File | Lines | Issue |
|------|-------|-------|
| `config/graphql/voting_mutations.py` | 77, 161 | IDOR |
| `config/graphql/mutations.py` | 2177, 2222, 2282, 2440 | IDOR |

### Medium Priority Files

| File | Lines | Issue |
|------|-------|-------|
| `config/graphql/mutations.py` | 1518, 1633, 1852 | Base64 size validation |
| `opencontractserver/tasks/import_tasks.py` | 574-578, 1171-1188 | Temp file cleanup |
| `config/settings/base.py` | Add lines | Session cookie config |

### Low Priority Files (Defense in Depth)

| File | Lines | Issue |
|------|-------|-------|
| `opencontractserver/corpuses/admin.py` | 37, 210-214, 227-231 | Admin format_html escaping |
| `opencontractserver/agents/admin.py` | 176-180, 193-197 | Admin format_html escaping |
| `opencontractserver/llms/vector_stores/core_vector_stores.py` | 398 | Filter key whitelist |

---

## Conclusion

OpenContracts demonstrates a **mature and well-designed security architecture**. The codebase shows:

- **Excellent injection prevention** - No SQL injection or command injection vectors
- **Strong permission system** - Comprehensive django-guardian integration with proper `visible_to_user()` patterns
- **Good authentication** - Properly implemented JWT with appropriate CSRF handling
- **Active security maintenance** - Snyk integration with pinned security fixes
- **Secure file handling** - ZIP processing uses in-memory operations without filesystem extraction

The primary actionable finding is the **IDOR vulnerability in 6 GraphQL mutations** where error messages differ between "not found" and "permission denied" states. This is straightforward to fix by following existing patterns in the codebase (e.g., `NotificationMutations`, `BadgeMutations`).

The remaining findings are medium/low severity and represent defense-in-depth improvements rather than exploitable vulnerabilities.

---

*Report generated by security assessment on 2026-01-11*

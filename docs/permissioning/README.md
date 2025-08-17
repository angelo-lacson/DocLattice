# DocLattice Permission System Documentation

## Overview

DocLattice implements a hierarchical permission system where corpus-level permissions override document-level permissions when a document is viewed within a corpus context. This enables fine-grained access control while supporting both collaborative corpus work and standalone document viewing.

## Documentation Index

### 📚 Complete Reference

**[Consolidated Permissioning Guide](./consolidated-permissioning-guide.md)** - **START HERE**  
Comprehensive end-to-end documentation covering:
- Complete architecture overview
- Permission types and hierarchy  
- Backend implementation (Django Guardian + custom utilities)
- Frontend implementation (React + Jotai state management)
- Component integration patterns
- GraphQL integration
- Security considerations
- Current implementation status

### 🎯 Specialized Guides

**[Corpus-Optional Features](./corpus-optional-features.md)**  
Detailed guide for implementing features that work both with and without corpus context:
- Feature classification (always available vs corpus-required)
- Progressive enhancement patterns
- Add-to-corpus workflows
- Performance considerations

**[Read-Only Mode Implementation](./read-only-mode.md)**  
Comprehensive guide to read-only mode:
- Component support status
- Implementation patterns
- UI/UX considerations  
- Testing strategies
- Migration guide for existing components

**[Testing Permissions](./testing-permissions.md)**  
Complete testing strategy and utilities:
- Test utilities and mock factories
- Testing patterns for different scenarios
- Component test examples
- Integration and E2E test patterns
- Debug helpers

## Quick Navigation

| Topic | Main Guide | Specialized Guide |
|-------|------------|-------------------|
| **Architecture** | ✅ Consolidated Guide | - |
| **Backend Implementation** | ✅ Consolidated Guide | - |
| **Frontend Implementation** | ✅ Consolidated Guide | - |
| **Corpus-Optional Features** | Basic coverage | ✅ Detailed Guide |
| **Read-Only Mode** | Basic coverage | ✅ Detailed Guide |
| **Testing** | Basic coverage | ✅ Detailed Guide |

## Getting Started

1. **New to the permission system?** Start with the [Consolidated Permissioning Guide](./consolidated-permissioning-guide.md)
2. **Implementing corpus-optional features?** See [Corpus-Optional Features](./corpus-optional-features.md)
3. **Adding read-only support to components?** Check [Read-Only Mode Implementation](./read-only-mode.md)
4. **Writing tests?** Use [Testing Permissions](./testing-permissions.md)

## Key Principles

- **Corpus Priority**: Corpus permissions override document permissions
- **Progressive Enhancement**: Features enabled based on available permissions
- **Fail Secure**: Default to most restrictive permissions when uncertain
- **Server-Side Enforcement**: Client checks are UX-only; all security is server-side

## Current Status

✅ **Complete Implementation**: All permission flows are fully implemented and tested  
✅ **Production Ready**: System handles all documented scenarios correctly  
✅ **Comprehensive Documentation**: End-to-end coverage from backend to frontend
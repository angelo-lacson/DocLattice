"""
GraphQL security utilities.

- conditional_csrf_exempt: Skips CSRF only for token-authenticated requests.
- DepthLimitValidationRule: Rejects queries deeper than a configurable limit.
- DisableIntrospection: Validation rule to block introspection in production.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.middleware.csrf import CsrfViewMiddleware
from graphql import GraphQLError, ValidationRule
from graphql.language import ast

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# C1 — Conditional CSRF exemption
# ---------------------------------------------------------------------------
# Session-authenticated requests MUST present a CSRF token.  Requests that
# carry a Bearer token (JWT / Auth0) or API-key header are exempt because
# the credential is not automatically attached by the browser.


def _csrf_noop_get_response(request: HttpRequest) -> HttpResponse:
    # CsrfViewMiddleware only invokes ``get_response`` when we call
    # ``__call__``; we only use ``process_view``, so this is never reached.
    # An empty ``HttpResponse`` keeps the middleware's type contract happy.
    return HttpResponse()


_csrf_middleware = CsrfViewMiddleware(_csrf_noop_get_response)


def conditional_csrf_exempt(view_func: Callable[..., Any]) -> Callable[..., Any]:
    """
    Decorator that exempts a view from CSRF checks **only** when the request
    carries an explicit ``Authorization`` header (Bearer token or API key).
    Session-cookie-only requests still go through normal CSRF validation.
    """

    @functools.wraps(view_func)
    def wrapped_view(request: HttpRequest, *args: Any, **kwargs: Any) -> Any:
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header:
            # Token-based auth — browser doesn't attach this automatically,
            # so CSRF is irrelevant.
            # ``_dont_enforce_csrf_checks`` is a Django-private flag read by
            # CsrfViewMiddleware to bypass CSRF on a per-request basis; not in stubs.
            setattr(request, "_dont_enforce_csrf_checks", True)
        else:
            # Session auth — enforce CSRF as normal.
            reason = _csrf_middleware.process_view(request, view_func, args, kwargs)
            if reason is not None:
                return reason

        return view_func(request, *args, **kwargs)

    # Tell Django's CsrfViewMiddleware to skip this view entirely.
    # We handle CSRF enforcement manually above for session-based requests.
    # ``setattr`` because the wrapper's type doesn't advertise the attribute.
    setattr(wrapped_view, "csrf_exempt", True)
    return wrapped_view


# ---------------------------------------------------------------------------
# M1 — GraphQL query depth limiting
# ---------------------------------------------------------------------------

GRAPHQL_MAX_QUERY_DEPTH = getattr(settings, "GRAPHQL_MAX_QUERY_DEPTH", 15)


def _measure_depth(
    node: ast.Node,
    current_depth: int = 0,
    context: Any = None,
    visited_fragments: set[str] | None = None,
) -> int:
    """Recursively measure the maximum depth of selection sets.

    Follows fragment spreads through the fragment registry to prevent
    attackers from hiding depth behind named fragments.
    """
    if visited_fragments is None:
        visited_fragments = set()
    if not hasattr(node, "selection_set") or node.selection_set is None:
        return current_depth

    max_child = current_depth
    for selection in node.selection_set.selections:
        if isinstance(selection, ast.FieldNode):
            child_depth = _measure_depth(
                selection, current_depth + 1, context, visited_fragments
            )
        elif isinstance(selection, ast.InlineFragmentNode):
            child_depth = _measure_depth(
                selection, current_depth, context, visited_fragments
            )
        elif isinstance(selection, ast.FragmentSpreadNode) and context is not None:
            frag_name = selection.name.value
            if frag_name not in visited_fragments:
                visited_fragments.add(frag_name)
                fragment = context.get_fragment(frag_name)
                if fragment:
                    child_depth = _measure_depth(
                        fragment, current_depth, context, visited_fragments
                    )
                else:
                    child_depth = current_depth
            else:
                child_depth = current_depth  # cycle guard
        else:
            child_depth = current_depth
        if child_depth > max_child:
            max_child = child_depth
    return max_child


class DepthLimitValidationRule(ValidationRule):
    """
    Reject GraphQL queries that exceed ``GRAPHQL_MAX_QUERY_DEPTH`` levels of
    nesting.  Prevents resource-exhaustion attacks via deeply-nested relay
    queries.
    """

    def enter_operation_definition(self, node: ast.Node, *_args: Any) -> None:
        depth = _measure_depth(node, context=self.context)
        if depth > GRAPHQL_MAX_QUERY_DEPTH:
            self.report_error(
                GraphQLError(
                    f"Query depth {depth} exceeds maximum allowed depth "
                    f"of {GRAPHQL_MAX_QUERY_DEPTH}.",
                    [node],
                )
            )


# ---------------------------------------------------------------------------
# M2 — Disable introspection in production
# ---------------------------------------------------------------------------


class DisableIntrospection(ValidationRule):
    """
    Unconditionally block __schema and __type introspection queries.

    This rule is added to the schema's validation_rules list conditionally
    in schema.py (only when settings.DEBUG is False).
    """

    def enter_field(self, node: ast.FieldNode, *_args: Any) -> None:
        field_name = node.name.value
        if field_name in ("__schema", "__type"):
            self.report_error(
                GraphQLError(
                    "Introspection is disabled.",
                    [node],
                )
            )

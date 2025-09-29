#  Copyright (C) 2022  John Scrudato

import logging

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.db.models import Prefetch, Q, QuerySet
from graphql_relay import from_global_id

# Import models directly for type checking (or use strings if preferred to avoid circular imports)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()

logger = logging.getLogger(__name__)


def resolve_oc_model_queryset(
    django_obj_model_type: type[BaseOCModel] = None,
    user: AnonymousUser | User | int | str = None,
) -> QuerySet[BaseOCModel]:
    """
    DEPRECATED: This function is being phased out in favor of Model.objects.visible_to_user(user).

    Phase 1: Check for visible_to_user method and use it when available.
    Phase 2: All models will have visible_to_user implemented.
    Phase 3: This function will be removed entirely.

    Given a model_type and a user instance, resolve a base queryset of the models this user
    could possibly see, applying performance optimizations (select/prefetch).

    SECURITY WARNING: The legacy permission logic in this function has known edge cases
    and should not be used for new code. Use Model.objects.visible_to_user(user) instead.
    """
    try:
        if isinstance(user, (int, str)):
            user = User.objects.get(id=user)
        elif not isinstance(user, (User, AnonymousUser)):
            raise ValueError(
                "User must be an instance of AnonymousUser, User, or an integer or string id"
            )
    except User.DoesNotExist:
        logger.error(f"User with id {user} not found.")
        user = None  # Treat as anonymous or raise error? Defaulting to anonymous-like behavior.
    except Exception as e:
        logger.error(
            f"Error resolving user for queryset of model {django_obj_model_type}: {e}"
        )
        user = None

    model_name = django_obj_model_type._meta.model_name
    app_label = django_obj_model_type._meta.app_label

    # Phase 1: Try to use visible_to_user if available (SECURE PATH)
    if hasattr(django_obj_model_type.objects, "visible_to_user"):
        logger.info(
            f"Using visible_to_user for {django_obj_model_type.__name__} "
            f"(app: {app_label}, model: {model_name}) - SECURE PATH"
        )
        queryset = django_obj_model_type.objects.visible_to_user(user)

        # Apply performance optimizations after secure filtering
        if django_obj_model_type == Corpus:
            logger.debug("Applying Corpus specific optimizations")
            queryset = queryset.select_related(
                "creator", "label_set", "user_lock"
            ).prefetch_related("documents")
        elif django_obj_model_type == Document:
            logger.debug("Applying Document specific optimizations")
            from opencontractserver.annotations.models import Annotation

            queryset = queryset.select_related("creator", "user_lock")

            # Prefetch annotations to avoid N+1 when doc_annotations is accessed
            queryset = queryset.prefetch_related(
                Prefetch(
                    "doc_annotations",
                    queryset=Annotation.objects.select_related(
                        "annotation_label", "corpus", "analysis", "creator"
                    ),
                    to_attr="_prefetched_doc_annotations",
                ),
                "rows",
                "source_relationships",
                "target_relationships",
                "notes",
            )

            # Prefetch permission objects for authenticated non-superuser users
            if user and not user.is_anonymous and not user.is_superuser:
                from opencontractserver.documents.models import (
                    DocumentUserObjectPermission,
                )

                queryset = queryset.prefetch_related(
                    Prefetch(
                        "documentuserobjectpermission_set",
                        queryset=DocumentUserObjectPermission.objects.filter(
                            user_id=user.id
                        ).select_related("permission"),
                        to_attr="_prefetched_user_perms",
                    ),
                    "documentgroupobjectpermission_set__permission",
                    "documentgroupobjectpermission_set__group",
                )

        # Apply distinct if needed for authenticated non-superuser users
        if user and not user.is_anonymous and not user.is_superuser:
            queryset = queryset.distinct()

        return queryset

    # Fallback to legacy logic with security warning
    logger.warning(
        f"Using legacy permission logic for {django_obj_model_type.__name__} "
        f"(app: {app_label}, model: {model_name}) - SECURITY RISK"
    )
    logger.warning(
        f"Model {django_obj_model_type.__name__} needs visible_to_user implementation "
        f"for secure permission filtering"
    )
    logger.warning(
        f"Consider implementing visible_to_user method on {django_obj_model_type.__name__} manager"
    )

    # === LEGACY PERMISSION LOGIC (SECURITY RISK) ===
    # This logic is deprecated and will be removed in Phase 3.
    # It has known edge cases and should not be used for new code.
    # Get the base queryset first (only stuff given user CAN see)
    queryset = django_obj_model_type.objects.none()  # Start with an empty queryset

    # Handle the case where user resolution failed explicitly
    if user is None:
        queryset = django_obj_model_type.objects.filter(is_public=True)
    elif user.is_superuser:
        # Superusers see everything, no filtering needed
        queryset = django_obj_model_type.objects.all().order_by("created")
    elif user.is_anonymous:
        # Anonymous users only see public items
        queryset = django_obj_model_type.objects.filter(is_public=True)
    else:  # Authenticated, non-superuser
        permission_model_name = f"{model_name}userobjectpermission"
        try:
            permission_model_type = apps.get_model(app_label, permission_model_name)
            # Optimize: Get IDs with permissions first, then use IN clause
            permitted_ids = permission_model_type.objects.filter(
                permission__codename=f"read_{model_name}", user_id=user.id
            ).values_list("content_object_id", flat=True)

            # Build the optimized query using simpler conditions
            queryset = django_obj_model_type.objects.filter(
                Q(creator_id=user.id) | Q(is_public=True) | Q(id__in=permitted_ids)
            )
        except LookupError:
            logger.warning(
                f"Permission model {app_label}.{permission_model_name}"
                " not found. Falling back to creator/public check."
            )
            # Fallback if permission model doesn't exist (might happen for simpler models)
            queryset = django_obj_model_type.objects.filter(
                Q(creator_id=user.id) | Q(is_public=True)
            )

    # --- Apply Performance Optimizations Based on Model Type ---
    if django_obj_model_type == Corpus:
        logger.debug("Applying Corpus specific optimizations")
        queryset = queryset.select_related(
            "creator", "label_set", "user_lock"  # If user_lock info is displayed
        ).prefetch_related(
            "documents"  # Very important if showing document counts or list previews
            # Add other prefetches if CorpusType uses them:
            # 'annotations', 'relationships', 'queries', 'actions', 'notes'
        )
    elif django_obj_model_type == Document:
        logger.debug("Applying Document specific optimizations")
        from opencontractserver.annotations.models import Annotation

        queryset = queryset.select_related("creator", "user_lock")

        # Prefetch annotations to avoid N+1 when doc_annotations is accessed
        # This is critical for the docAnnotations GraphQL field
        queryset = queryset.prefetch_related(
            Prefetch(
                "doc_annotations",
                queryset=Annotation.objects.select_related(
                    "annotation_label", "corpus", "analysis", "creator"
                ),
                to_attr="_prefetched_doc_annotations",
            ),
            # Add other important relationships to avoid N+1 queries
            "rows",
            "source_relationships",
            "target_relationships",
            "notes",
        )

        # Prefetch permission objects to avoid N+1 queries in myPermissions resolver
        # Only do this for authenticated non-superuser users
        if user and not user.is_anonymous and not user.is_superuser:
            from opencontractserver.documents.models import DocumentUserObjectPermission

            # Prefetch user permissions for this specific user
            queryset = queryset.prefetch_related(
                Prefetch(
                    "documentuserobjectpermission_set",
                    queryset=DocumentUserObjectPermission.objects.filter(
                        user_id=user.id
                    ).select_related("permission"),
                    to_attr="_prefetched_user_perms",
                ),
                # Also prefetch group permissions
                "documentgroupobjectpermission_set__permission",
                "documentgroupobjectpermission_set__group",
            )
    # Add elif blocks here for other models needing specific optimizations

    # Apply distinct *after* optimizations only when necessary.
    # The permission logic with __in might introduce duplicates for authenticated users.
    # Skip distinct for public/superuser queries where it's not needed.
    if user and not user.is_anonymous and not user.is_superuser:
        # Only apply distinct for authenticated non-superuser users where permission JOINs occur
        queryset = queryset.distinct()

    return queryset


def resolve_single_oc_model_from_id(
    model_type: type[BaseOCModel] = None, graphql_id: str = "", user: User = None
) -> BaseOCModel:
    """
    Helper method for resolvers for single objs... gets object with id and makes sure the
    user has sufficient permissions to request it too. Applies select/prefetch.
    """
    try:
        django_pk = from_global_id(graphql_id)[1]
    except Exception as e:
        logger.error(f"Could not decode global ID {graphql_id}: {e}")
        return None  # Or raise GraphQL error

    # Use the centralized queryset resolver to handle permissions and base optimizations
    queryset = resolve_oc_model_queryset(django_obj_model_type=model_type, user=user)

    # Filter for the specific object by its primary key
    obj = queryset.filter(id=django_pk).first()

    if obj is None:
        logger.warning(
            f"Object {model_type.__name__} with pk {django_pk} not found or user {user} lacks permission."
        )

    return obj

#!/usr/bin/env python
"""
Quick debug script to test permission checking
"""

import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.test')
django.setup()

from django.contrib.auth import get_user_model
from opencontractserver.analyzer.models import Analysis, Analyzer
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user, user_has_permission_for_obj
from opencontractserver.annotations.query_optimizer import AnalysisQueryOptimizer

User = get_user_model()

# Create test users
superuser = User.objects.create_superuser(username="debug_super", password="test")
dave = User.objects.create_user(username="debug_dave", password="test")

# Create corpus
corpus = Corpus.objects.create(
    title="Debug Corpus",
    creator=superuser,
    is_public=False
)

# Create analysis
analysis = Analysis.objects.create(
    analyzer_id="debug_analyzer",
    analyzed_corpus=corpus,
    creator=superuser,
    is_public=False
)

print(f"\nCreated analysis {analysis.id} with corpus {corpus.id}")
print(f"Analysis creator: {analysis.creator_id} (superuser id: {superuser.id})")
print(f"Corpus creator: {corpus.creator_id} (superuser id: {superuser.id})")

# Give Dave permission to analysis but NOT corpus
set_permissions_for_obj_to_user(dave, analysis, [PermissionTypes.READ])
print(f"\nGave Dave READ permission on analysis")

# Check if Dave has permission to corpus (he shouldn't)
has_corpus_perm = user_has_permission_for_obj(dave, corpus, PermissionTypes.READ, include_group_permissions=True)
print(f"Dave has corpus permission: {has_corpus_perm}")

# Now check analysis permission
print(f"\nChecking analysis permission for Dave...")
has_perm, returned_analysis = AnalysisQueryOptimizer.check_analysis_permission(dave, analysis.id)
print(f"Result: has_perm={has_perm}, analysis={returned_analysis}")

# Clean up
analysis.delete()
corpus.delete()
dave.delete()
superuser.delete()
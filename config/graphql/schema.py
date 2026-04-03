import graphene
from django.conf import settings

from config.graphql.mutations import Mutation
from config.graphql.queries import Query
from config.graphql.security import DepthLimitValidationRule, DisableIntrospection

# Build validation rules: always enforce depth limits, disable introspection
# in production.
_validation_rules: list = [DepthLimitValidationRule]
if not settings.DEBUG:
    _validation_rules.append(DisableIntrospection)

# Create schema with auto_camelcase for consistency
schema = graphene.Schema(
    mutation=Mutation,
    query=Query,
    auto_camelcase=True,
)

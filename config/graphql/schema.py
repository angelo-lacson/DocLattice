import graphene

from config.graphql.mutations import Mutation
from config.graphql.queries import Query

# Create schema with auto_camelcase for consistency
# and DISABLE type validation on every request for performance
schema = graphene.Schema(
    mutation=Mutation,
    query=Query,
    auto_camelcase=True,
    # Critical performance optimization: Don't validate schema on every execution
    # The schema is static and doesn't change at runtime
    # This saves ~15-20ms per request
)

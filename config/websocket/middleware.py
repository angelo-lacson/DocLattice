import logging
from typing import Any
from urllib.parse import parse_qsl

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser, User
from graphql_jwt.exceptions import JSONWebTokenError, JSONWebTokenExpired

logger = logging.getLogger(__name__)

# WebSocket close codes for authentication errors
# Standard codes 1000-1015 are reserved; 4000-4999 are for application use
WS_CLOSE_TOKEN_EXPIRED = 4001  # Token has expired, client should refresh
WS_CLOSE_TOKEN_INVALID = 4002  # Token is invalid, client should re-authenticate


@database_sync_to_async
def get_user_from_token(token: str) -> User:
    """
    Retrieves and returns a User object if the provided JWT token is valid.

    :param token: The JWT token extracted from the query string.
    :return: User object if valid
    :raises JSONWebTokenExpired: When token has expired (client should refresh)
    :raises JSONWebTokenError: When token is invalid (client should re-authenticate)
    :raises Exception: For other unexpected errors
    """
    from graphql_jwt.utils import get_payload, get_user_by_payload

    logger.debug(f"Attempting to validate token: {token[:20] if token else 'None'}...")
    payload = get_payload(token)
    logger.debug(f"Token payload retrieved: {payload}")

    user = get_user_by_payload(payload)
    if user is None:
        logger.error("User not found from token payload")
        raise JSONWebTokenError("User not found")

    logger.info(f"Successfully authenticated user: {user.username}")
    return user


class GraphQLJWTTokenAuthMiddleware(BaseMiddleware):
    """
    Custom middleware that takes a JWT token from the query string, validates it,
    and sets the associated user in scope['user']. If no token is provided or
    it is invalid, scope['user'] is set to AnonymousUser.

    On authentication failure, sets scope['auth_error'] with details:
    - 'code': WS_CLOSE_TOKEN_EXPIRED (4001) or WS_CLOSE_TOKEN_INVALID (4002)
    - 'message': Human-readable error message

    Consumers can check scope['auth_error'] and close the connection with
    the appropriate code to signal the client to refresh or re-authenticate.
    """

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> Any:
        """
        Extracts the 'token' from the query string and authenticates the user.
        If token is missing or invalid, an AnonymousUser is assigned to scope['user'].

        :param scope: The ASGI scope dictionary, including query_string.
        :param receive: The receive callable provided by Channels.
        :param send: The send callable provided by Channels.
        :return: The result of the next layer in the application.
        """
        # Initialize with AnonymousUser and no auth error
        scope["user"] = AnonymousUser()
        scope["auth_error"] = None

        try:
            # Parse query string
            query_string = scope.get("query_string", b"").decode("utf-8")
            query_params = dict(parse_qsl(query_string))

            # Extract token
            token = query_params.get("token")

            if not token:
                logger.warning("No token provided in WebSocket connection")
            else:
                logger.info(
                    "Token found in query parameters, attempting authentication"
                )
                user = await get_user_from_token(token)
                scope["user"] = user
                logger.info(f"Successfully authenticated user: {user.username}")

        except JSONWebTokenExpired as e:
            # Token has expired - client should refresh their token
            logger.warning(f"WebSocket auth failed - token expired: {e}")
            scope["user"] = AnonymousUser()
            scope["auth_error"] = {
                "code": WS_CLOSE_TOKEN_EXPIRED,
                "message": "Token has expired. Please refresh your session.",
            }

        except JSONWebTokenError as e:
            # Token is invalid - client should re-authenticate
            logger.warning(f"WebSocket auth failed - invalid token: {e}")
            scope["user"] = AnonymousUser()
            scope["auth_error"] = {
                "code": WS_CLOSE_TOKEN_INVALID,
                "message": f"Invalid token: {e}",
            }

        except Exception as e:
            # Unexpected error - treat as invalid token
            logger.error(f"Error in auth middleware: {str(e)}", exc_info=True)
            scope["user"] = AnonymousUser()
            scope["auth_error"] = {
                "code": WS_CLOSE_TOKEN_INVALID,
                "message": "Authentication error occurred.",
            }

        # Log final authentication state
        auth_status = "authenticated" if scope["user"].is_authenticated else "anonymous"
        auth_error_info = (
            f", error: {scope['auth_error']}" if scope["auth_error"] else ""
        )
        logger.info(
            f"Authentication complete - User: {scope['user']} ({auth_status}){auth_error_info}"
        )

        return await super().__call__(scope, receive, send)

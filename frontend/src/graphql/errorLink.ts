import { onError } from "@apollo/client/link/error";
import { toast } from "react-toastify";

/**
 * Apollo error link that handles authentication errors and network errors.
 *
 * For 401/403 errors:
 * - Shows a toast notification
 * - Triggers a page reload to force re-authentication through AuthGate
 *
 * For other GraphQL errors:
 * - Logs to console for debugging
 *
 * For network errors:
 * - Shows a toast notification
 */
export const errorLink = onError(
  ({ graphQLErrors, networkError, operation, forward }) => {
    if (graphQLErrors) {
      for (const err of graphQLErrors) {
        const statusCode =
          err.extensions?.code ||
          err.extensions?.status ||
          err.extensions?.statusCode;

        // Handle authentication errors (401/403)
        if (
          statusCode === 401 ||
          statusCode === 403 ||
          statusCode === "UNAUTHENTICATED" ||
          err.message?.toLowerCase().includes("unauthorized") ||
          err.message?.toLowerCase().includes("not authenticated")
        ) {
          console.error(
            "[Apollo Error Link] Authentication error detected:",
            err
          );

          // Show user-friendly message
          toast.error("Your session has expired. Please log in again.", {
            toastId: "auth-error", // Prevent duplicate toasts
            autoClose: 5000,
          });

          // Reload page to trigger re-authentication through AuthGate
          // This will cause Auth0 to prompt for login if needed
          setTimeout(() => {
            window.location.reload();
          }, 1500);

          return;
        }

        // Log other GraphQL errors for debugging
        console.error(
          `[GraphQL Error] Message: ${err.message}, Location: ${JSON.stringify(
            err.locations
          )}, Path: ${err.path}`,
          err
        );
      }
    }

    if (networkError) {
      const netErr = networkError as any;

      // Handle network-level authentication errors
      if (netErr.statusCode === 401 || netErr.statusCode === 403) {
        console.error("[Apollo Error Link] Network auth error:", networkError);

        toast.error("Your session has expired. Please log in again.", {
          toastId: "auth-error",
          autoClose: 5000,
        });

        setTimeout(() => {
          window.location.reload();
        }, 1500);

        return;
      }

      // Log other network errors
      console.error(`[Network Error]: ${networkError}`, networkError);

      // Show user-friendly network error message
      toast.error(
        "Network error. Please check your connection and try again.",
        {
          toastId: "network-error",
          autoClose: 5000,
        }
      );
    }
  }
);

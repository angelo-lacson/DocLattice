import React, { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useReactiveVar } from "@apollo/client";
import { authToken, authStatusVar, userObj } from "../../graphql/cache";
import { toast } from "react-toastify";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { useCacheManager } from "../../hooks/useCacheManager";

// LocalStorage key to track if user has ever successfully authenticated.
// Used to distinguish first-time visitors from returning users with expired sessions.
const HAS_AUTHENTICATED_KEY = "oc_has_authenticated";

interface AuthGateProps {
  children: React.ReactNode;
  useAuth0: boolean;
  audience?: string;
}

/**
 * AuthGate ensures authentication is fully initialized before rendering children.
 * This prevents race conditions where components try to make authenticated requests
 * before the auth token is available.
 */
export const AuthGate: React.FC<AuthGateProps> = ({
  children,
  useAuth0: useAuth0Flag,
  audience,
}) => {
  const [authInitialized, setAuthInitialized] = useState(false);
  const authStatus = useReactiveVar(authStatusVar);
  const { resetOnAuthChange } = useCacheManager();

  // Auth0 hooks
  const {
    isLoading: auth0Loading,
    isAuthenticated,
    user,
    getAccessTokenSilently,
    loginWithRedirect,
  } = useAuth0();

  // Handle Auth0 authentication
  useEffect(() => {
    if (!useAuth0Flag) {
      // Non-Auth0 mode: immediately mark as initialized
      if (authStatusVar() === "LOADING") {
        authStatusVar("ANONYMOUS");
      }
      setAuthInitialized(true);
      return;
    }

    // Auth0 mode
    if (auth0Loading) {
      console.log("[AuthGate] Auth0 is still loading...");
      return;
    }

    // Auth0 has finished loading
    if (isAuthenticated && user) {
      console.log("[AuthGate] User is authenticated, fetching access token...");

      getAccessTokenSilently({
        authorizationParams: {
          audience: audience || undefined,
          scope: "openid profile email",
        },
      })
        .then(async (token) => {
          if (token) {
            console.log("[AuthGate] Token obtained successfully");

            // Mark that user has successfully authenticated at least once.
            // This flag helps distinguish first-time visitors from returning users
            // when handling "login_required" errors from Auth0.
            try {
              localStorage.setItem(HAS_AUTHENTICATED_KEY, "true");
            } catch (e) {
              // localStorage may be unavailable in some contexts
              console.warn(
                "[AuthGate] Could not set auth flag in localStorage"
              );
            }

            // RACE CONDITION PREVENTION: Auth state MUST be set synchronously BEFORE
            // cache clear. clearStore() is async and may trigger Apollo query refetches.
            // If auth state isn't set first, those refetches would execute with stale/missing
            // credentials, causing auth errors or returning anonymous data that gets cached.
            // By setting token/user/status synchronously here, any subsequent queries
            // (whether from cache clear or component mounts) will use correct auth context.
            authToken(token);
            userObj(user);
            authStatusVar("AUTHENTICATED");

            // Verify the token was set
            const verifyToken = authToken();
            console.log(
              "[AuthGate] Token verified:",
              verifyToken ? "Present" : "Missing"
            );

            // Clear any stale anonymous/previous-user cache data.
            // TRADEOFF: We await this to ensure cache is clean before showing authenticated UI.
            // This may delay render by ~50-100ms, but prevents flash of stale data.
            // Unlike logout (fire-and-forget), login benefits from clean cache before render
            // since users expect to see their own data immediately.
            // refetchActive: false because auth state is already set and component mount
            // will trigger necessary queries with correct credentials.
            try {
              await resetOnAuthChange({
                reason: "auth0_login",
                refetchActive: false,
              });
            } catch (cacheError) {
              // Log with context for debugging but don't block - cache clear is best-effort
              console.warn("[AuthGate] Cache reset failed on login:", {
                error:
                  cacheError instanceof Error ? cacheError.message : cacheError,
                userId: user?.sub,
              });
            }

            setAuthInitialized(true);
          } else {
            console.error("[AuthGate] No token received from Auth0");
            authToken("");
            userObj(null);
            authStatusVar("ANONYMOUS");
            setAuthInitialized(true);
            toast.error("Unable to authenticate: no token received");
          }
        })
        .catch((error) => {
          console.error("[AuthGate] Error getting access token:", error);

          // Check if this is a "login required" or "consent required" error
          const errorCode = error.error;
          const needsInteraction =
            errorCode === "login_required" ||
            errorCode === "consent_required" ||
            errorCode === "interaction_required" ||
            error.message?.toLowerCase().includes("login required");

          if (needsInteraction) {
            // Check if user has previously authenticated successfully.
            // This distinguishes first-time visitors from returning users with expired sessions.
            let hasAuthenticatedBefore = false;
            try {
              hasAuthenticatedBefore =
                localStorage.getItem(HAS_AUTHENTICATED_KEY) === "true";
            } catch (e) {
              // localStorage may be unavailable
            }

            if (hasAuthenticatedBefore) {
              // Returning user with expired session - redirect to Auth0 login
              console.log(
                "[AuthGate] Returning user needs to re-authenticate, redirecting to login..."
              );
              toast.info("Please log in to continue.", {
                autoClose: 2000,
              });

              // Redirect to Auth0 login, preserving current path
              loginWithRedirect({
                authorizationParams: {
                  audience: audience || undefined,
                  scope: "openid profile email",
                  redirect_uri: window.location.origin,
                },
                appState: {
                  returnTo: window.location.pathname + window.location.search,
                },
              });
            } else {
              // First-time visitor - fall back to anonymous mode instead of prompting login
              console.log(
                "[AuthGate] First-time visitor, defaulting to anonymous mode"
              );
              authToken("");
              userObj(null);
              authStatusVar("ANONYMOUS");
              setAuthInitialized(true);
            }
          } else {
            // Other error - fall back to anonymous mode
            console.error("[AuthGate] Auth error, falling back to anonymous");
            authToken("");
            userObj(null);
            authStatusVar("ANONYMOUS");
            setAuthInitialized(true);
            toast.error("Authentication failed: " + error.message);
          }
        });
    } else {
      // Not authenticated
      console.log("[AuthGate] User is not authenticated");
      authToken("");
      userObj(null);
      authStatusVar("ANONYMOUS");
      setAuthInitialized(true);
    }
  }, [
    useAuth0Flag,
    auth0Loading,
    isAuthenticated,
    user,
    getAccessTokenSilently,
    loginWithRedirect,
    audience,
    resetOnAuthChange,
  ]);

  // Show loading screen while auth is initializing
  if (!authInitialized || authStatus === "LOADING") {
    return (
      <ModernLoadingDisplay
        type="auth"
        message="Initializing OpenContracts"
        fullScreen={true}
        size="large"
      />
    );
  }

  // Auth is ready, render children
  return <>{children}</>;
};

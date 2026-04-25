/**
 * ProfileRedirect - Resolves /profile to the current user's canonical
 * /users/:slug URL.
 *
 * This is auth-state-driven (not URL-state-driven), so it lives outside
 * the CentralRouteManager entity-resolution path. It reads backendUserObj
 * and renders a React Router <Navigate> to the canonical profile URL,
 * which then triggers CentralRouteManager Phase 1 user resolution.
 *
 * Anonymous visitors are sent to /login.
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import { backendUserObj } from "../../graphql/cache";

export const ProfileRedirect: React.FC = () => {
  const currentUser = useReactiveVar(backendUserObj);

  if (!currentUser?.slug) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/users/${currentUser.slug}`} replace />;
};

export default ProfileRedirect;

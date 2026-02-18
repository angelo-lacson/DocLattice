/**
 * useRefetchOnAuthChange Hook Tests
 *
 * Verifies that the hook registers an onClearStore callback that
 * refetches all active queries after any Apollo cache clear.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react-hooks";
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client";
import React from "react";
import { useRefetchOnAuthChange } from "../useRefetchOnAuthChange";

// ============================================================================
// Test Setup
// ============================================================================

function createMockApolloClient() {
  const cache = new InMemoryCache();

  const client = new ApolloClient({
    cache,
  });

  vi.spyOn(client, "refetchQueries").mockResolvedValue([]);

  return client;
}

function createWrapper(client: ApolloClient<any>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ApolloProvider client={client}>{children}</ApolloProvider>;
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("useRefetchOnAuthChange", () => {
  let client: ApolloClient<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockApolloClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should refetch active queries after clearStore", async () => {
    renderHook(() => useRefetchOnAuthChange(), {
      wrapper: createWrapper(client),
    });

    // Trigger a cache clear (simulates login/logout)
    await client.clearStore();

    expect(client.refetchQueries).toHaveBeenCalledWith({
      include: "active",
    });
  });

  it("should not refetch before clearStore is called", () => {
    renderHook(() => useRefetchOnAuthChange(), {
      wrapper: createWrapper(client),
    });

    expect(client.refetchQueries).not.toHaveBeenCalled();
  });

  it("should unsubscribe on unmount", async () => {
    const { unmount } = renderHook(() => useRefetchOnAuthChange(), {
      wrapper: createWrapper(client),
    });

    unmount();

    // Clear store after unmount — callback should not fire
    await client.clearStore();

    expect(client.refetchQueries).not.toHaveBeenCalled();
  });
});

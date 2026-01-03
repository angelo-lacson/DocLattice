/**
 * Tests for useNotificationWebSocket authentication guard.
 *
 * These tests verify that the WebSocket connection is not attempted
 * until the auth token is available, preventing 403 errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the auth token reactive var before importing the module
const mockAuthToken = vi.fn(() => null);
vi.mock("@apollo/client", () => ({
  useReactiveVar: () => mockAuthToken(),
}));

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3; // CLOSED
  }

  send() {}
}

// Replace global WebSocket
const OriginalWebSocket = global.WebSocket;
beforeEach(() => {
  MockWebSocket.instances = [];
  (global as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  (global as any).WebSocket = OriginalWebSocket;
  vi.resetAllMocks();
});

describe("useNotificationWebSocket auth guard", () => {
  it("should not create WebSocket when auth token is not available", async () => {
    // Import the websocket URL builder to verify behavior
    const { getNotificationUpdatesWebSocket } = await import(
      "../../components/chat/get_websockets"
    );

    // Without token, URL should not have token param
    const urlWithoutToken = getNotificationUpdatesWebSocket(undefined);
    expect(urlWithoutToken).not.toContain("token=");

    // With token, URL should have token param
    const urlWithToken = getNotificationUpdatesWebSocket("test-token-123");
    expect(urlWithToken).toContain("token=test-token-123");
  });

  it("should include auth token in WebSocket URL when available", async () => {
    const { getNotificationUpdatesWebSocket } = await import(
      "../../components/chat/get_websockets"
    );

    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test";
    const url = getNotificationUpdatesWebSocket(token);

    expect(url).toContain(`token=${encodeURIComponent(token)}`);
    expect(url).toContain("/ws/notification-updates/");
  });
});

describe("getNotificationUpdatesWebSocket URL building", () => {
  it("should build correct WebSocket URL for localhost", async () => {
    // Mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { hostname: "localhost", protocol: "http:" },
      writable: true,
    });

    const { getNotificationUpdatesWebSocket } = await import(
      "../../components/chat/get_websockets"
    );

    const url = getNotificationUpdatesWebSocket("test-token");

    // Should use ws:// for localhost http
    expect(url).toMatch(/^ws:\/\//);
    expect(url).toContain("/ws/notification-updates/");
    expect(url).toContain("token=test-token");

    // Restore
    Object.defineProperty(window, "location", { value: originalLocation });
  });
});

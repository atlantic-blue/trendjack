import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App.tsx";
import type { DigestJson } from "./digest.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NOW = 1_754_000_000_000;

function digest(overrides: Partial<DigestJson> = {}): DigestJson {
  return {
    version: 1,
    generatedAt: NOW,
    windowHours: 72,
    provenWindowHours: 720,
    postsConsidered: 83,
    creatorsSeen: 12,
    candidates: [],
    proven: [],
    heldBack: { count: 0, reasons: [] },
    unscored: { count: 0, reasons: [] },
    ...overrides,
  };
}

function serve(json: DigestJson) {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(json), { status: 200 }));
}

describe("the page", () => {
  test("says the date is when the digest was made, not when the videos were posted", async () => {
    serve(digest());
    render(<App />);
    await waitFor(() => expect(screen.getByText("Digest for")).toBeTruthy());
  });

  test("says the videos were posted in the window, not today", async () => {
    serve(digest());
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/videos posted in the last 72 hours/)).toBeTruthy(),
    );
  });

  test("each list states its own window, because they are different claims", async () => {
    serve(digest());
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Posted in the last 72 hours\./)).toBeTruthy());
    expect(screen.getByText(/Posted in the last 30 days\./)).toBeTruthy();
  });

  test("the windows come from the file, so the page cannot claim one it invented", async () => {
    serve(digest({ windowHours: 48, provenWindowHours: 24 * 14 }));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Posted in the last 48 hours\./)).toBeTruthy());
    expect(screen.getByText(/Posted in the last 14 days\./)).toBeTruthy();
  });

  test("a digest in a format it cannot read is refused rather than drawn", async () => {
    serve(digest({ version: 99 }));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No digest today/)).toBeTruthy());
  });
});

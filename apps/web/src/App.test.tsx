import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App.tsx";
import type { DigestJson } from "./digest.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // The picker writes the chosen range into the address, and jsdom keeps that between cases.
  window.history.replaceState(null, "", "/");
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
    await waitFor(() => expect(screen.getByText(/No digest for this range/)).toBeTruthy());
  });
});

describe("the range picker", () => {
  test("offers a day up to a month, and nothing longer", async () => {
    serve(digest());
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "3 days" })).toBeTruthy());
    for (const label of ["24 hours", "7 days", "30 days"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  test("reads three days by default", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(digest()), { status: 200 });
    });
    render(<App />);
    await waitFor(() => expect(asked).toContain("digest-72h.json"));
  });

  test("choosing a range reads that range's file", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(digest()), { status: 200 });
    });
    render(<App />);
    await waitFor(() => expect(asked.length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(asked).toContain("digest-30d.json"));
  });

  test("the chosen range says so, so it is obvious which is on", async () => {
    serve(digest());
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "3 days" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "3 days" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "24 hours" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  test("the picker stays on screen when a range has no digest, so another can be chosen", async () => {
    vi.stubGlobal("fetch", async () => new Response("gone", { status: 404 }));
    render(<App />);
    await waitFor(() => expect(screen.getByText(/No digest for this range/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "7 days" })).toBeTruthy();
  });
});

test("the chosen range is in the address, so a view can be sent to somebody", async () => {
  serve(digest());
  render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: "7 days" })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "7 days" }));
  await waitFor(() => expect(window.location.search).toContain("range=7d"));
});

test("a range in the address is the one that opens", async () => {
  window.history.replaceState(null, "", "/?range=30d");
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    return new Response(JSON.stringify(digest()), { status: 200 });
  });
  render(<App />);
  await waitFor(() => expect(asked).toContain("digest-30d.json"));
});

test("a range in the address that we do not offer falls back rather than asking for a missing file", async () => {
  window.history.replaceState(null, "", "/?range=all-time");
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    return new Response(JSON.stringify(digest()), { status: 200 });
  });
  render(<App />);
  await waitFor(() => expect(asked).toContain("digest-72h.json"));
});

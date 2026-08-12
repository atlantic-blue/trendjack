import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VideoCard, compact } from "./VideoCard.tsx";

// Each case renders its own card. Without this they pile up in one document and every
// query finds several.
afterEach(cleanup);

const video = {
  postId: "7412345678901234567",
  url: "https://www.tiktok.com/@somecreator/video/7412345678901234567",
  creator: "somecreator",
  caption: "Which one is cake?",
  thumbnail: "https://example.invalid/poster.jpg",
};

describe("a video card", () => {
  test("shows the poster before anybody asks to watch", () => {
    render(<VideoCard {...video} />);
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("img")).not.toBeNull();
  });

  test("plays in place when the poster is pressed", () => {
    render(<VideoCard {...video} />);
    fireEvent.click(screen.getByRole("button", { name: /Which one is cake/ }));
    const player = document.querySelector("iframe");
    expect(player).not.toBeNull();
    expect(player?.getAttribute("src")).toBe("https://www.tiktok.com/embed/v2/7412345678901234567");
  });

  test("the poster goes away once the player is there, so nothing sits on top of the video", () => {
    render(<VideoCard {...video} />);
    fireEvent.click(screen.getByRole("button", { name: /Which one is cake/ }));
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("button.play")).toBeNull();
  });

  test("the play control is named after the video, not called play", () => {
    render(<VideoCard {...video} creator="someone" caption="" />);
    expect(screen.getByRole("button", { name: "Play the video by someone" })).not.toBeNull();
  });

  test("a video with no poster can still be played", () => {
    render(<VideoCard {...video} thumbnail={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Which one is cake/ }));
    expect(document.querySelector("iframe")).not.toBeNull();
  });

  test("the multiple and the band sit on the video, because they are why it is here", () => {
    render(<VideoCard {...video} multiple={8.42} band="strong" ageHours={6.4} />);
    expect(screen.getByText("8.4x")).not.toBeNull();
    expect(screen.getByText("strong")).not.toBeNull();
    expect(screen.getByText("6h old")).not.toBeNull();
  });

  test("a proven video shows its likes instead of a multiple", () => {
    render(<VideoCard {...video} likes={2_400_000} />);
    expect(screen.getByText("2.4M likes")).not.toBeNull();
    expect(document.querySelector(".multiple")).toBeNull();
  });

  test("both links go out to TikTok in a new tab", () => {
    render(<VideoCard {...video} />);
    const out = screen.getByRole("link", { name: /Open on TikTok/ });
    expect(out.getAttribute("href")).toBe(video.url);
    expect(out.getAttribute("rel")).toContain("noreferrer");
  });
});

describe("large counts", () => {
  test("read as people say them", () => {
    expect(compact(2_400_000)).toBe("2.4M");
    expect(compact(12_500_000)).toBe("13M");
    expect(compact(875_500)).toBe("876k");
    expect(compact(940)).toBe("940");
  });
});

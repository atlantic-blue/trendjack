import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TagList } from "./TagList.tsx";
import type { DigestTag } from "./digest.ts";

afterEach(cleanup);

function tag(over: Partial<DigestTag> = {}): DigestTag {
  return {
    hashtag: "storytime",
    videoCount: 60_457_250,
    viewCount: 1_238_133_174_079,
    observedAt: 1_754_000_000_000,
    ...over,
  };
}

describe("the topics", () => {
  test("a topic read once says so, rather than showing a rate of nothing", () => {
    render(<TagList tags={[tag()]} />);
    expect(screen.getByText("first reading")).toBeTruthy();
    expect(screen.queryByText(/0\.00% a day/)).toBeNull();
  });

  test("the change that was read leads, and the rate is marked as a projection", () => {
    render(
      <TagList
        tags={[tag({ addedVideos: 605, dailyRate: 0.003, videosPerDay: 605, overHours: 24 })]}
      />,
    );
    expect(screen.getByText("+605 in 1.0 days")).toBeTruthy();
    expect(screen.getByText(/0\.30% a day if it holds/)).toBeTruthy();
  });

  test("a small change over half an hour is said as that, never as a daily figure", () => {
    render(
      <TagList
        tags={[tag({ addedVideos: 1, dailyRate: 0.0094, videosPerDay: 46, overHours: 0.52 })]}
      />,
    );
    expect(screen.getByText("+1 in 31 minutes")).toBeTruthy();
    expect(screen.queryByText(/\+46 a day/)).toBeNull();
  });

  test("a count that fell is shown falling, never as growth", () => {
    render(
      <TagList
        tags={[tag({ addedVideos: -46, dailyRate: -0.0003, videosPerDay: -607, overHours: 24 })]}
      />,
    );
    expect(screen.getByText("-46 in 1.0 days")).toBeTruthy();
  });

  test("nothing read yet says so rather than drawing an empty list", () => {
    render(<TagList tags={[]} />);
    expect(screen.getByText("No hashtag has been read yet.")).toBeTruthy();
  });

  test("every topic given is drawn, in the order it arrived", () => {
    render(<TagList tags={[tag({ hashtag: "saas" }), tag({ hashtag: "founder" })]} />);
    const names = screen.getAllByText(/^#/).map((each) => each.textContent);
    expect(names).toEqual(["#saas", "#founder"]);
  });
});

describe("the videos under a topic", () => {
  const video = {
    videoId: "7673301891551448341",
    url: "https://www.tiktok.com/@millee.md/video/7673301891551448341",
    handle: "millee.md",
    caption: "how I built it in a weekend",
    views: 78_500,
    likes: 4_000,
    ageHours: 16.9,
    viewsPerHour: 4_659,
  };

  test("each video links out and says what it did", () => {
    render(<TagList tags={[tag({ videos: [video] })]} />);
    const link = screen.getByRole("link", { name: "how I built it in a weekend" });
    expect(link.getAttribute("href")).toBe(video.url);
    expect(screen.getByText(/4,659 views an hour, 78,500 in 16.9 hours, @millee.md/)).toBeTruthy();
  });

  test("a video with no caption is shown by its creator instead of as a blank link", () => {
    render(<TagList tags={[tag({ videos: [{ ...video, caption: "   " }] })]} />);
    expect(screen.getByRole("link", { name: "@millee.md" })).toBeTruthy();
  });

  test("a topic whose page has not been read shows no video list at all", () => {
    render(<TagList tags={[tag()]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

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

  test("a growing topic shows its rate and how many videos it gained", () => {
    render(<TagList tags={[tag({ dailyRate: 0.003, videosPerDay: 605, overHours: 24 })]} />);
    expect(screen.getByText("0.30% a day")).toBeTruthy();
    expect(screen.getByText(/\+605 a day/)).toBeTruthy();
  });

  test("a topic that lost videos is shown falling, never as growth", () => {
    render(<TagList tags={[tag({ dailyRate: -0.0003, videosPerDay: -607, overHours: 24 })]} />);
    expect(screen.getByText("-0.03% a day")).toBeTruthy();
    expect(screen.getByText(/-607 a day/)).toBeTruthy();
  });

  test("the window the rate was measured over is always said, so an hour is not read as a day", () => {
    render(<TagList tags={[tag({ dailyRate: 0.003, videosPerDay: 605, overHours: 0.2 })]} />);
    expect(screen.getByText(/measured over 12 minutes/)).toBeTruthy();
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

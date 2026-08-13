import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { browserArgs, countsIn, sizesIn, videosIn } from "./tiktok-tag.ts";

/** Captured from a real answer for #storytime on 2026-08-13, trimmed to what is read. */
const REAL = {
  challengeInfo: {
    challenge: { title: "storytime" },
    stats: { videoCount: 0, viewCount: 1_238_100_000_000 },
    statsV2: { videoCount: "60455583", viewCount: "1238133174079" },
  },
};

test("the real answer gives the exact counts", () => {
  assert.deepEqual(sizesIn(REAL), { videoCount: 60_455_583, viewCount: 1_238_133_174_079 });
});

test("the newer field wins, because the older one reports no videos for a topic with sixty million", () => {
  assert.equal(sizesIn(REAL)?.videoCount, 60_455_583);
});

test("the older field is used when the newer one is absent", () => {
  const body = { challengeInfo: { stats: { videoCount: 12, viewCount: 34 } } };
  assert.deepEqual(sizesIn(body), { videoCount: 12, viewCount: 34 });
});

test("a body with no size is unknown, never nought", () => {
  assert.equal(sizesIn({ challengeInfo: { challenge: { title: "storytime" } } }), undefined);
  assert.equal(sizesIn({}), undefined);
  assert.equal(sizesIn(undefined), undefined);
});

test("a size that is not a number is unknown", () => {
  const body = { challengeInfo: { statsV2: { videoCount: "many", viewCount: "1" } } };
  assert.equal(sizesIn(body), undefined);
});

test("a count is never read as negative", () => {
  const body = { challengeInfo: { statsV2: { videoCount: "-5", viewCount: "1" } } };
  assert.equal(sizesIn(body), undefined);
});

test("a view count past two to the thirty second is carried whole", () => {
  const body = { challengeInfo: { statsV2: { videoCount: "1", viewCount: "1238133174079" } } };
  assert.equal(sizesIn(body)?.viewCount, 1_238_133_174_079);
});

const PAGE = fs.readFileSync(new URL("./fixtures/hashtag-page.html", import.meta.url), "utf8");
const REFUSED = fs.readFileSync(
  new URL("./fixtures/hashtag-page-refused.html", import.meta.url),
  "utf8",
);

test("every card on a real rendered page is read, with its handle, caption and time", () => {
  const videos = videosIn(PAGE, "grwm");
  assert.equal(videos.length, 3);
  assert.equal(videos.filter((each) => each.caption.length > 0).length, 3);
  assert.equal(videos.filter((each) => each.postedAt !== undefined).length, 3);
  assert.equal(videos[0]?.handle, "dominic_mua");
  assert.equal(videos[0]?.url, "https://www.tiktok.com/@dominic_mua/video/6994445920200854789");
  assert.match(videos[0]?.caption ?? "", /how I groom my tash/);
});

test("a page that drew no cards gives nothing, so the caller can call it a refusal", () => {
  assert.deepEqual(videosIn(REFUSED, "grwm"), []);
});

test("the counts on a video page are read from the newer field", () => {
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
    {
      __DEFAULT_SCOPE__: {
        "webapp.video-detail": {
          itemInfo: {
            itemStruct: {
              statsV2: { playCount: "49100", diggCount: "1316", commentCount: "212" },
            },
          },
        },
      },
    },
  )}</script>`;
  assert.deepEqual(countsIn(html), { views: 49_100, likes: 1_316, comments: 212 });
});

test("a page with no data gives no counts, never zeroes", () => {
  assert.equal(countsIn("<html><body>nothing here</body></html>"), undefined);
  assert.equal(countsIn(REFUSED), undefined);
});

test("a page whose data is not valid JSON gives no counts rather than throwing", () => {
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{ broken</script>`;
  assert.equal(countsIn(html), undefined);
});

test("outside this runtime the browser is started plainly", () => {
  assert.deepEqual(browserArgs(false), ["--no-sandbox", "--disable-gpu"]);
});

test("in this runtime it is told there is no shared memory", () => {
  const args = browserArgs(true);
  assert.ok(args.includes("--disable-dev-shm-usage"));
});

test("it is never told to run as one process, which closes its own target before a page opens", () => {
  assert.equal(browserArgs(true).includes("--single-process"), false);
});

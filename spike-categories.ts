/**
 * Read only spike. What category information does a TikTok video page carry, and is it usable as
 * a niche or a format label.
 *
 * Reads a list of video paths from a file, fetches each page anonymously, and reports every
 * field on the item that looks like a category.
 */
import fs from "node:fs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

interface Categorised {
  path: string;
  labels: string[];
  categoryType: unknown;
  channelTags: unknown;
  suggestedWords: unknown;
  challenges: string[];
  language: unknown;
  location: unknown;
  isAigc: unknown;
}

async function pageItem(path: string): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(`https://www.tiktok.com${path}`, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) return undefined;
  const html = await response.text();
  const match = html.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) return undefined;
  const scope = JSON.parse(match[1])["__DEFAULT_SCOPE__"] as Record<string, any>;
  return scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
}

function categorise(path: string, item: Record<string, any>): Categorised {
  return {
    path,
    labels: (item["diversificationLabels"] as string[] | undefined) ?? [],
    categoryType: item["CategoryType"],
    channelTags: item["channelTags"],
    suggestedWords: item["suggestedWords"],
    challenges: ((item["challenges"] as { title: string }[] | undefined) ?? []).map(
      (each) => each.title,
    ),
    language: item["textLanguage"],
    location: item["locationCreated"],
    isAigc: item["IsAigc"],
  };
}

const paths = fs.readFileSync(process.argv[2] ?? "urls.txt", "utf8").trim().split("\n");
const found: Categorised[] = [];

for (const path of paths) {
  try {
    const item = await pageItem(path);
    if (!item) {
      console.log(`${path}  no item`);
      continue;
    }
    const row = categorise(path, item);
    found.push(row);
    console.log(
      `${row.path}\n  labels: ${JSON.stringify(row.labels)}  categoryType: ${JSON.stringify(row.categoryType)}` +
        `  channelTags: ${JSON.stringify(row.channelTags)}  language: ${JSON.stringify(row.language)}` +
        `  location: ${JSON.stringify(row.location)}\n  hashtags: ${JSON.stringify(row.challenges.slice(0, 8))}` +
        `  suggested: ${JSON.stringify(row.suggestedWords)}`,
    );
  } catch (cause) {
    console.log(`${path}  failed: ${(cause as Error).message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

const vocabulary = new Map<string, number>();
for (const row of found) {
  for (const label of new Set(row.labels)) vocabulary.set(label, (vocabulary.get(label) ?? 0) + 1);
}
console.log(`\nPages read: ${found.length}. Pages with at least one label: ${found.filter((r) => r.labels.length > 0).length}.`);
console.log(`Label vocabulary across the sample, most common first:`);
for (const [label, count] of [...vocabulary.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${label}`);
}

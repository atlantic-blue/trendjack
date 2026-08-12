import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DigestJson } from "@trendjack/core/digest/json.ts";
import { DEFAULT_RANGE, digestKeyFor } from "@trendjack/core/digest/ranges.ts";
import type { DigestPublisher } from "./poll-once.ts";

export const DIGEST_KEY = "digest.json";
export const POSTER_PREFIX = "posters/";

export interface S3PublisherOptions {
  s3: S3Client;
  cloudFront?: CloudFrontClient;
  bucket: string;
  distributionId?: string;
  /** Something unique per run, so two invalidations cannot collide. */
  callerReference: string;
  /** Fetches a poster so it can be kept. Injected, so a test never touches the network. */
  fetchPoster?: (url: string) => Promise<ArrayBuffer | undefined>;
}

/**
 * Writes the digests into the bucket the page is served from, keeps a copy of every poster, and
 * clears what changed from the cache.
 *
 * The posters are copied on purpose. TikTok signs its thumbnail links and they expire in about a
 * day, so a digest kept for a month would become a page of broken images. A copy in our own
 * bucket also means the page does not wait on somebody else's servers.
 */
export class S3DigestPublisher implements DigestPublisher {
  readonly #options: S3PublisherOptions;

  constructor(options: S3PublisherOptions) {
    this.#options = options;
  }

  async publish(byRange: Map<string, DigestJson>): Promise<void> {
    const kept: string[] = [];
    for (const [key, digest] of byRange) {
      const withPosters = await this.#keepPosters(digest);
      await this.#write(digestKeyFor(key), JSON.stringify(withPosters));
      kept.push(`/${digestKeyFor(key)}`);
      // The default range is also written under the plain name, so a reader who arrives with no
      // choice made gets a page rather than a missing file.
      if (key === DEFAULT_RANGE) {
        await this.#write(DIGEST_KEY, JSON.stringify(withPosters));
        kept.push(`/${DIGEST_KEY}`);
      }
    }
    await this.#clearCache(kept);
  }

  /**
   * Copies each poster into the bucket once and points the digest at the copy. A poster that
   * cannot be fetched leaves the card without one, which is far better than losing the digest.
   */
  async #keepPosters(digest: DigestJson): Promise<DigestJson> {
    const rewritten = new Map<string, string>();
    for (const row of [...digest.candidates, ...digest.proven]) {
      if (!row.thumbnail || rewritten.has(row.postId)) continue;
      const key = `${POSTER_PREFIX}${row.postId}.jpg`;
      if (await this.#alreadyKept(key)) {
        rewritten.set(row.postId, key);
        continue;
      }
      const body = await this.#options.fetchPoster?.(row.thumbnail);
      if (!body) continue;
      await this.#write(key, new Uint8Array(body), "image/jpeg");
      rewritten.set(row.postId, key);
    }

    const point = <T extends { postId: string; thumbnail?: string }>(row: T): T => {
      const kept = rewritten.get(row.postId);
      return kept ? { ...row, thumbnail: kept } : row;
    };
    return {
      ...digest,
      candidates: digest.candidates.map(point),
      proven: digest.proven.map(point),
    };
  }

  async #alreadyKept(key: string): Promise<boolean> {
    try {
      await this.#options.s3.send(
        new HeadObjectCommand({ Bucket: this.#options.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async #write(key: string, body: string | Uint8Array, contentType = "application/json") {
    await this.#options.s3.send(
      new PutObjectCommand({
        Bucket: this.#options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // A day, because the data changes once a day. A poster never changes, so it is kept for
        // a year and never cleared.
        CacheControl:
          contentType === "image/jpeg" ? "public, max-age=31536000" : "public, max-age=86400",
      }),
    );
  }

  /** Only the files that change are cleared. A poster is written once and never rewritten. */
  async #clearCache(paths: string[]): Promise<void> {
    const { cloudFront, distributionId } = this.#options;
    if (!cloudFront || !distributionId || paths.length === 0) return;
    await cloudFront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: this.#options.callerReference,
          Paths: { Quantity: paths.length, Items: paths },
        },
      }),
    );
  }
}

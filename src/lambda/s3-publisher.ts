import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DigestJson } from "../digest/json.ts";
import type { DigestPublisher } from "./poll-once.ts";

export const DIGEST_KEY = "digest.json";

export interface S3PublisherOptions {
  s3: S3Client;
  cloudFront?: CloudFrontClient;
  bucket: string;
  distributionId?: string;
  /** Something unique per run, used so two invalidations cannot collide. */
  callerReference: string;
}

/**
 * Writes the digest into the bucket the front end is served from, then clears that one file
 * from the cache.
 *
 * The cache is set to a day because the data changes once a day. Without the clear, a reader
 * could see yesterday's digest for a further whole day after the run.
 */
export class S3DigestPublisher implements DigestPublisher {
  readonly #options: S3PublisherOptions;

  constructor(options: S3PublisherOptions) {
    this.#options = options;
  }

  async publish(json: DigestJson): Promise<void> {
    await this.#options.s3.send(
      new PutObjectCommand({
        Bucket: this.#options.bucket,
        Key: DIGEST_KEY,
        Body: JSON.stringify(json),
        ContentType: "application/json",
        CacheControl: "public, max-age=86400",
      }),
    );

    const { cloudFront, distributionId } = this.#options;
    if (!cloudFront || !distributionId) return;
    await cloudFront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: this.#options.callerReference,
          Paths: { Quantity: 1, Items: [`/${DIGEST_KEY}`] },
        },
      }),
    );
  }
}

# The poll runs yt-dlp, so the function ships as a container image rather than a zip.
#
# Build it from the repository root, because this workspace depends on another one:
#   docker build -f apps/poller/Dockerfile .
#
# yt-dlp arrives as its standalone Linux build, which carries its own Python. That keeps the
# image small and, more useful, it makes the version explicit: a bump is a line in a diff rather
# than whatever the package index served that day.
#
# Bump it often. yt-dlp breaks whenever TikTok changes, and an old copy stops returning anything
# rather than failing loudly.
FROM public.ecr.aws/lambda/nodejs:24

ARG YT_DLP_VERSION=2026.07.04
# Set by the builder. A build on an Apple Silicon machine and a build on a continuous
# integration runner target different architectures, and the wrong binary fails at run time with
# an exec error rather than at build time with anything readable.
ARG TARGETARCH

RUN case "${TARGETARCH}" in \
      arm64) asset=yt-dlp_linux_aarch64 ;; \
      amd64) asset=yt-dlp_linux ;; \
      *) echo "no yt-dlp build for ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -sSfL -o /usr/local/bin/yt-dlp \
      "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${asset}" \
    && chmod +x /usr/local/bin/yt-dlp \
    && yt-dlp --version

# ffmpeg is not needed: the poll reads metadata and never downloads a video.

COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
COPY packages/core/package.json ${LAMBDA_TASK_ROOT}/packages/core/
COPY apps/poller/package.json ${LAMBDA_TASK_ROOT}/apps/poller/
COPY apps/cli/package.json ${LAMBDA_TASK_ROOT}/apps/cli/
RUN npm ci --omit=dev

COPY packages/core/src ${LAMBDA_TASK_ROOT}/packages/core/src
COPY apps/poller/src ${LAMBDA_TASK_ROOT}/apps/poller/src

# Type stripping runs the TypeScript directly, so there is no build step and nothing that can
# fall out of step with the source.
ENV NODE_OPTIONS="--experimental-strip-types --disable-warning=ExperimentalWarning"

# index.mjs, not handler.ts: the runtime looks for JavaScript by extension.
CMD ["apps/poller/src/index.handler"]

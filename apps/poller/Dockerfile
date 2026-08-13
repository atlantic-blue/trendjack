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
# Chrome for Testing publishes a headless shell per version, which is the whole browser without a
# window. The size of a hashtag and the videos on its page are both drawn by script, so neither can
# be read without one.
ARG CHROME_VERSION=152.0.7977.42
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

# The headless shell, which is the browser without a window.
#
# It reads how big a hashtag is, because that number is only ever sent to a browser and never
# reaches the page. It cannot read the videos on a page: a rendered hashtag page comes back as a
# captcha from here, where the same request from a desktop browser comes back as thirty cards.
#
# Published for x86 only, and the function runs on x86, so a build on an Apple Silicon machine
# stops here rather than shipping an image whose browser cannot start.
RUN if [ "${TARGETARCH}" != "amd64" ]; then \
      echo "chrome-headless-shell is published for amd64 only; build with --platform linux/amd64" >&2; \
      exit 1; \
    fi \
    && dnf install -y --setopt=install_weak_deps=0 \
      unzip nss nspr atk at-spi2-atk at-spi2-core cups-libs libdrm libxkbcommon \
      libXcomposite libXdamage libXext libXfixes libXrandr libgbm alsa-lib pango cairo \
      libxshmfence libX11 libxcb libXi libXtst gtk3 liberation-fonts \
    && dnf clean all \
    && rm -rf /var/cache/dnf

RUN curl -sSfL -o /tmp/chrome.zip \
      "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" \
    && mkdir -p /opt/chrome \
    && unzip -q /tmp/chrome.zip -d /opt/chrome \
    && rm /tmp/chrome.zip \
    && ln -s /opt/chrome/chrome-headless-shell-linux64/chrome-headless-shell /usr/local/bin/chrome \
    && chrome --version

# Everything outside /tmp is read only in this runtime, and a browser writes before it will talk.
ENV TRENDJACK_CHROME=/usr/local/bin/chrome
ENV HOME=/tmp
ENV XDG_CONFIG_HOME=/tmp
ENV XDG_CACHE_HOME=/tmp

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

# The poll runs yt-dlp, which is a Python program, so the function ships as a container image
# rather than a zip. The image is rebuilt on every deploy, which is also how yt-dlp stays
# current: it breaks whenever TikTok changes, and an old copy stops returning anything.
FROM public.ecr.aws/lambda/nodejs:24

RUN dnf install -y python3 python3-pip tar xz && dnf clean all
RUN pip3 install --no-cache-dir yt-dlp && yt-dlp --version

# ffmpeg is not needed: the poll reads metadata and never downloads a video.

COPY package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm ci --omit=dev

COPY src ${LAMBDA_TASK_ROOT}/src

# Type stripping runs the TypeScript directly, so there is no build step and nothing to keep in
# step with the source.
ENV NODE_OPTIONS="--experimental-strip-types --disable-warning=ExperimentalWarning"

CMD ["src/lambda/handler.handler"]

# Architecture

## What the system is

Trendjack is one monorepo on npm workspaces. It holds a domain package and three applications.
There is no build step. Node strips the types and runs the source directly, in a terminal and
inside the container alike.

## Why it is shaped this way

The domain must not know where its data came from, or where its output goes. Vendors in this
market appear and disappear. A tool that works today reports broken next month. So every outside
system sits behind a port, and nothing above the port learns which tool answered.

## How it is achieved

One package holds the domain. Each application wires the domain to real adapters.

```mermaid
flowchart TD
    subgraph core["packages/core, the domain"]
        CT["contracts<br/><i>ports and types</i>"]
        RK["ranking<br/><i>the heuristic, pure functions</i>"]
        ST["store<br/><i>the append only history</i>"]
        SR["sources<br/><i>one adapter per data source</i>"]
        PN["panel<br/><i>who we watch</i>"]
        PL["poll<br/><i>one round of the panel</i>"]
        TR["trends<br/><i>hashtag sizes, growth,<br/>page videos, new hashtags</i>"]
        DG["digest<br/><i>what a person reads</i>"]
        DS["discover<br/><i>is a creator worth watching</i>"]
    end

    subgraph apps["apps"]
        PO["poller<br/><i>two entry points, one image</i>"]
        CL["cli<br/><i>the trendjack command</i>"]
        WB["web<br/><i>the page</i>"]
    end

    PO --> PL
    PO --> TR
    PO --> DG
    CL --> PL
    CL --> TR
    CL --> DS
    PL --> SR
    PL --> ST
    TR --> SR
    TR --> ST
    DG --> RK
    DG --> TR
    DG --> ST
    RK --> CT
    SR --> CT
    ST --> CT
    WB -->|"reads a static file"| JSON["digest-72h.json"]
    PO -->|"writes"| JSON
```

## The ports

A port is an interface the domain owns. An adapter implements it. There are two ports.

**`TrendSource`.** Somewhere posts can be fetched from. The port deliberately cannot ask what is
trending, because no such question can be answered by naming a creator. It can only fetch what a
named creator posted.

**`TagStatsSource` and `TagVideoSource`.** The two questions a hashtag will answer: how big it is,
and which videos it is showing. These need a browser rather than a request, and for opposite
reasons. See [topics.md](topics.md).

```mermaid
classDiagram
    class TrendSource {
        <<interface>>
        +platform: Platform
        +recentPostsByCreator(handle, limit) Sighting[]
    }
    class YtDlpTikTokSource {
        +recentPostsByCreator(handle, limit) Sighting[]
    }
    class Store {
        <<interface>>
        +appendObservation(observation)
        +putPost(post)
        +observationsFor(postId) Observation[]
        +settledPostsFor(creatorId, before, limit) Post[]
        +postsSince(since) Post[]
        +putBaseline(baseline)
        +putScore(score)
        +scoresSince(since) Score[]
    }
    class DynamoStore
    class MemoryStore

    TrendSource <|.. YtDlpTikTokSource
    Store <|.. DynamoStore
    Store <|.. MemoryStore
```

Today one adapter exists. `YtDlpTikTokSource` runs yt-dlp with `--flat-playlist --dump-json`
against a creator's profile page. That command returns view, like, comment and repost counts and
the posted time, in one request per creator.

Instagram has no adapter yet. The port is ready for one.

**`Store`.** The append only history. An observation is never updated in place. See
[data-model.md](data-model.md).

## The path a video takes

```mermaid
sequenceDiagram
    autonumber
    participant EB as EventBridge
    participant L as Poller Lambda
    participant Y as yt-dlp
    participant TT as TikTok
    participant DB as DynamoDB
    participant OE as TikTok oEmbed
    participant S3 as Site bucket
    participant CF as CloudFront
    participant R as Reader

    EB->>L: invoke, once a day at 06:00
    L->>L: read the panel from its settings
    loop each creator, with a 2 second pause
        L->>Y: run against the profile page
        Y->>TT: fetch the profile
        TT-->>Y: up to 80 posts with counts
        Y-->>L: one JSON record per post
        L->>DB: put the post
        L->>DB: append the observation
    end
    loop each of the 4 time ranges
        L->>DB: read posts in the window
        L->>DB: read each post's observations
        L->>DB: read each creator's settled posts
        L->>L: score, rank, split into two lists
        L->>OE: ask how each shown video looks
        OE-->>L: poster and caption
    end
    L->>S3: write digest-24h, 72h, 7d and 30d
    L->>CF: clear those paths from the cache
    R->>CF: open the page
    CF->>S3: fetch the static files
    CF-->>R: the page, then the digest file
```

## Why the page has no API

The page is static React in the same bucket as the digest files. It reads the digest from its own
address. There is no server, no gateway and no authorizer to run.

The data changes once a day. A cache that lasts a day is correct. An API would add cost, failure
modes and latency, and would answer the same question with the same file.

## Why one digest file per time range

A reader can choose how far back to look. There are four ranges: 24 hours, 3 days, 7 days and
30 days. The default is 3 days.

Each range is built and published as its own file. The page does not filter one wide file.

The reason is that the window is not only a filter. Two of the features are counted inside the
window. How many other watched creators are on the same shape depends on the window. How crowded
a sound is depends on the window. Filtering a 30 day file down to one day would keep numbers that
answer a different question.

```mermaid
flowchart LR
    W["one poll of the panel"] --> B24["build for 24 hours"] --> F24["digest-24h.json"]
    W --> B72["build for 72 hours"] --> F72["digest-72h.json"]
    W --> B7["build for 7 days"] --> F7["digest-7d.json"]
    W --> B30["build for 30 days"] --> F30["digest-30d.json"]
```

## The deployed footprint

```mermaid
flowchart TD
    subgraph aws["Amazon Web Services, account 230345688874, eu-west-1"]
        EB["EventBridge<br/>cron 0 6 every day"]
        EB2["EventBridge<br/>cron 20, every 6 hours"]
        LAM["trendjack-poller<br/>2048 MB, writes the digest"]
        TRD["trendjack-trends<br/>3008 MB, reads hashtag sizes"]
        ECR["Elastic Container Registry<br/>one image, two entry points"]
        DDB["DynamoDB, one table"]
        S3["Private bucket<br/>page and digests"]
        CFD["CloudFront distribution"]
        LOG["CloudWatch log groups"]
    end
    LAP["A laptop<br/><i>trendjack videos</i>"]
    GH["GitHub Actions<br/>deploy on merge to main"]

    EB --> LAM
    EB2 --> TRD
    ECR --> LAM
    ECR --> TRD
    LAM --> DDB
    TRD --> DDB
    LAP --> DDB
    LAM --> S3
    LAM --> CFD
    LAM --> LOG
    TRD --> LOG
    CFD --> S3
    GH -->|"OpenID Connect,<br/>role trendjack-deploy"| ECR
    GH --> S3
    GH --> CFD

    style LAP fill:#fdf3e3,stroke:#b3862a
```

One table, one bucket, one distribution, one registry, two functions from one image.

The laptop is the part that should not be there. Ranking the videos on a hashtag page needs the
page to draw itself, and a rendered page from that image comes back as a captcha, so that one job
still runs from a desktop browser. See [operations.md](operations.md).

## The command line application

`apps/cli` runs the same domain code from a terminal. It exists for four jobs.

- `trendjack tags <hashtag...>` records how big each hashtag is and says what changed.
- `trendjack videos <hashtag>` ranks the videos on one page and stores the result.

- `trendjack run` polls the creator panel once by hand, to see what it returns today.
- `trendjack qualify` checks a creator before we add them to the panel. It rejects a creator with
  too few posts, with no view counts, with a flat history, with a ceiling below the like floor,
  or with no post in the last 30 days. Each rejection carries the reason.

## The rules the code holds itself to

- Unknown is never zero. A count the tool did not report is left out of the observation. A
  deleted post produces no observation at all.
- An empty answer fails loudly. A source that returns nothing raises `EmptySourceResultError`,
  because a quiet creator and a broken tool look the same otherwise.
- One creator failing does not abandon the round. Every failure is carried back in the report. A
  round where every creator failed raises `PollFailedError`.
- The publish happens after the poll, never instead of it. If the poll fails, yesterday's file
  stays in place. A file of nothing would look like a quiet day.
- Identifiers are tagged types. A creator id cannot be passed where a post id belongs. The tag
  exists only in the type system and costs nothing at run time.

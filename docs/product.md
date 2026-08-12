# The product

## What Trendjack is

Trendjack finds a short form video while it is still rising. It works out which of our products
the video fits. It grooms that idea into a ready specification. Then it produces our version of
the video.

The pipeline has four stages. Each stage has its own contract.

```mermaid
flowchart LR
    D["Detect<br/><i>a trend</i>"] --> A["Apply<br/><i>to a product</i>"]
    A --> G["Groom<br/><i>into a spec</i>"]
    G --> C["Create<br/><i>the video</i>"]

    D -.->|"phase 1, built"| S1["digest of candidates"]
    A -.->|"phase 3"| S2["candidate"]
    G -.->|"phase 4"| S3["approved spec"]
    C -.->|"phase 5"| S4["mp4 and caption"]
```

Today only stage one runs. The other three stages are designed and not built.

## Why we need it

We sell software products. Short form video is the cheapest way to reach new users. A video that
copies a rising format reaches many more people than a video that copies a dead one.

The value is in the timing. A format that is three days old is already crowded. A format that is
six hours old is still cheap. So the product must find the rise, not the peak.

## How it is achieved

Trendjack watches a fixed list of creators. It records what every post of theirs does, several
times. It then measures each new video against that creator's own normal. The trend is not
fetched. The trend is arithmetic on a history we own.

## Why detection is the hard part

No platform sells the answer. We verified this against primary sources.

- TikTok's Research API requires an applicant to be non commercial. That excludes us.
- Instagram's Graph API has no discovery surface. Hashtag search caps at 30 unique tags in
  7 days.
- TikTok's Creative Center has no public API.
- No vendor sells a "what is trending now" endpoint at any price.

What any tool will answer is narrower. You name a creator. The tool returns that creator's recent
posts with counts attached.

```mermaid
flowchart TD
    W["What we want:<br/>which video is rising now?"]:::want
    N["No endpoint answers this"]:::gone
    W --> N

    C["What we can ask:<br/>what did this named creator post?"]:::have
    N --> C
    C --> H["Store every answer, for ever"]
    H --> B["Compute each creator's own normal"]
    B --> O["Measure the new video against that normal"]
    O --> R["The rise, inferred"]:::want

    classDef want fill:#e8f0ff,stroke:#3b6ea5
    classDef have fill:#eaf7ec,stroke:#3f8a4d
    classDef gone fill:#fdecec,stroke:#b34a4a
```

## The moat, and why it holds

Anyone can copy the formula. The formula is public in this repository. Three other things
compound, and a competitor who starts later cannot buy them.

```mermaid
flowchart TD
    M["The moat"]
    M --> P["The panel"]
    M --> B["The baseline history"]
    M --> L["The archetype library"]

    P --> P1["The creators we chose to watch"]
    P --> P2["Refined every week against<br/>what actually converted"]
    P --> P3["A competitor watches<br/>the wrong accounts"]

    B --> B1["A creator's own median,<br/>over months"]
    B --> B2["Cannot be backfilled"]
    B --> B3["It is what calls a breakout<br/>at hour six, not hour sixty"]

    L --> L1["Every video we analyse<br/>adds a labelled format"]
    L --> L2["Tied to whether<br/>our version worked"]
    L --> L3["Starts at phase 2"]
```

The panel is deliberately not in this repository. It lives in a repository secret. See
[operations.md](operations.md).

## The four constraints that shape the design

These are platform rules. We design around them. We do not work around them.

**Sound never transfers.** A business account on either platform may only use the commercial
music library. Trending sounds are greyed out. TikTok's commercial library terms also forbid use
of those sounds off TikTok. So we copy structure. We never copy audio.

**Originality is judged at account level.** Instagram demotes reposts and near duplicates. The
penalty lands on the account, not on the post. Borders, watermarks, speed changes and a credit to
the creator do not make a video original. Copying a format is normal practice. Re uploading
footage is not.

**Provider risk is our account risk.** Discovery runs against platform terms of service. Today
the poll is read only and signed in as nobody. The moment we authenticate a call with our own
account, we take on that exposure.

**Artificial intelligence disclosure is unverified.** Each platform has its own labelling rule
for generated creative. Check the rules before the first generated video ships.

## The stages we have not built

### Stage 2, apply to a product

A registry holds one entry per product. The entry says what the product does, who it is for,
which proof assets exist, which claims we may not make, and the voice.

The adapter takes a beat sheet and a product, and returns a candidate. One rule makes it a twist
rather than a copy. Keep the structure. Replace the payload.

```mermaid
flowchart LR
    subgraph Carry["Carries over"]
        T1["Beat timings"]
        T2["Cut rhythm"]
        T3["Hook archetype"]
        T4["Escalation"]
    end
    subgraph Drop["Never carries over"]
        D1["Words"]
        D2["Footage"]
        D3["Claims"]
        D4["Sound"]
    end
    Carry --> Cand["Candidate"]
    Drop -.->|"replaced with ours"| Cand
```

### Stage 3, groom the video

This is the human gate. Julian approves the specification, not the finished video. That is where
the money is committed, and where taste is worth the most.

A candidate is ready when it has the script, the shot list, the on screen text per beat, the
caption, the sound decision, the aspect, the duration, the call to action, a claims check and a
confidence score. A score under about 80 per cent is flagged, not rendered.

### Stage 4, create the video

Three tracks. Most volume should be track A.

- Track A, screen first. Our products are software. A scripted screen capture beats any
  generative model on accuracy, cost and brand.
- Track B, an artificial actor. Only for a hook that needs a person to camera.
- Track C, generated b roll. Verify the vendor's programmatic access before we commit to it.

### Stage 5, publishing

We hold no accounts yet. Until we do, the pipeline ends at a finished file and a caption in a
review queue. A person posts it by hand. That is the correct first version anyway. Posting by
hand is how we learn what the pipeline gets wrong.

## The phases

```mermaid
flowchart TD
    P0["Phase 0<br/>Decide the name,<br/>seed the panel"]:::done
    P1["Phase 1<br/>Detect<br/><b>deployed</b>"]:::done
    P2["Phase 2<br/>Beat sheet"]:::next
    P3["Phase 3<br/>Apply to a product"]
    P4["Phase 4<br/>Groom to a spec"]
    P5["Phase 5<br/>Create, track A"]
    P6["Phase 6<br/>Publish"]:::blocked

    P0 --> P1 --> P2 --> P3 --> P4 --> P5 --> P6

    classDef done fill:#eaf7ec,stroke:#3f8a4d
    classDef next fill:#e8f0ff,stroke:#3b6ea5
    classDef blocked fill:#fdecec,stroke:#b34a4a
```

Phases 1 to 5 need no social accounts and no platform approval. Only phase 6 does. Phase 6 is the
long pole, because a TikTok content posting audit takes 2 to 6 weeks and Instagram needs an
application review.

## The open question the deployment raised

A panel of very large creators fills the "worked at scale" list easily. It rarely fills the
"worth a look" list. Large accounts are consistent, so they seldom beat their own normal by three
times. Medium sized creators produce many more outliers, but few of them pass the like floor.

The panel probably wants both kinds of creator. That is a decision about curation. It is not a
defect in the code.

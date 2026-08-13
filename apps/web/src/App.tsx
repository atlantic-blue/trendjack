import { useEffect, useState } from "react";
import { TagList } from "./TagList.tsx";
import { VideoCard } from "./VideoCard.tsx";
import type { DigestJson } from "./digest.ts";
import {
  movementOf,
  notesFor,
  DIGEST_FORMAT_VERSION,
  RANGES,
  fileFor,
  rangeFromLocation,
} from "./digest.ts";

type Load =
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | { state: "ready"; digest: DigestJson };

export function App() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [range, setRange] = useState(() => rangeFromLocation(window.location.search));

  function choose(key: string) {
    setRange(key);
    setLoad({ state: "loading" });
    const address = new URL(window.location.href);
    address.searchParams.set("range", key);
    window.history.replaceState(null, "", address);
  }

  useEffect(() => {
    fetch(fileFor(range), { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`the digest could not be read (${response.status})`);
        // A missing file does not answer 404 here. The distribution serves this page instead,
        // with a 200, so a digest that was never written arrives as HTML and only the content
        // gives it away.
        const body = await response.text();
        if (!body.trimStart().startsWith("{")) {
          throw new Error("there is no digest for this range yet");
        }
        return JSON.parse(body) as DigestJson;
      })
      .then((digest) => {
        if (digest.version !== DIGEST_FORMAT_VERSION) {
          throw new Error(
            `this page reads digest format ${DIGEST_FORMAT_VERSION} and was given ${digest.version}`,
          );
        }
        setLoad({ state: "ready", digest });
      })
      .catch((error: Error) => setLoad({ state: "failed", reason: error.message }));
  }, [range]);

  const picker = (
    <nav className="ranges" aria-label="How far back to look">
      {RANGES.map((each) => (
        <button
          key={each.key}
          type="button"
          className={each.key === range ? "range range-on" : "range"}
          aria-pressed={each.key === range}
          onClick={() => choose(each.key)}
        >
          {each.label}
        </button>
      ))}
    </nav>
  );

  if (load.state === "loading") {
    return (
      <main className="page">
        {picker}
        <p className="empty">Reading the digest…</p>
      </main>
    );
  }
  if (load.state === "failed") {
    return (
      <main className="page">
        {picker}
        <p className="empty">No digest for this range: {load.reason}</p>
      </main>
    );
  }

  const { digest } = load;
  return (
    <main className="page">
      <header className="masthead">
        <h1 className="wordmark">
          trend<span>jack</span>
        </h1>
        <span style={{ color: "var(--ink-faint)", fontSize: "var(--t-small)" }}>
          {new Date(digest.generatedAt).toLocaleString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </header>

      <p className="stamp">Digest for</p>
      <h2 className="today">
        {new Date(digest.generatedAt).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </h2>

      {picker}

      <p className="summary">
        <strong>{digest.candidates.length}</strong> worth a look, from{" "}
        <strong>{digest.postsConsidered}</strong> videos posted in the last {digest.windowHours}{" "}
        hours by <strong>{digest.creatorsSeen}</strong> creators.
      </p>

      <section>
        <div className="section-head">
          <h2>Topics growing fastest</h2>
          <p>
            How many videos each hashtag gained, against how many it already had. A small topic
            doubling beats a huge one adding thousands.
          </p>
        </div>
        <TagList tags={digest.tags ?? []} />
      </section>

      <section>
        <div className="section-head">
          <h2>Not watching yet</h2>
          <p>
            Hashtags people wrote in the captions of the pages above. One that turns up under
            several topics is a stronger candidate than a busy one under a single topic.
          </p>
        </div>
        {digest.tagCandidates && digest.tagCandidates.length > 0 ? (
          <ul className="candidates">
            {digest.tagCandidates.map((candidate) => (
              <li key={candidate.hashtag}>
                <span className="candidate-name">#{candidate.hashtag}</span>
                <span className="candidate-figures">
                  under {candidate.topics.join(", ")}, in {candidate.videos} video
                  {candidate.videos === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No page has been read for its captions yet.</p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Worth a look</h2>
          <p>
            Posted in the last {digest.windowHours} hours. Beating their own creator's normal, and
            still growing.
          </p>
        </div>
        {digest.candidates.length === 0 ? (
          <p className="empty">Nothing cleared the bar today.</p>
        ) : (
          <div className="grid">
            {digest.candidates.map((candidate) => (
              <VideoCard
                key={candidate.postId}
                postId={candidate.postId}
                url={candidate.url}
                creator={candidate.creator}
                caption={candidate.caption}
                thumbnail={candidate.thumbnail}
                multiple={candidate.outlier}
                band={candidate.band}
                ageHours={candidate.ageHours}
                movement={movementOf(candidate)}
                notes={notesFor(candidate)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Worked at scale</h2>
          <p>
            Posted in the last {Math.round(digest.provenWindowHours / 24)} days. Reached a lot of
            people, whatever their creator's normal is.
          </p>
        </div>
        {digest.proven.length === 0 ? (
          <p className="empty">Nothing reached the like floor today.</p>
        ) : (
          <div className="grid">
            {digest.proven.map((proven) => (
              <VideoCard
                key={proven.postId}
                postId={proven.postId}
                url={proven.url}
                creator={proven.creator}
                caption={proven.caption}
                thumbnail={proven.thumbnail}
                likes={proven.likes}
                ageHours={proven.ageHours}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="ledger">
        <span>
          <b>{digest.heldBack.count}</b> held back
          {digest.heldBack.reasons[0] ? `, mostly ${digest.heldBack.reasons[0].reason}` : ""}
        </span>
        <span>
          <b>{digest.unscored.count}</b> could not be scored
          {digest.unscored.reasons[0] ? `, mostly ${digest.unscored.reasons[0].reason}` : ""}
        </span>
      </footer>
    </main>
  );
}

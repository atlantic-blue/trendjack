import { useEffect, useState } from "react";
import { VideoCard } from "./VideoCard.tsx";
import type { DigestJson } from "./digest.ts";
import { movementOf, notesFor, DIGEST_FORMAT_VERSION } from "./digest.ts";

type Load =
  | { state: "loading" }
  | { state: "failed"; reason: string }
  | { state: "ready"; digest: DigestJson };

export function App() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    fetch("digest.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`the digest could not be read (${response.status})`);
        return (await response.json()) as DigestJson;
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
  }, []);

  if (load.state === "loading") return <main className="page">Reading today's digest…</main>;
  if (load.state === "failed") {
    return (
      <main className="page">
        <p className="empty">No digest today: {load.reason}</p>
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

      <h2 className="today">
        {new Date(digest.generatedAt).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </h2>

      <p className="summary">
        <strong>{digest.candidates.length}</strong> worth a look, from{" "}
        <strong>{digest.postsConsidered}</strong> videos by <strong>{digest.creatorsSeen}</strong>{" "}
        creators in the last {digest.windowHours} hours.
      </p>

      <section>
        <div className="section-head">
          <h2>Worth a look</h2>
          <p>Beating their own creator's normal, and still growing.</p>
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
          <p>Formats that reached a lot of people, whatever their creator's normal is.</p>
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

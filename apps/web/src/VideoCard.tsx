import { useState } from "react";

export interface VideoCardProps {
  postId: string;
  url: string;
  creator: string;
  caption?: string | undefined;
  thumbnail?: string | undefined;
  /** Shown on the video when this is a candidate: how far above the creator's normal it is. */
  multiple?: number;
  band?: string;
  ageHours?: number;
  /** Shown instead of the multiple when this is a format that worked at scale. */
  likes?: number;
  movement?: { text: string; direction: "rising" | "falling" | "unknown" };
  notes?: string[];
}

/**
 * A video, watchable in place.
 *
 * The poster loads first and the player only arrives when somebody asks for it. Twenty players
 * on one page would each pull a whole video framework, and the point of the page is to see
 * twenty videos at once and pick two.
 */
export function VideoCard(props: VideoCardProps) {
  const [playing, setPlaying] = useState(false);
  const label = `Play ${props.caption ? props.caption : `the video by ${props.creator}`}`;

  return (
    <article className="card">
      <div className="stage">
        {playing ? (
          <iframe
            title={label}
            src={`https://www.tiktok.com/embed/v2/${props.postId}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            loading="lazy"
          />
        ) : (
          <>
            {props.thumbnail ? <img src={props.thumbnail} alt="" loading="lazy" /> : null}
            <button
              type="button"
              className="play"
              onClick={() => setPlaying(true)}
              aria-label={label}
            >
              <span className="play-dot">
                <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
                  <path
                    d="M1 1.6v22.8a1 1 0 0 0 1.5.87l19-11.4a1 1 0 0 0 0-1.74l-19-11.4A1 1 0 0 0 1 1.6Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </button>
            {props.multiple !== undefined ? (
              <div className="rank">
                <span className="multiple">{props.multiple.toFixed(1)}x</span>
                {props.band ? <span className="band">{props.band}</span> : null}
              </div>
            ) : null}
            {props.likes !== undefined ? (
              <div className="likes-badge">{compact(props.likes)} likes</div>
            ) : null}
            {props.ageHours !== undefined ? (
              <div className="age">{Math.round(props.ageHours)}h old</div>
            ) : null}
            {props.caption ? <p className="caption">{props.caption}</p> : null}
          </>
        )}
      </div>

      <div className="facts">
        <div className="who">
          <a
            className="handle"
            href={`https://www.tiktok.com/@${props.creator}`}
            target="_blank"
            rel="noreferrer"
          >
            @{props.creator}
          </a>
          {props.movement ? (
            <span className={`tag tag-${props.movement.direction}`}>{props.movement.text}</span>
          ) : null}
        </div>
        {props.notes && props.notes.length > 0 ? (
          <ul className="notes">
            {props.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <a className="open" href={props.url} target="_blank" rel="noreferrer">
        Open on TikTok
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M4 1h7v7M11 1 1 11"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </a>
    </article>
  );
}

/** 2,400,000 reads as 2.4M. A screen does not need every digit of a like count. */
export function compact(count: number): string {
  if (count >= 1_000_000) return `${trim(count / 1_000_000)}M`;
  if (count >= 1_000) return `${trim(count / 1_000)}k`;
  return String(count);
}

function trim(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

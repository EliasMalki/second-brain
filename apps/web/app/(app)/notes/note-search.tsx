"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Note } from "@/lib/db/notes";
import { searchNotesAction } from "./actions";
import { NoteCard } from "./note-gallery";
import type { MoveTarget } from "./move-menu";

/**
 * As-you-type notes search, pinned above the gallery. Queries search_vector
 * with prefix matching (shared searchNotes — partial words hit), 200ms
 * debounce, sequence-guarded against out-of-order responses. Results render
 * as cards whose preview is a matched-term snippet built client-side from
 * body_text (no ts_headline — that would need an RPC). Keyboard: ↓/↑ move,
 * Enter opens, Esc clears.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function terms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 0);
}

/** Wrap every term occurrence in <mark>; split-with-capture keeps order. */
function highlight(text: string, re: RegExp): ReactNode {
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** A ~160-char window around the first matched term, terms marked. */
function snippet(note: Note, query: string): ReactNode | null {
  const words = terms(query);
  if (words.length === 0) return null;
  const re = new RegExp(`(${words.map(escapeRe).join("|")})`, "gi");
  const source = (note.body_text ?? note.body).replace(/\s*\n\s*/g, "  ");
  const at = source.search(re);
  if (at < 0) return null; // matched on the title — the normal preview is fine
  const start = Math.max(0, at - 40);
  const end = Math.min(source.length, at + 120);
  const windowText =
    (start > 0 ? "…" : "") +
    source.slice(start, end).trim() +
    (end < source.length ? "…" : "");
  return <span className="ncard-line ncard-snippet">{highlight(windowText, re)}</span>;
}

export function NotesSearch({
  moveTargets,
  onOpenHit,
  onActiveChange,
  cardMenu,
}: {
  moveTargets: MoveTarget[];
  /** Open a search hit (the full row is passed — it may not be in the
   *  workspace's local state if another device just created it). */
  onOpenHit: (note: Note) => void;
  /** True while a search is showing (the folder grid hides underneath). */
  onActiveChange: (active: boolean) => void;
  /** Renders the shared ⋯ menu for a hit card. */
  cardMenu: (note: Note) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Note[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seq.current += 1;
      setHits(null);
      return;
    }
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await searchNotesAction(q);
        if (seq.current === mySeq) {
          setHits(res);
          setActiveIndex(0);
        }
      } catch {
        if (seq.current === mySeq) setHits([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const searching = hits !== null;
  useEffect(() => {
    onActiveChange(searching);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  // Keep the keyboard-active card visible while arrowing.
  useEffect(() => {
    gridRef.current
      ?.querySelector(".ncard.is-active")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function clear() {
    setQuery("");
    setHits(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!hits || hits.length === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        clear();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) {
        onOpenHit(hit);
        clear();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      clear();
    }
  }

  return (
    <>
      <div className="notes-search">
        <i className="ti ti-search" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search notes…"
          aria-label="Search notes"
          aria-controls="notes-search-results"
        />
        {query ? (
          <button
            type="button"
            className="notes-search-clear"
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {searching ? (
        <div
          className="note-gallery"
          id="notes-search-results"
          ref={gridRef}
          role="region"
          aria-label={`Search results, ${hits.length}`}
        >
          {hits.length === 0 ? (
            <div className="note-list-empty">
              <i className="ti ti-zoom-question" aria-hidden="true" />
              <span>
                No notes match “{query.trim()}” — try fewer letters.
              </span>
            </div>
          ) : (
            <section className="ngal-sec" aria-label="Results">
              <header className="ngal-sec-h">
                <i className="ti ti-search" aria-hidden="true" />
                <span className="ngal-sec-name" role="heading" aria-level={2}>
                  Results
                </span>
                <span className="ngal-count" aria-hidden="true">
                  {hits.length}
                </span>
              </header>
              <div className="ngal-grid" role="list">
                {hits.map((note, i) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    selected={false}
                    active={i === activeIndex}
                    onOpen={() => {
                      onOpenHit(note);
                      clear();
                    }}
                    menu={cardMenu(note)}
                    previewOverride={snippet(note, query) ?? undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : null}
    </>
  );
}

import { useEffect } from 'react';
import { NNL } from '../../theme/nnl';
import { KEY_HEAD } from './layout';
import type { KeyDrawn } from './keyMarks';
import { ArrivedPill, ChipMark, KindGlyph } from './marks';

/** One Key entry, one line: the mark (drawn by the function the page uses), a bold term, a few words. */
function KeyEntry({ mark, term, text }: { mark: React.ReactNode; term: string; text: string }) {
  return (
    <div
      className="flex h-[18px] items-center gap-1.5 whitespace-nowrap text-[11px]"
      style={{ color: NNL.textMed }}
    >
      <span className="flex shrink-0 items-center justify-center" style={{ minWidth: 34 }}>
        {mark}
      </span>
      <span className="min-w-0 truncate">
        <b style={{ color: NNL.textHi }}>{term}</b> {text}
      </span>
    </div>
  );
}

/** The Key's entries: the five stage states always, every other mark only while it is drawn. */
export function KeyBody({ drawn }: { drawn: KeyDrawn }) {
  const hue = NNL.pathwayHues[0];
  const chip = (state: 'done' | 'now' | 'next' | 'later' | 'blocked', code: string, isTicket = false) => (
    <ChipMark state={state} code={code} isTicket={isTicket} hue={hue} />
  );
  const dim = { color: NNL.textLo };
  return (
    <div
      data-testid="key-body"
      className="grid gap-x-4 pb-1.5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
    >
      <KeyEntry mark={chip('done', 'P1')} term="done" text="finished" />
      <KeyEntry mark={chip('now', 'P2')} term="now" text="in progress" />
      <KeyEntry mark={chip('next', 'P3')} term="next" text="pick up next" />
      <KeyEntry mark={chip('later', 'P4')} term="later" text="queued; ○ lines" />
      <KeyEntry mark={chip('later', 'T', true)} term="T" text="a ticket" />
      {drawn.blocked && <KeyEntry mark={chip('blocked', 'P5')} term="blocked" text="waits on another" />}
      {drawn.parked && <KeyEntry mark={<span style={dim}>{'‖'}</span>} term="parked" text="not now" />}
      {drawn.queued && <KeyEntry mark={<span style={dim}>+n</span>} term="queued" text="plans not drawn" />}
      {drawn.outside && (
        <KeyEntry mark={<span style={{ color: NNL.status.next }}>{'↗'}</span>} term="outside" text="next is elsewhere" />
      )}
      {drawn.items && (
        <KeyEntry
          mark={
            <span className="flex gap-0.5">
              <KindGlyph kind="bug" />
              <KindGlyph kind="feature" />
              <KindGlyph kind="idea" />
            </span>
          }
          term="bug feature idea"
          text="per Pathway"
        />
      )}
      {drawn.arrived && <KeyEntry mark={<ArrivedPill name="Name" label="date" />} term="Arrived" text="complete" />}
    </div>
  );
}

/** The Key: inline when it fits under the blocks, else an upward overlay from its header (Esc or the header closes it). */
export function Key({
  open,
  overlay,
  onToggle,
  fits,
  drawn,
  maxH,
}: {
  open: boolean;
  overlay: boolean;
  onToggle: () => void;
  fits: boolean;
  drawn: KeyDrawn;
  maxH: number;
}) {
  const inline = fits && open;
  const floating = !fits && overlay;
  useEffect(() => {
    if (!floating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [floating, onToggle]);
  return (
    <section data-testid="key" className="relative shrink-0 rounded px-2" style={{ backgroundColor: NNL.surface }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={inline || floating}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase"
        style={{ color: NNL.textMed, height: KEY_HEAD }}
      >
        <span aria-hidden>{inline || floating ? '▾' : '▸'}</span>
        Key
      </button>
      {inline && <KeyBody drawn={drawn} />}
      {floating && (
        <div
          data-testid="key-overlay"
          className="absolute bottom-6 left-0 right-0 z-30 overflow-y-auto rounded px-2 pt-1"
          style={{ backgroundColor: NNL.raised, border: `1px solid ${NNL.border}`, maxHeight: maxH }}
        >
          <KeyBody drawn={drawn} />
        </div>
      )}
    </section>
  );
}

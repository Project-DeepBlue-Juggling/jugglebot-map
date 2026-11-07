import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { MarkdownField } from './fields';

afterEach(cleanup);

function Harness() {
  const [v, setV] = useState('line\n'.repeat(40));
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <MarkdownField label="Description" value={v} editable editing onChange={setV} />
    </div>
  );
}

describe('MarkdownField auto-grow keeps the drawer scroller in place (JB-151)', () => {
  it('does not let the collapse to height:auto reset the scroller on a keystroke', () => {
    render(<Harness />);
    const scroller = screen.getByTestId('scroller');
    const ta = screen.getByLabelText('Description') as HTMLTextAreaElement;
    // jsdom has no layout: model the browser clamping scrollTop when the
    // textarea collapses to auto, and a tall content height otherwise.
    let top = 500;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v;
      },
    });
    Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => 900 });
    const style = ta.style;
    let h = '900px';
    Object.defineProperty(ta, 'style', {
      configurable: true,
      get: () =>
        new Proxy(style, {
          get: (t, k) => (k === 'height' ? h : Reflect.get(t, k)),
          set: (t, k, v) => {
            if (k === 'height') {
              h = v as string;
              if (v === 'auto') top = 0; // the browser's clamp
              return true;
            }
            return Reflect.set(t, k, v);
          },
        }),
    });
    fireEvent.change(ta, { target: { value: 'line\n'.repeat(40) + 'x' } });
    expect(top).toBe(500);
    expect(h).toBe('900px');
  });
});

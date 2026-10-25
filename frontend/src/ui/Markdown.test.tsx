import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Markdown from './Markdown';

const show = async (source: string) => {
  const r = render(<Markdown source={source} />);
  // The renderer is lazy; its wrapper appears once it has loaded.
  await waitFor(() => expect(r.container.querySelector('.dr-md')).not.toBeNull());
  return r.container;
};

describe('Markdown', () => {
  it('renders headings, emphasis, code, nested lists, GFM tables and strikethrough', async () => {
    const c = await show(
      [
        '## Heading',
        '',
        '**bold** and `code` and ~~gone~~',
        '',
        '- one',
        '  - nested',
        '- two',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n'),
    );
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(c.querySelector('strong')?.textContent).toBe('bold');
    expect(c.querySelector('code')?.textContent).toBe('code');
    expect(c.querySelector('del')?.textContent).toBe('gone');
    expect(c.querySelectorAll('ul ul li')).toHaveLength(1);
    expect(c.querySelectorAll('table th')).toHaveLength(2);
    expect(c.querySelector('table')?.parentElement?.className).toMatch(/overflow-x-auto/);
  });

  it('joins soft line breaks into one paragraph with no <br>', async () => {
    const c = await show('a\nb');
    expect(c.querySelectorAll('p')).toHaveLength(1);
    expect(c.querySelector('p')?.textContent).toBe('a b');
    expect(c.querySelector('br')).toBeNull();
  });

  it('shows raw HTML as literal text and never makes a script element', async () => {
    const c = await show('<script>alert(1)</script>');
    expect(c.querySelector('script')).toBeNull();
    expect(c.textContent).toContain('<script>alert(1)</script>');
  });

  it('keeps placeholder-style tags as literal text', async () => {
    const c = await show('Phase · <plan short name> done');
    expect(c.textContent).toContain('Phase · <plan short name> done');
  });

  it('drops javascript: URLs, opens https in a new tab, and leaves relative paths as text', async () => {
    const c = await show('[x](javascript:alert(1)) [y](https://e.com) [z](plans/a.md)');
    expect(c.querySelector('a[href^="javascript"]')).toBeNull();
    const links = [...c.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://e.com');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('z').tagName).toBe('CODE');
  });

  it('renders an image as a link with its alt text, never an <img>', async () => {
    const c = await show('![cat](https://e.com/c.png)');
    expect(c.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'cat' })).toHaveAttribute(
      'href',
      'https://e.com/c.png',
    );
  });
});

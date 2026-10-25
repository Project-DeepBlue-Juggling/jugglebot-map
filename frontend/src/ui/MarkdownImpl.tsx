import { useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SHORT_ID_IN_TEXT } from '../lib/shortId';
import { ITEM_HREF_PREFIX, ItemLinkCtx } from './itemLinks';

/* A minimal mdast node shape: enough for the one plugin below without a
   unist dependency. */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/** Parents whose children are inline (phrasing) content. */
const PHRASING_PARENTS = new Set([
  'paragraph',
  'heading',
  'emphasis',
  'strong',
  'delete',
  'link',
  'tableCell',
]);

/**
 * Raw HTML is never rendered and never dropped: items carry prose such as
 * `<plan short name>` that CommonMark parses as an HTML tag. Every `html`
 * node becomes literal text; soft line breaks join with a space so a
 * hard-wrapped plan paragraph reads as one paragraph.
 */
function remarkLiteralHtml() {
  const walk = (node: MdNode) => {
    if (node.children === undefined) return;
    const inline = PHRASING_PARENTS.has(node.type);
    node.children = node.children.map((child) => {
      if (child.type === 'html') {
        const text: MdNode = { type: 'text', value: child.value ?? '' };
        return inline ? text : { type: 'paragraph', children: [text] };
      }
      if (child.type === 'text' && child.value !== undefined) {
        return { ...child, value: child.value.replace(/\n/g, ' ') };
      }
      walk(child);
      return child;
    });
  };
  return (tree: MdNode) => walk(tree);
}

/**
 * `JB-<n>` mentions of KNOWN Items become links (exact, case-sensitive,
 * word-bounded; an unknown ID stays text). Text inside a link or a code span is
 * left alone: inline code is its own node type, and links are not descended.
 */
function remarkItemIds(ids: ReadonlyMap<string, string>) {
  const split = (value: string): MdNode[] => {
    const out: MdNode[] = [];
    let last = 0;
    for (const m of value.matchAll(SHORT_ID_IN_TEXT)) {
      const at = m.index ?? 0;
      if (!ids.has(m[0])) continue;
      if (at > last) out.push({ type: 'text', value: value.slice(last, at) });
      out.push({
        type: 'link',
        url: ITEM_HREF_PREFIX + m[0],
        children: [{ type: 'text', value: m[0] }],
      });
      last = at + m[0].length;
    }
    if (out.length === 0) return [{ type: 'text', value }];
    if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
    return out;
  };
  const walk = (node: MdNode) => {
    if (node.children === undefined || node.type === 'link') return;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text' && child.value !== undefined) return split(child.value);
      walk(child);
      return [child];
    });
  };
  return () => (tree: MdNode) => walk(tree);
}

/** A linkified `JB-<n>`: opens that Item in the drawer. */
function ItemRef({ shortId, children }: { shortId: string; children: ReactNode }) {
  const links = useContext(ItemLinkCtx);
  const id = links?.ids.get(shortId);
  if (links === null || id === undefined) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => links.open(id)}
      className="font-mono text-[12.5px] text-dr-link underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

const isWebUrl = (href: string | undefined): href is string =>
  href !== undefined && /^https?:\/\//i.test(href);

const CODE = 'rounded-[3px] bg-dr-code px-1 py-px font-mono text-[12.5px] [overflow-wrap:anywhere]';
const HEAD = 'font-semibold text-dr-hi mb-1.5 mt-[18px] first:mt-0';

const components: Components = {
  p: ({ children }) => <p className="my-[10px] first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h3 className={`${HEAD} text-[16px]`}>{children}</h3>,
  h2: ({ children }) => <h4 className={`${HEAD} text-[15px]`}>{children}</h4>,
  h3: ({ children }) => <h5 className={`${HEAD} text-[14px]`}>{children}</h5>,
  h4: ({ children }) => <h6 className={`${HEAD} text-[14px]`}>{children}</h6>,
  strong: ({ children }) => <strong className="font-semibold text-dr-hi">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  a: ({ href, children }) =>
    href?.startsWith(ITEM_HREF_PREFIX) === true ? (
      <ItemRef shortId={href.slice(ITEM_HREF_PREFIX.length)}>{children}</ItemRef>
    ) : isWebUrl(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-dr-link underline-offset-2 hover:underline"
      >
        {children}
      </a>
    ) : (
      <code className={CODE}>{children}</code>
    ),
  img: ({ src, alt }) =>
    isWebUrl(typeof src === 'string' ? src : undefined) ? (
      <a
        href={src as string}
        target="_blank"
        rel="noopener noreferrer"
        className="text-dr-link underline-offset-2 hover:underline"
      >
        {alt === undefined || alt === '' ? (src as string) : alt}
      </a>
    ) : (
      <span>{alt}</span>
    ),
  code: ({ className, children }) =>
    // Fenced blocks arrive with a language class or inside <pre>; the <pre>
    // wrapper below styles them, so plain <code> here is the inline form.
    className?.startsWith('language-') === true ? (
      <code className={className}>{children}</code>
    ) : (
      <code className={CODE}>{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-[10px] overflow-x-auto rounded bg-dr-code p-[10px] font-mono text-[12.5px] leading-[1.5] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  ul: ({ children, className }) => (
    <ul
      className={`my-[10px] flex list-disc flex-col gap-1 pl-5 ${className ?? ''} [&_ul]:my-1 [&_ol]:my-1`}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-[10px] flex list-decimal flex-col gap-1 pl-5 [&_ul]:my-1 [&_ol]:my-1">
      {children}
    </ol>
  ),
  li: ({ children, className }) => (
    <li className={className?.includes('task-list-item') === true ? 'list-none -ml-5' : undefined}>
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-[10px] border-l-[3px] border-dr-strong pl-3 text-dr-med">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-dr-border" />,
  table: ({ children }) => (
    <div className="my-[10px] overflow-x-auto">
      <table className="border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-dr-border px-2 py-1 text-left font-semibold text-dr-hi">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-dr-border px-2 py-1">{children}</td>,
};

/** The rendering half; `Markdown.tsx` lazy-loads it to keep it off the first paint. */
export default function MarkdownImpl({ source }: { source: string }): ReactNode {
  const links = useContext(ItemLinkCtx);
  const plugins = useMemo(
    () =>
      links === null || links.ids.size === 0
        ? [remarkGfm, remarkLiteralHtml]
        : [remarkGfm, remarkLiteralHtml, remarkItemIds(links.ids)],
    [links],
  );
  return (
    <div className="dr-md text-[14px] leading-[1.6] text-dr-body [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

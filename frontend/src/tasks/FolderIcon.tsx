interface FolderIconProps {
  className?: string;
  /** When provided, the icon is exposed to assistive tech with this name;
   *  otherwise it's decorative (`aria-hidden`) — use that where adjacent text
   *  already conveys "section". */
  label?: string;
}

/** The folder glyph that marks a "section" (grouping node) across the canvas,
 *  list, and search surfaces (ADR 0048). One definition so the mark stays
 *  identical everywhere. */
export default function FolderIcon({ className, label }: FolderIconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="currentColor"
      {...(label !== undefined ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d="M2 5a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.4.6L10 5h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z" />
    </svg>
  );
}

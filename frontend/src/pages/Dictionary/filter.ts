import type { Glossary, GlossaryCluster } from '../../api/schemas';

/** Clusters keeping only the terms whose name, definition or Avoid words contain `query`. */
export function filterGlossary(glossary: Glossary, query: string): GlossaryCluster[] {
  const q = query.trim().toLowerCase();
  if (q === '') return glossary.clusters;
  return glossary.clusters
    .map((c) => ({
      ...c,
      terms: c.terms.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q) ||
          t.avoid.some((a) => a.toLowerCase().includes(q)),
      ),
    }))
    .filter((c) => c.terms.length > 0);
}

export function clusterId(name: string): string {
  return 'cluster-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'terms');
}

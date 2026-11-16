/** Stable anchor shared by chapter breadcrumbs and the curriculum index. */
export function partAnchor(partTitle: string): string {
  return `part-${partTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function partHref(partTitle: string): string {
  return `/chapters#${partAnchor(partTitle)}`;
}

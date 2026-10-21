/** Page links to show: first, last, and the neighbours of the current page, with gaps as null. */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of sorted) {
    const last = out.at(-1);
    if (typeof last === "number" && n - last === 2) out.push(n - 1);
    else if (typeof last === "number" && n - last > 2) out.push(null);
    out.push(n);
  }
  return out;
}

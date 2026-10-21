/**
 * Money is always whole Kenyan shillings in integers (bigint in Postgres).
 * Cars never need cents, and integers avoid floating-point surprises in the ledger.
 */

const kes = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

/** 1370000 → "KSh 1,370,000" */
export function formatKes(amount: number): string {
  return `KSh ${kes.format(Math.round(amount))}`;
}

/** 1370000 → "KSh 1.37M", 850000 → "KSh 850K" — for cards and filters. */
export function formatKesShort(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `KSh ${Number.isInteger(m) ? m : m.toFixed(2).replace(/0$/, "")}M`;
  }
  if (amount >= 1_000) return `KSh ${Math.round(amount / 1_000)}K`;
  return formatKes(amount);
}

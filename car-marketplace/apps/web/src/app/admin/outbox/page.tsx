import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clsx } from "clsx";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Outbox", robots: { index: false } };

const KIND: Record<string, string> = {
  new_message: "Chat message",
  search_alert: "Search alert",
  search_digest: "Daily summary",
  email_verification: "Email code",
};
const STATUS_STYLE: Record<string, string> = {
  sent: "bg-success-soft text-success",
  pending: "bg-plate-soft text-ink",
  sending: "bg-plate-soft text-ink",
  failed: "bg-danger-soft text-danger",
  skipped: "bg-mist/60 text-ink-soft",
};

export default function OutboxPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="display text-4xl">Outbox</h1>
      <p className="mt-2 max-w-[70ch] text-ink-soft">
        Every SMS and email the platform sends, newest first. Until an SMS account is connected, texts are written
        here but not sent. <Link href="/admin/review" className="font-semibold text-forest underline-offset-4 hover:underline">Review queue</Link>
      </p>
      <Suspense fallback={<div aria-hidden className="mt-8 h-96 rounded-[var(--radius-control)] bg-mist/40" />}>
        <Deliveries />
      </Suspense>
    </div>
  );
}

async function Deliveries() {
  await requireUser("/admin/outbox");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_recent_deliveries", { p_limit: 200 });
  if (error?.code === "42501") notFound();
  if (error) {
    return (
      <p role="alert" className="mt-8 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-danger">
        Couldn&apos;t load the outbox.
      </p>
    );
  }
  if (!data?.length) return <p className="mt-8 text-muted">Nothing sent yet.</p>;

  return (
    <div className="mt-8 overflow-x-auto rounded-[var(--radius-control)] border border-mist bg-surface">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="border-b border-mist bg-paper text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">When</th>
            <th className="px-4 py-2.5 font-semibold">What</th>
            <th className="px-4 py-2.5 font-semibold">To</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 font-semibold">Text</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist align-top">
          {data.map((d) => (
            <tr key={d.id}>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{d.created_at ? formatDateTime(d.created_at) : ""}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="font-semibold uppercase">{d.channel}</span> {KIND[d.kind ?? ""] ?? d.kind}
              </td>
              <td className="px-4 py-3">
                {d.recipient_name}
                {d.sent_to ? <span className="block text-muted">{d.sent_to}</span> : null}
              </td>
              <td className="px-4 py-3">
                <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[d.status ?? ""] ?? "")}>{d.status}</span>
                {d.skip_reason ? <span className="mt-1 block text-xs text-muted">{d.skip_reason}</span> : null}
                {d.last_error ? <span className="mt-1 block text-xs text-danger">{d.last_error}</span> : null}
              </td>
              <td className="max-w-[28rem] whitespace-pre-line px-4 py-3">{d.body}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

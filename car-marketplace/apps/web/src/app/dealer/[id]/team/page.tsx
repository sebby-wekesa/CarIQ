import type { Metadata } from "next";
import { Suspense } from "react";
import { requireDealer } from "@/lib/dealers/queries";
import { createClient } from "@/lib/supabase/server";
import { DealerFrame, DealerHeader, DealerSkeleton } from "../../dealer-header";
import { TeamManager, type TeamRow } from "./team-manager";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default function TeamPage({ params }: PageProps<"/dealer/[id]/team">) {
  return (
    <DealerFrame>
      <Suspense fallback={<DealerSkeleton />}>
        <Team params={params} />
      </Suspense>
    </DealerFrame>
  );
}

async function Team({ params }: Pick<PageProps<"/dealer/[id]/team">, "params">) {
  const { id } = await params;
  const { dealer } = await requireDealer(id, `/dealer/${id}/team`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("dealer_team", { p_dealer_id: id });
  const rows: TeamRow[] = (data ?? []).map((r) => ({
    profileId: r.profile_id,
    inviteId: r.invite_id,
    name: r.full_name,
    phone: r.phone,
    role: r.role!,
    since: r.since!,
    isMe: Boolean(r.is_me),
  }));

  return (
    <>
      <DealerHeader dealer={dealer} tab="team" />
      <div className="mt-8 max-w-3xl">
        <p className="text-ink-soft">
          Everyone on the team sees the dealership&apos;s cars, chats and leads, and can reply to buyers. Buyers see the
          dealership&apos;s name, not yours.
        </p>
        <div className="mt-6">
          <TeamManager dealerId={id} myRole={dealer.role} rows={rows} />
        </div>
      </div>
    </>
  );
}

"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { DEALER_ROLE_HINTS, DEALER_ROLE_LABELS, type DealerRole } from "@cm/shared";
import { formatDate } from "@/lib/format";
import { useResetOnHide } from "@/lib/use-reset-on-hide";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select, describedBy } from "@/components/ui/field";
import { cancelInvite, changeStaffRole, inviteStaff, removeStaff, type FormState } from "../../actions";

export type TeamRow = {
  profileId: string | null;
  inviteId: string | null;
  name: string | null;
  phone: string | null;
  role: DealerRole;
  since: string;
  isMe: boolean;
};

export function TeamManager({ dealerId, myRole, rows }: { dealerId: string; myRole: DealerRole; rows: TeamRow[] }) {
  const members = rows.filter((r) => r.profileId);
  const invites = rows.filter((r) => r.inviteId);
  const canInvite = myRole === "owner" || myRole === "manager";

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-xl font-bold">
          Team ({members.length})
        </h2>
        <ul className="mt-3 divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface">
          {members.map((m) => (
            <Member key={m.profileId} dealerId={dealerId} member={m} myRole={myRole} />
          ))}
        </ul>
      </section>

      {invites.length ? (
        <section aria-labelledby="invites-heading">
          <h2 id="invites-heading" className="text-xl font-bold">
            Invited, not signed in yet
          </h2>
          <ul className="mt-3 divide-y divide-mist rounded-[var(--radius-control)] border border-mist bg-surface">
            {invites.map((i) => (
              <Invite key={i.inviteId} dealerId={dealerId} invite={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {canInvite ? <InviteForm dealerId={dealerId} myRole={myRole} /> : null}
    </div>
  );
}

function Member({ dealerId, member, myRole }: { dealerId: string; member: TeamRow; myRole: DealerRole }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const owner = myRole === "owner";

  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (result.errors?._form) setError(result.errors._form);
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">
          {member.name ?? "No name yet"}
          {member.isMe ? <span className="ml-2 text-sm font-normal text-muted">(you)</span> : null}
        </p>
        <p className="text-sm text-muted">
          {member.phone} · since {formatDate(member.since)}
        </p>
        {error ? <p className="mt-1 text-sm font-medium text-danger">{error}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {owner ? (
          <>
            <label htmlFor={`role-${member.profileId}`} className="sr-only">
              Role for {member.name}
            </label>
            <Select
              id={`role-${member.profileId}`}
              value={member.role}
              disabled={busy}
              className="min-h-11 w-36"
              onChange={(e) => run(() => changeStaffRole(dealerId, member.profileId!, e.target.value))}
            >
              {(["owner", "manager", "sales"] as const).map((r) => (
                <option key={r} value={r}>
                  {DEALER_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <span className="rounded-full bg-mist/60 px-2.5 py-1 text-sm font-semibold">{DEALER_ROLE_LABELS[member.role]}</span>
        )}
        {owner || member.isMe ? (
          <button
            type="button"
            className={buttonClass("quiet", "md", "text-danger")}
            disabled={busy}
            onClick={() => {
              const question = member.isMe ? "Leave this dealership? You'll lose access to its cars and chats." : `Remove ${member.name ?? "this person"} from the team?`;
              if (window.confirm(question)) run(() => removeStaff(dealerId, member.profileId!));
            }}
          >
            {member.isMe ? "Leave" : "Remove"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Invite({ dealerId, invite }: { dealerId: string; invite: TeamRow }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-semibold">{invite.phone}</p>
        <p className="text-sm text-muted">
          {DEALER_ROLE_LABELS[invite.role]} · invited {formatDate(invite.since)}
        </p>
        {error ? <p className="mt-1 text-sm font-medium text-danger">{error}</p> : null}
      </div>
      <button
        type="button"
        className={buttonClass("quiet", "md", "text-danger")}
        disabled={busy}
        onClick={() =>
          start(async () => {
            const result = await cancelInvite(dealerId, invite.inviteId!);
            if (result.errors?._form) setError(result.errors._form);
          })
        }
      >
        Cancel invite
      </button>
    </li>
  );
}

function InviteForm({ dealerId, myRole }: { dealerId: string; myRole: DealerRole }) {
  const [state, action, pending] = useActionState<FormState, FormData | null>(
    (previous, formData) => (formData ? inviteStaff(dealerId, previous, formData) : {}),
    {},
  );
  useResetOnHide(() => startTransition(() => action(null)));
  const errors = state.errors ?? {};
  const roles = myRole === "owner" ? (["sales", "manager"] as const) : (["sales"] as const);
  const hint = "They get an SMS. If they're new, they join when they first sign in with this number.";

  return (
    <section aria-labelledby="invite-heading" className="rounded-[var(--radius-control)] border border-mist bg-surface p-4 sm:p-5">
      <h2 id="invite-heading" className="text-xl font-bold">
        Add someone
      </h2>
      <form action={action} className="mt-4 flex flex-col gap-4" noValidate key={state.saved ? state.message : "form"}>
        {state.saved && state.message ? <Alert tone="success">{state.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field id="invite-phone" label="Their mobile number" hint={hint} error={errors.phone}>
            <Input
              id="invite-phone"
              name="phone"
              inputMode="tel"
              autoComplete="off"
              placeholder="0712 345 678"
              defaultValue={state.saved ? "" : String(state.values?.phone ?? "")}
              invalid={Boolean(errors.phone)}
              aria-describedby={describedBy("invite-phone", errors.phone, hint)}
            />
          </Field>
          <Field id="invite-role" label="Role" error={errors.role}>
            <Select id="invite-role" name="role" defaultValue="sales">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {DEALER_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <ul className="text-sm text-muted">
          {roles.map((r) => (
            <li key={r}>
              <span className="font-semibold text-ink-soft">{DEALER_ROLE_LABELS[r]}:</span> {DEALER_ROLE_HINTS[r]}
            </li>
          ))}
        </ul>
        <Button type="submit" pending={pending} className="sm:self-start">
          Add to team
        </Button>
      </form>
    </section>
  );
}

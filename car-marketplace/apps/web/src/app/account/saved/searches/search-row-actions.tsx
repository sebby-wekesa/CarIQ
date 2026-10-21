"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteSavedSearch, setSearchAlerts } from "@/lib/buyer/actions";
import { useBuyer } from "@/components/buyer/buyer-provider";

export function SearchRowActions({ id, alertsEnabled, name }: { id: string; alertsEnabled: boolean; name: string }) {
  const { reload } = useBuyer();
  const [pending, startTransition] = useTransition();
  const [alerts, setAlerts] = useState(alertsEnabled);
  const [error, setError] = useState<string | null>(null);

  function toggleAlerts(on: boolean) {
    setAlerts(on);
    setError(null);
    startTransition(async () => {
      const result = await setSearchAlerts(id, on);
      if (!result.ok) {
        setAlerts(!on);
        setError(result.message);
      }
    });
  }

  function remove() {
    if (!window.confirm(`Delete “${name}”? You'll stop getting alerts for it.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSavedSearch(id);
      if (!result.ok) setError(result.message);
      else await reload();
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm font-semibold">
          <input
            type="checkbox"
            role="switch"
            checked={alerts}
            disabled={pending}
            onChange={(e) => toggleAlerts(e.target.checked)}
            className="size-5 accent-forest"
          />
          Alerts {alerts ? "on" : "off"}
        </label>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="grid size-11 place-items-center rounded-[var(--radius-control)] text-muted hover:bg-paper hover:text-danger"
          aria-label={`Delete ${name}`}
        >
          <Trash2 aria-hidden className="size-5" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

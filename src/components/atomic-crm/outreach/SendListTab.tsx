import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  addWorkingDays,
  buildDraftUrl,
  buildSendList,
  MODES,
  SECTORS,
  type SendPick,
} from "./outreachLogic";
import { getSalesId, type OutreachData } from "./useOutreachData";

const DAILY_CAP = 20;
const TIERS = ["A", "B", "C", ""] as const;

export const SendListTab = ({
  data,
  reload,
}: {
  data: OutreachData;
  reload: () => Promise<void>;
}) => {
  const [supplierId, setSupplierId] = useState(data.suppliers[0]?.id ?? 0);
  const [count, setCount] = useState(15);
  const [tiers, setTiers] = useState<Record<string, boolean>>({
    A: true,
    B: true,
    C: true,
    "": true,
  });
  const [sector, setSector] = useState(SECTORS[0]);
  const [mode, setMode] = useState(MODES[0]);
  const [includeApproached, setIncludeApproached] = useState(false);
  const [includeWeichert, setIncludeWeichert] = useState(true);
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const supplier = data.suppliers.find((s) => s.id === supplierId);
  const list = useMemo(
    () =>
      supplier
        ? buildSendList(data, {
            supplier,
            count,
            tiers,
            includeApproached,
            includeWeichert,
            skipped,
          })
        : null,
    [data, supplier, count, tiers, includeApproached, includeWeichert, skipped],
  );
  const sentToday = data.sendLog.filter(
    (s) => new Date(s.sent_at).toDateString() === new Date().toDateString(),
  ).length;

  if (!supplier || !list) {
    return <p className="p-4">Add a supplier first.</p>;
  }

  const markSent = async ({ company, contact }: SendPick) => {
    setBusy(true);
    const supabase = getSupabaseClient();
    const chaseDue = addWorkingDays(new Date(), 4);
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("send_log").insert({
      contact_id: contact.id,
      company: company.company,
      name: contact.name,
      email: contact.email,
      email_norm: contact.email_norm,
      supplier: supplier.name,
      mailbox: "marmont",
      subject: supplier.subject_template,
      chase_due: chaseDue.toISOString().slice(0, 10),
    });
    await supabase
      .from("stg_uk_contacts")
      .update({ already_emailed: `${supplier.name} ${today}` })
      .eq("id", contact.id);
    if (contact.crm_contact_id) {
      const salesId = await getSalesId();
      await supabase.from("contact_notes").insert({
        contact_id: contact.crm_contact_id,
        text: `Emailed ${today} (${supplier.name}): ${supplier.subject_template ?? ""}`,
        date: new Date().toISOString(),
        sales_id: salesId,
      });
      await supabase.from("tasks").insert({
        contact_id: contact.crm_contact_id,
        type: "Email",
        text: `Chase ${contact.name ?? contact.email} (${supplier.name})`,
        due_date: chaseDue.toISOString(),
        sales_id: salesId,
      });
    }
    await reload();
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-md border p-3">
        <label className="flex flex-col text-sm font-medium">
          Supplier
          <select
            className="rounded border px-2 py-1"
            value={supplierId}
            onChange={(e) => setSupplierId(Number(e.target.value))}
          >
            {data.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-medium">
          How many
          <input
            className="w-20 rounded border px-2 py-1"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 15)}
          />
        </label>
        <label className="flex flex-col text-sm font-medium">
          Sector
          <select
            className="rounded border px-2 py-1"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
          >
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-medium">
          Ask
          <select
            className="rounded border px-2 py-1"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-3 text-sm">
          {TIERS.map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={tiers[t]}
                onChange={(e) => setTiers({ ...tiers, [t]: e.target.checked })}
              />
              {t ? `Tier ${t}` : "Unrated"}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={includeWeichert}
            onChange={(e) => setIncludeWeichert(e.target.checked)}
          />
          Weichert customers
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={includeApproached}
            onChange={(e) => setIncludeApproached(e.target.checked)}
          />
          Already approached
        </label>
      </div>

      <p
        className={
          sentToday >= DAILY_CAP
            ? "font-semibold text-red-600"
            : "text-sm text-muted-foreground"
        }
      >
        Sent today: {sentToday} of {DAILY_CAP}
        {sentToday >= DAILY_CAP && " - stop for today to protect the domain"}
      </p>

      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="p-2">Company</th>
            <th className="p-2">Contact</th>
            <th className="p-2">Why</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {list.picks.map((pick) => (
            <tr key={pick.contact.id} className="border-t align-top">
              <td className="p-2 font-medium">
                {pick.company.company}
                <div className="text-xs text-muted-foreground">
                  {[
                    pick.company.tier && `Tier ${pick.company.tier}`,
                    pick.company.growth_flag === "Y" && "High growth",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </td>
              <td className="p-2">
                {pick.contact.name}
                <div className="text-xs text-muted-foreground">
                  {pick.contact.email}
                </div>
              </td>
              <td className="p-2 text-xs text-muted-foreground">
                {[
                  pick.company.brand_turnover,
                  pick.company.size_note,
                  pick.company.strategy_remark,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </td>
              <td className="flex gap-1 p-2">
                <Button
                  size="sm"
                  onClick={() =>
                    window.open(
                      buildDraftUrl(
                        supplier,
                        {
                          brand: pick.company.company,
                          name: pick.contact.name,
                          email: pick.contact.email ?? "",
                        },
                        sector,
                        mode,
                      ),
                      "_blank",
                    )
                  }
                >
                  Draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => markSent(pick)}
                >
                  Sent
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSkipped(new Set([...skipped, pick.contact.id]))
                  }
                >
                  Skip
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted-foreground">
        {list.picks.length} shown of {list.total} who qualify.
      </p>
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Why others were left out
        </summary>
        <ul className="mt-2 list-disc pl-5">
          {Object.entries(list.excluded)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, n]) => (
              <li key={reason}>
                {n} - {reason}
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
};

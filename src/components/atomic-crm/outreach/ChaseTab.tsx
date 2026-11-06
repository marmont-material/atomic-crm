import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { addWorkingDays, chaseDraftUrl } from "./outreachLogic";
import type { OutreachData } from "./useOutreachData";

export const ChaseTab = ({
  data,
  reload,
}: {
  data: OutreachData;
  reload: () => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const due = data.sendLog
    .filter((s) => s.status === "sent" && (s.chase_due ?? "") <= today)
    .sort((a, b) => (a.chase_due ?? "").localeCompare(b.chase_due ?? ""));

  const patch = async (id: number, values: Record<string, string>) => {
    setBusy(true);
    await getSupabaseClient().from("send_log").update(values).eq("id", id);
    await reload();
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{due.length} chases due</p>
      <table className="w-full text-sm">
        <tbody>
          {due.map((s) => {
            const supplier =
              data.suppliers.find((x) => x.name === s.supplier) ??
              data.suppliers[0];
            return (
              <tr key={s.id} className="border-t align-top">
                <td className="p-2">
                  {new Date(s.sent_at).toLocaleDateString("en-GB")}
                  <div className="text-xs text-muted-foreground">
                    due {s.chase_due}
                  </div>
                </td>
                <td className="p-2 font-medium">
                  {s.company}
                  <div className="text-xs text-muted-foreground">
                    {s.supplier}
                  </div>
                </td>
                <td className="p-2">
                  {s.name}
                  <div className="text-xs text-muted-foreground">{s.email}</div>
                </td>
                <td className="flex gap-1 p-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      supplier &&
                      window.open(
                        chaseDraftUrl(supplier, s.email, s.name),
                        "_blank",
                      )
                    }
                  >
                    Chase draft
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => patch(s.id, { status: "replied" })}
                  >
                    Replied
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      patch(s.id, {
                        chase_due: addWorkingDays(new Date(), 3)
                          .toISOString()
                          .slice(0, 10),
                      })
                    }
                  >
                    Snooze 3 days
                  </Button>
                </td>
              </tr>
            );
          })}
          {due.length === 0 && (
            <tr>
              <td className="p-2 text-muted-foreground">Nothing due.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

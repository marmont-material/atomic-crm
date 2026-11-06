import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  buildDraftUrl,
  normaliseEmail,
  type StgContact,
} from "./outreachLogic";
import type { OutreachData } from "./useOutreachData";

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const TestAddressesTab = ({
  data,
  reload,
}: {
  data: OutreachData;
  reload: () => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);
  const supplier = data.suppliers[0];
  const waiting = data.contacts
    .filter((c) => /^(CHECK|TESTING)/.test(c.action ?? ""))
    .sort((a, b) => a.company.localeCompare(b.company));

  const update = async (contact: StgContact, patch: Partial<StgContact>) => {
    setBusy(true);
    const { error } = await getSupabaseClient()
      .from("stg_uk_contacts")
      .update(patch)
      .eq("id", contact.id);
    if (error) window.alert(error.message);
    setBusy(false);
    return !error;
  };

  const recordOnFormat = async (
    contact: StgContact,
    field: "accepted" | "bounced",
  ) => {
    const domain = (contact.email ?? "").split("@")[1];
    const format = data.formats.find((f) => f.domain === domain);
    if (!format) return;
    const joined = [format[field], contact.email].filter(Boolean).join(", ");
    await getSupabaseClient()
      .from("email_formats")
      .update({ [field]: joined, updated_at: new Date().toISOString() })
      .eq("id", format.id);
  };

  const formatFor = (contact: StgContact) =>
    data.formats.find((f) => f.domain === (contact.email ?? "").split("@")[1]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {waiting.length} guessed addresses. Send one real email to one person
        per company, wait a day for a bounce, then mark the result. Confirmed
        formats then apply to colleagues.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="p-2">Company</th>
            <th className="p-2">Contact</th>
            <th className="p-2">Format</th>
            <th className="p-2">Status</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {waiting.map((contact) => {
            const testing = /^TESTING/.test(contact.action ?? "");
            return (
              <tr key={contact.id} className="border-t align-top">
                <td className="p-2 font-medium">{contact.company}</td>
                <td className="p-2">
                  {contact.name}
                  <div className="text-xs text-muted-foreground">
                    {contact.email}
                  </div>
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {formatFor(contact)?.best_guess ?? "no format recorded"}
                </td>
                <td className="p-2 text-xs">{contact.action}</td>
                <td className="flex flex-wrap gap-1 p-2">
                  {testing ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await update(contact, {
                              action: `OK - address confirmed (delivered ${todayLabel()})`,
                            })
                          ) {
                            await recordOnFormat(contact, "accepted");
                            await reload();
                          }
                        }}
                      >
                        Delivered
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await update(contact, {
                              action: `DO NOT EMAIL - bounced on test ${todayLabel()}`,
                            })
                          ) {
                            await getSupabaseClient()
                              .from("bounce_log")
                              .insert({
                                email: contact.email,
                                email_norm: contact.email_norm,
                                company: contact.company,
                                bounce_date: new Date()
                                  .toISOString()
                                  .slice(0, 10),
                                kind: "not found (dead)",
                                reason: "bounced on address test",
                                source: "CRM outreach screen",
                              });
                            await recordOnFormat(contact, "bounced");
                            await reload();
                          }
                        }}
                      >
                        Bounced
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        disabled={!supplier}
                        onClick={() =>
                          supplier &&
                          window.open(
                            buildDraftUrl(
                              supplier,
                              {
                                brand: contact.company,
                                name: contact.name,
                                email: contact.email ?? "",
                              },
                              "Athleisure",
                              "Visit",
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
                        onClick={async () => {
                          if (
                            await update(contact, {
                              action: `TESTING - sent ${todayLabel()} (wait a day for a bounce)`,
                            })
                          )
                            await reload();
                        }}
                      >
                        Sent
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const next = window.prompt(
                        `New address to try for ${contact.name} (one guess only):`,
                        contact.email ?? "",
                      );
                      if (
                        next &&
                        next !== contact.email &&
                        (await update(contact, {
                          email: next.trim(),
                          email_norm: normaliseEmail(next),
                          action: "CHECK - address is a guess",
                        }))
                      )
                        await reload();
                    }}
                  >
                    Change address
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

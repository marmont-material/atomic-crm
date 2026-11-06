// Pure logic for the Outreach screens: who is eligible, what to draft,
// when to chase. No React, no network, so it is easy to test.

export type StgCompany = {
  id: number;
  company: string;
  list_tab: string | null;
  sources: string | null;
  weichert_customer: string | null;
  unitex_customer: string | null;
  tier: string | null;
  growth_flag: string | null;
  size_note: string | null;
  strategy_remark: string | null;
  brand_turnover: string | null;
  target_2027: string | null;
  group_name: string | null;
  review_status: string | null;
  contacts_emailed: string | number | null;
  crm_company_id: number | null;
};

export type StgContact = {
  id: number;
  company: string;
  name: string | null;
  email: string | null;
  email_norm: string | null;
  action: string | null;
  already_emailed: string | null;
  crm_contact_id: number | null;
};

export type Supplier = {
  id: number;
  name: string;
  subject_template: string | null;
  body_template: string | null;
};
export type SupplierRule = {
  supplier_id: number | null;
  company: string;
  rule: string;
};
export type BounceRow = { email_norm: string | null; kind: string | null };
export type SendLogRow = {
  id: number;
  contact_id: number | null;
  company: string;
  name: string | null;
  email: string;
  email_norm: string | null;
  supplier: string | null;
  sent_at: string;
  chase_due: string | null;
  status: string;
};

export type SendListOptions = {
  supplier: Supplier;
  count: number;
  tiers: Record<string, boolean>; // keys "A" | "B" | "C" | "" (unrated)
  includeApproached: boolean;
  includeWeichert: boolean;
  skipped: ReadonlySet<number>;
};

export type SendPick = { company: StgCompany; contact: StgContact };
export type SendList = {
  picks: SendPick[];
  total: number;
  excluded: Record<string, number>;
};

const FREE_MAIL =
  /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|btinternet|sky|talktalk|virginmedia)\./i;
const GENERIC_BOX =
  /^(info|hello|admin|sales|enquiries|enquiry|studio|contact|office|team|support|press|hi|mail|accounts|orders|customer|service)$/i;
const NOT_A_BRAND = /sourcing agent|not a brand|agency/i;
const HOLD_STATES = ["skip", "startup", "do not approach"];

/** Lower-case, drop +tag, drop dots in the local part. */
export const normaliseEmail = (email: string): string => {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0].replace(/\./g, "")}@${domain}`;
};

export const addWorkingDays = (from: Date, days: number): Date => {
  const date = new Date(from);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return date;
};

export const buildSendList = (
  data: {
    companies: StgCompany[];
    contacts: StgContact[];
    bounces: BounceRow[];
    rules: SupplierRule[];
    sendLog: SendLogRow[];
  },
  options: SendListOptions,
): SendList => {
  const excluded: Record<string, number> = {};
  const exclude = (reason: string) => {
    excluded[reason] = (excluded[reason] ?? 0) + 1;
  };
  const dead = new Set(
    data.bounces
      .filter((b) => !/^blocked by/i.test(b.kind ?? ""))
      .map((b) => b.email_norm),
  );
  const monthAgo = Date.now() - 30 * 864e5;
  const recentlyLogged = new Set(
    data.sendLog
      .filter((s) => new Date(s.sent_at).getTime() > monthAgo)
      .map((s) => s.email_norm),
  );
  const loggedCompanies = new Set(data.sendLog.map((s) => s.company));
  const protectedByName = new Map(
    data.rules
      .filter(
        (r) => r.supplier_id == null || r.supplier_id === options.supplier.id,
      )
      .map((r) => [r.company.toLowerCase(), r.rule]),
  );
  const contactsByCompany = new Map<string, StgContact[]>();
  data.contacts.forEach((c) =>
    contactsByCompany.set(c.company, [
      ...(contactsByCompany.get(c.company) ?? []),
      c,
    ]),
  );
  const isUnitex = /unitex/i.test(options.supplier.name);

  const picks: (SendPick & { score: number })[] = [];
  for (const company of data.companies) {
    if (company.list_tab !== "Companies") continue;
    const tier = company.tier ?? "";
    if (!options.tiers[tier]) {
      exclude("Tier not selected");
      continue;
    }
    if (HOLD_STATES.includes(company.review_status ?? "")) {
      exclude("You marked it skip / start-up / do not approach");
      continue;
    }
    const rule = protectedByName.get(company.company.toLowerCase());
    if (rule) {
      exclude(`Supplier rule: ${rule.replace("_", " ")}`);
      continue;
    }
    if (NOT_A_BRAND.test(company.size_note ?? "")) {
      exclude("Agent / not a brand");
      continue;
    }
    if (!options.includeWeichert && company.weichert_customer === "Y") {
      exclude("Weichert customer");
      continue;
    }
    const contacts = contactsByCompany.get(company.company) ?? [];
    const approached =
      Number(company.contacts_emailed) > 0 ||
      contacts.some((c) => c.already_emailed) ||
      loggedCompanies.has(company.company);
    if (!options.includeApproached && approached) {
      exclude("Company already approached");
      continue;
    }
    const clean = contacts
      .filter((c) => /^OK/.test(c.action ?? "") && c.email)
      .filter((c) => {
        const [local, domain = ""] = (c.email ?? "").split("@");
        return !(
          FREE_MAIL.test(`${domain}.`) ||
          GENERIC_BOX.test(local) ||
          dead.has(c.email_norm) ||
          recentlyLogged.has(c.email_norm) ||
          (!options.includeApproached && c.already_emailed)
        );
      })
      .sort(
        (a, b) =>
          Number(/recent/.test(b.action ?? "")) -
          Number(/recent/.test(a.action ?? "")),
      );
    const contact = clean.find((c) => !options.skipped.has(c.id));
    if (!contact) {
      exclude("No clean contact (left, bounced, held, free-mail or generic)");
      continue;
    }
    const unitexLinked =
      isUnitex &&
      (/Unitex/i.test(company.sources ?? "") ||
        company.unitex_customer === "Y");
    const tierScore =
      ({ A: 0, B: 1, C: 2 } as Record<string, number>)[tier] ?? 3;
    picks.push({
      company,
      contact,
      score:
        (unitexLinked ? 0 : 4) +
        (/lower fit/i.test(company.size_note ?? "") ? 2 : 0) +
        tierScore -
        (company.growth_flag === "Y" ? 0.5 : 0),
    });
  }
  picks.sort(
    (a, b) =>
      a.score - b.score || a.company.company.localeCompare(b.company.company),
  );
  return {
    picks: picks.slice(0, options.count).map(({ company, contact }) => ({
      company,
      contact,
    })),
    total: picks.length,
    excluded,
  };
};

const REFERENCES: Record<string, string> = {
  Athleisure: "Skims, Gymshark and Oysho",
  Casual: "Calvin Klein and Bosideng",
  Golf: "Descente and Mizuno",
};
export const SECTORS = Object.keys(REFERENCES);
const ASKS: Record<string, string> = {
  Visit:
    "Could I bring a selection of fabrics to you and take 20 minutes to let you feel the difference?",
  Email:
    "Could I send a selection of headers and book 20 minutes, in person or on video, to talk you through them?",
};
export const MODES = Object.keys(ASKS);

export const fillTemplate = (
  template: string,
  values: { firstName: string; brand: string; sector: string; mode: string },
): string =>
  template
    .split("{First Name}")
    .join(values.firstName)
    .split("{Brand}")
    .join(values.brand)
    .split("{References}")
    .join(REFERENCES[values.sector] ?? "")
    .split("{Ask}")
    .join(ASKS[values.mode] ?? "");

export const gmailComposeUrl = (
  to: string,
  subject: string,
  body: string,
): string =>
  `https://mail.google.com/mail/?authuser=bradley@marmontmaterial.com&view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const buildDraftUrl = (
  supplier: Supplier,
  pick: { brand: string; name: string | null; email: string },
  sector: string,
  mode: string,
): string => {
  const values = {
    firstName: (pick.name ?? "").split(" ")[0] || "there",
    brand: pick.brand,
    sector,
    mode,
  };
  return gmailComposeUrl(
    pick.email,
    fillTemplate(supplier.subject_template ?? "", values),
    fillTemplate(supplier.body_template ?? "", values),
  );
};

export const chaseDraftUrl = (
  supplier: Supplier,
  to: string,
  name: string | null,
): string => {
  const first = (name ?? "").split(" ")[0] || "there";
  return gmailComposeUrl(
    to,
    `Re: ${supplier.subject_template ?? ""}`,
    `Hi ${first}, a quick nudge on my note below. It is easiest to understand by feeling the fabric, so I would love 20 minutes with the samples.\n\nBradley\n\nBradley Rose\nMarmont Material x Weichert\nPrincipal\n+44 7989 470748 | bradley@marmontmaterial.com`,
  );
};

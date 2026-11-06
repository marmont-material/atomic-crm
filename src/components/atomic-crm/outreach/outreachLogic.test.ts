import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  buildSendList,
  normaliseEmail,
  type StgCompany,
  type StgContact,
} from "./outreachLogic";

const company = (over: Partial<StgCompany>): StgCompany => ({
  id: 1,
  company: "Acme",
  list_tab: "Companies",
  sources: null,
  weichert_customer: null,
  unitex_customer: null,
  tier: "A",
  growth_flag: null,
  size_note: null,
  strategy_remark: null,
  brand_turnover: null,
  target_2027: null,
  group_name: null,
  review_status: "to review",
  contacts_emailed: null,
  crm_company_id: null,
  ...over,
});
const contact = (over: Partial<StgContact>): StgContact => ({
  id: 1,
  company: "Acme",
  name: "Jo Bloggs",
  email: "jo@acme.com",
  email_norm: "jo@acme.com",
  action: "OK - not recently tested",
  already_emailed: null,
  crm_contact_id: 10,
  ...over,
});
const options = {
  supplier: { id: 1, name: "Unitex", subject_template: "", body_template: "" },
  count: 10,
  tiers: { A: true, B: true, C: true, "": true },
  includeApproached: false,
  includeWeichert: true,
  skipped: new Set<number>(),
};
const empty = { bounces: [], rules: [], sendLog: [] };

describe("buildSendList", () => {
  it("picks a clean contact for an unapproached company", () => {
    const result = buildSendList(
      { ...empty, companies: [company({})], contacts: [contact({})] },
      options,
    );
    expect(result.picks.map((p) => p.contact.email)).toEqual(["jo@acme.com"]);
  });

  it("never picks a bounced address even if the contact says OK", () => {
    const result = buildSendList(
      {
        ...empty,
        bounces: [{ email_norm: "jo@acme.com", kind: "not found (dead)" }],
        companies: [company({})],
        contacts: [contact({})],
      },
      options,
    );
    expect(result.picks).toHaveLength(0);
  });

  it("keeps a company out when the supplier protects it", () => {
    const result = buildSendList(
      {
        ...empty,
        rules: [{ supplier_id: 1, company: "Acme", rule: "protected" }],
        companies: [company({})],
        contacts: [contact({})],
      },
      options,
    );
    expect(result.picks).toHaveLength(0);
    expect(Object.keys(result.excluded)[0]).toMatch(/protected/);
  });

  it("skips free-mail, generic and guessed addresses", () => {
    const result = buildSendList(
      {
        ...empty,
        companies: [company({})],
        contacts: [
          contact({ id: 1, email: "jo@gmail.com", email_norm: "jo@gmail.com" }),
          contact({
            id: 2,
            email: "info@acme.com",
            email_norm: "info@acme.com",
          }),
          contact({ id: 3, action: "CHECK - address is a guess" }),
        ],
      },
      options,
    );
    expect(result.picks).toHaveLength(0);
  });
});

describe("normaliseEmail", () => {
  it("drops dots and plus tags in the local part only", () => {
    expect(normaliseEmail("Jo.Bloggs+x@Acme.co.uk")).toBe(
      "jobloggs@acme.co.uk",
    );
  });
});

describe("addWorkingDays", () => {
  it("skips the weekend when counting four working days (Friday to Thursday)", () => {
    const friday = new Date(2026, 10, 6);
    expect(addWorkingDays(friday, 4).getDay()).toBe(4);
  });
});

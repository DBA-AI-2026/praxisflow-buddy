// Offline: Zuordnungsregeln von capture-lead, ohne DB, ohne Lead-Anlage.
import { describe, it, expect } from "vitest";
import { decideAssignment } from "../../supabase/functions/capture-lead/assignmentPolicy";

const CALLER = "c0000000-0000-0000-0000-000000000001";
const AD = "a0000000-0000-0000-0000-000000000001";
const SP = "s0000000-0000-0000-0000-000000000001";
const TG = "t0000000-0000-0000-0000-000000000001";
const targets = { [AD]: ["user"], [SP]: ["sales_partner"], [TG]: ["tippgeber"] };
const body = { assigned_to: AD, vermittler_id: SP, tippgeber_id: TG };
const run = (callerId: string | null, callerRoles: string[], b: Record<string, unknown> = body) =>
  decideAssignment({ callerId, callerRoles, body: b, targetRoles: targets });

describe("capture-lead assignment policy", () => {
  it("anonymous caller: body ignored completely", () => {
    expect(run(null, [])).toMatchObject({ manualAssignedTo: null, vermittlerId: null, tippgeberId: null, callerHasInternalRole: false });
  });
  it("admin and sales_lead may set valid vermittler and tippgeber", () => {
    for (const role of ["admin", "sales_lead"]) {
      expect(run(CALLER, [role])).toMatchObject({ manualAssignedTo: AD, vermittlerId: SP, tippgeberId: TG });
    }
  });
  it("internal user/regional_lead cannot set vermittler or tippgeber", () => {
    for (const role of ["user", "regional_lead"]) {
      expect(run(CALLER, [role])).toMatchObject({ manualAssignedTo: AD, vermittlerId: null, tippgeberId: null });
    }
  });
  it("external partner is stamped as own vermittler, body ignored", () => {
    expect(run(CALLER, ["sales_partner"])).toMatchObject({ manualAssignedTo: null, vermittlerId: CALLER, tippgeberId: null, callerIsExternalPartner: true });
  });
  it("invalid targets fall back to NULL / PLZ", () => {
    const wrong = { assigned_to: SP, vermittler_id: TG, tippgeber_id: SP };
    expect(run(CALLER, ["admin"], wrong)).toMatchObject({ manualAssignedTo: null, vermittlerId: null, tippgeberId: null });
  });
  it("sales_partner and admin are not valid AD targets", () => {
    const t = { ...targets, [AD]: ["admin", "sales_partner"] };
    expect(decideAssignment({ callerId: CALLER, callerRoles: ["admin"], body, targetRoles: t }).manualAssignedTo).toBeNull();
  });
  it("creator fallback only for callers with an internal role", () => {
    expect(run(CALLER, ["tippgeber"]).callerHasInternalRole).toBe(false);
    expect(run(CALLER, []).callerHasInternalRole).toBe(false);
    expect(run(CALLER, ["user"]).callerHasInternalRole).toBe(true);
  });
});

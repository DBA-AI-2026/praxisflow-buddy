// Reine Entscheidungslogik für Zuordnungsfelder in capture-lead (ohne DB/Netz).
// Rollen werden vorher geladen und hier nur ausgewertet, damit die Regeln offline testbar sind.

export const INTERNAL_ROLES = ["user", "regional_lead", "sales_lead", "admin"];
export const AD_TARGET_ROLES = ["user", "regional_lead", "sales_lead"];

export interface AssignmentInput {
  callerId: string | null;
  callerRoles: string[];
  body: { assigned_to?: unknown; vermittler_id?: unknown; tippgeber_id?: unknown };
  /** Aktive Rollen je im Body genannter Ziel-ID. */
  targetRoles: Record<string, string[]>;
}

export interface AssignmentDecision {
  callerIsExternalPartner: boolean;
  callerHasInternalRole: boolean;
  manualAssignedTo: string | null;
  vermittlerId: string | null;
  tippgeberId: string | null;
}

const asId = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function bodyTargetIds(body: AssignmentInput["body"]): string[] {
  return [asId(body.assigned_to), asId(body.vermittler_id), asId(body.tippgeber_id)].filter(
    (v): v is string => !!v,
  );
}

export function decideAssignment(input: AssignmentInput): AssignmentDecision {
  const { callerId, callerRoles, body, targetRoles } = input;
  const authenticated = !!callerId;
  const callerHasInternalRole = authenticated && callerRoles.some((r) => INTERNAL_ROLES.includes(r));
  const callerIsExternalPartner = authenticated && callerRoles.includes("sales_partner") && !callerHasInternalRole;
  const callerIsPrivileged = authenticated && (callerRoles.includes("admin") || callerRoles.includes("sales_lead"));
  const has = (id: string | null, roles: string[]) => !!id && (targetRoles[id] || []).some((r) => roles.includes(r));

  // assigned_to: anonym/extern immer ignorieren; intern nur bei gültigem AD-Ziel.
  const bodyAd = asId(body.assigned_to);
  const manualAssignedTo = callerHasInternalRole && has(bodyAd, AD_TARGET_ROLES) ? bodyAd : null;

  // Vermittler: externer Partner = eigene ID; Admin/Vertriebsleitung = gültiger sales_partner aus dem Body.
  const bodyVermittler = asId(body.vermittler_id);
  const vermittlerId = callerIsExternalPartner
    ? callerId
    : callerIsPrivileged && has(bodyVermittler, ["sales_partner"]) ? bodyVermittler : null;

  // Tippgeber: nur Admin/Vertriebsleitung mit gültigem aktivem Tippgeber.
  const bodyTipp = asId(body.tippgeber_id);
  const tippgeberId = callerIsPrivileged && has(bodyTipp, ["tippgeber"]) ? bodyTipp : null;

  return { callerIsExternalPartner, callerHasInternalRole, manualAssignedTo, vermittlerId, tippgeberId };
}

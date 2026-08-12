import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export class IntelligenceError extends Error {
  constructor(message, { code = null, evidence = null } = {}) {
    super(message);
    this.name = "IntelligenceError";
    this.code = code;
    this.evidence = evidence;
  }
}

export async function invokeIntelligence(body) {
  const { data, error } = await supabase.functions.invoke("presence-intelligence", {
    body,
  });

  if (!error) return data;

  let detail = null;
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      detail = await error.context.json();
    } catch {
      detail = null;
    }
  }

  throw new IntelligenceError(
    detail?.error || "Presence Intelligence is unavailable. Try again in a moment.",
    { code: detail?.code, evidence: detail?.evidence },
  );
}

export function generateAttendanceBrief({ from, to, scope, departmentId, userId }) {
  return invokeIntelligence({
    mode: "report",
    from,
    to,
    scope,
    departmentId: scope === "department" ? departmentId : undefined,
    userId: scope === "individual" ? userId : undefined,
  });
}

export function getReportCapabilities() {
  return invokeIntelligence({ mode: "capabilities" });
}

export function getReportEvidence({ from, to, scope, departmentId, userId }) {
  return invokeIntelligence({
    mode: "evidence",
    from,
    to,
    scope,
    departmentId: scope === "department" ? departmentId : undefined,
    userId: scope === "individual" ? userId : undefined,
  });
}

export function requestReportAccess(requestNote) {
  return invokeIntelligence({ mode: "request_access", requestNote });
}

export function decideReportAccess({ authorityId, decision, decisionNote, expiresAt }) {
  return invokeIntelligence({ mode: "decide_access", authorityId, decision, decisionNote, expiresAt });
}

export function revokeReportAccess(authorityId) {
  return invokeIntelligence({ mode: "revoke_access", authorityId });
}

export function requestAbsence({ from, to, category, reason }) {
  return invokeIntelligence({
    mode: "request_absence",
    absenceFrom: from,
    absenceTo: to,
    absenceCategory: category,
    absenceReason: reason,
  });
}

export function decideAbsence({ absenceId, decision, decisionNote }) {
  return invokeIntelligence({
    mode: "decide_absence",
    absenceId,
    absenceDecision: decision,
    decisionNote,
  });
}

export function askPresenceIntelligence({ messages, from, to, scope, departmentId, userId }) {
  return invokeIntelligence({
    mode: "chat",
    messages,
    from,
    to,
    scope,
    departmentId: scope === "department" ? departmentId : undefined,
    userId: scope === "individual" ? userId : undefined,
  });
}

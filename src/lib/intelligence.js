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

async function invokeIntelligence(body) {
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

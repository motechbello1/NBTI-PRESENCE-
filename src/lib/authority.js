const AUTHORITY = {
  super_admin: { kind: "super", label: "Developer super admin" },
  dg: { kind: "dg", label: "Director-General" },
  director: { kind: "head", label: "Director" },
  hod: { kind: "head", label: "Head of department" },
};

export function gradeLevelNumber(value) {
  if (!value) return null;
  const matches = String(value).match(/\d{1,2}/g);
  if (!matches?.length) return null;
  const level = Number(matches[matches.length - 1]);
  return Number.isInteger(level) && level >= 1 && level <= 17 ? level : null;
}

export function authorityBadgeFor(profile) {
  const explicit = AUTHORITY[profile?.authority_level];
  if (explicit) return explicit;
  const level = gradeLevelNumber(profile?.grade_level);
  return level !== null && level >= 7 ? { kind: "senior", label: "Senior staff" } : null;
}

export function isSuperAdmin(profile) {
  // Until Issue #1 adds scoped authorities, the existing unrestricted
  // administrator is the developer super-admin account.
  return profile?.authority_level === "super_admin" || (profile?.role === "admin" && !profile?.authority_level);
}

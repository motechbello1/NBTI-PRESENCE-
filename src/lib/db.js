import { supabase } from "./supabase";

const today = () => new Date().toISOString().slice(0, 10);

/* ── SETTINGS ─────────────────────────────────────────── */

export async function getSettings() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

export async function saveSettings(patch) {
  const { data, error } = await supabase
    .from("settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ── PROFILES ─────────────────────────────────────────── */

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, departments(id, name, code)")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function listStaff({ departmentId = null, search = "" } = {}) {
  let q = supabase
    .from("profiles")
    .select("*, departments(id, name, code)")
    .order("full_name");
  if (departmentId) q = q.eq("department_id", departmentId);
  if (search) q = q.or(`full_name.ilike.%${search}%,staff_id.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, patch) {
  const { data, error } = await supabase
    .from("profiles").update(patch).eq("id", userId).select().single();
  if (error) throw error;
  return data;
}

export async function listDepartments() {
  const { data, error } = await supabase.from("departments").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function createDepartment(input) {
  const { data, error } = await supabase.from("departments").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateDepartment(departmentId, patch) {
  const { data, error } = await supabase.from("departments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", departmentId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDepartment(departmentId) {
  const { error } = await supabase.from("departments").delete().eq("id", departmentId);
  if (error) throw error;
}

/* ── NOTIFICATIONS ───────────────────────────────────── */

export async function listMyNotifications(userId, limit = 20) {
  const { data, error } = await supabase.from("notifications")
    .select("id, title, body, category, action_url, read_at, created_at")
    .eq("recipient_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase.from("notifications")
    .update({ read_at: new Date().toISOString() }).eq("id", notificationId);
  if (error) throw error;
}

/* ── FACE ENROLMENT ───────────────────────────────────── */

export async function saveEnrolment(userId, rows) {
  const { error } = await supabase.from("face_enrollments").insert(
    rows.map((r) => ({
      user_id: userId,
      descriptor: Array.from(r.descriptor),
      quality: r.quality,
      pose_label: r.pose,
    }))
  );
  if (error) throw error;
  await updateProfile(userId, { face_enrolled: true });
}

export async function getMyEnrolments(userId) {
  const { data, error } = await supabase
    .from("face_enrollments")
    .select("id, user_id, descriptor, quality, pose_label")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return data;
}

export async function clearEnrolment(userId) {
  const { error } = await supabase.from("face_enrollments").delete().eq("user_id", userId);
  if (error) throw error;
  await updateProfile(userId, { face_enrolled: false });
}

/* ── ATTENDANCE ───────────────────────────────────────── */

export async function getTodayRecord(userId) {
  const { data, error } = await supabase
    .from("attendance").select("*")
    .eq("user_id", userId).eq("work_date", today())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function signIn(userId, payload, settings) {
  const now = new Date();
  const [h, m] = settings.work_start.split(":").map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(h, m + settings.grace_minutes, 0, 0);
  const late = now > cutoff;

  const row = {
    user_id: userId,
    work_date: today(),
    sign_in_at: now.toISOString(),
    sign_in_lat: payload.lat,
    sign_in_lng: payload.lng,
    sign_in_accuracy: payload.accuracy,
    sign_in_distance_m: payload.distance,
    sign_in_liveness: payload.liveness,
    sign_in_match_distance: payload.matchDistance,
    device_fingerprint: payload.fingerprint,
    status: late ? "late" : "present",
    late_reason: late ? payload.reason || null : null,
  };

  const { data, error } = await supabase
    .from("attendance").upsert(row, { onConflict: "user_id,work_date" })
    .select().single();
  if (error) throw error;
  return data;
}

export async function signOut(userId, payload, settings) {
  const existing = await getTodayRecord(userId);
  if (!existing?.sign_in_at) throw new Error("There is no sign-in on record for today.");

  const now = new Date();
  const hours = (now - new Date(existing.sign_in_at)) / 3600000;

  const [eh, em] = settings.work_end.split(":").map(Number);
  const endOfDay = new Date(now);
  endOfDay.setHours(eh, em, 0, 0);
  const early = now < endOfDay || hours < settings.min_hours;

  const { data, error } = await supabase
    .from("attendance")
    .update({
      sign_out_at: now.toISOString(),
      sign_out_lat: payload.lat,
      sign_out_lng: payload.lng,
      sign_out_distance_m: payload.distance,
      hours_worked: Number(hours.toFixed(2)),
      early_departure: early,
      early_reason: early ? payload.reason || null : null,
    })
    .eq("id", existing.id).select().single();
  if (error) throw error;
  return data;
}

export async function myHistory(userId, range = 60) {
  const legacyFrom = typeof range === "number"
    ? new Date(Date.now() - range * 86400000).toISOString().slice(0, 10)
    : null;
  const from = legacyFrom || range?.from;
  const to = typeof range === "object" ? range?.to : null;

  let query = supabase
    .from("attendance").select("*")
    .eq("user_id", userId)
    .order("work_date", { ascending: false });
  if (from) query = query.gte("work_date", from);
  if (to) query = query.lte("work_date", to);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Same-device check: has this handset already signed anyone else in today?
 *
 * This has to go through a server function. Row level security stops a member
 * of staff reading anyone else's attendance, which is right, but it also means
 * a direct query here would return nothing every time and the check would
 * silently never fire. The function answers the count on the server without
 * revealing whose records they are.
 */
export async function sharedDeviceCount(fingerprint) {
  const { data, error } = await supabase.rpc("shared_device_count", { fp: fingerprint });
  if (error) { console.error("Shared device check failed:", error); return 0; }
  return data || 0;
}

/* ── ADMIN: ATTENDANCE MANAGEMENT ─────────────────────── */

export async function reportRows({ from, to, departmentId = null, userId = null }) {
  let q = supabase
    .from("attendance_report").select("*")
    .gte("work_date", from).lte("work_date", to)
    .order("work_date", { ascending: false });
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  if (!departmentId) return data;

  const staff = await listStaff({ departmentId });
  const ids = new Set(staff.map((s) => s.id));
  return data.filter((r) => ids.has(r.user_id));
}

export async function adminMarkAttendance(adminId, userId, workDate, patch) {
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      { user_id: userId, work_date: workDate, marked_by: adminId, ...patch },
      { onConflict: "user_id,work_date" }
    )
    .select().single();
  if (error) throw error;
  await writeAudit(adminId, "attendance.mark", userId, { workDate, patch });
  return data;
}

export async function adminDeleteAttendance(adminId, recordId) {
  const { error } = await supabase.from("attendance").delete().eq("id", recordId);
  if (error) throw error;
  await writeAudit(adminId, "attendance.delete", recordId, {});
}

/* ── SECURITY FLAGS ───────────────────────────────────── */

export async function raiseFlag({
  userId, matchedUserId = null, flagType, severity = "high",
  detail = {}, fingerprint = null, lat = null, lng = null, evidenceBlob = null,
}) {
  let evidencePath = null;
  let evidenceUploadError = null;

  if (evidenceBlob) {
    // The storage policy requires the first folder to be the uploader's own id,
    // so nobody can write frames into another person's incident history.
    const { data: auth } = await supabase.auth.getUser();
    const folder = auth?.user?.id || userId;
    const path = `${folder}/${Date.now()}-${flagType}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("evidence").upload(path, evidenceBlob, { contentType: "image/jpeg", upsert: false });
    if (!upErr) evidencePath = path;
    else evidenceUploadError = upErr.message;
  }

  const { data, error } = await supabase.from("security_flags").insert({
    user_id: userId,
    matched_user_id: matchedUserId,
    flag_type: flagType,
    severity,
    evidence_path: evidencePath,
    detail: evidenceUploadError ? { ...detail, evidence_upload_error: evidenceUploadError } : detail,
    device_fingerprint: fingerprint,
    lat, lng,
    user_agent: navigator.userAgent,
  }).select().single();

  if (error) throw error;
  return data;
}

export async function listFlags({ resolved = null, limit = 200 } = {}) {
  let q = supabase
    .from("security_flags")
    .select("*, profiles!security_flags_user_id_fkey(full_name, staff_id, department_id)")
    .order("created_at", { ascending: false }).limit(limit);
  if (resolved !== null) q = q.eq("resolved", resolved);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function resolveFlag(adminId, flagId, note) {
  const { error } = await supabase.from("security_flags")
    .update({ resolved: true, resolved_by: adminId, resolution_note: note })
    .eq("id", flagId);
  if (error) throw error;
  await writeAudit(adminId, "flag.resolve", flagId, { note });
}

export async function evidenceUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 600);
  if (error) return null;
  return data.signedUrl;
}

/* ── AUDIT ────────────────────────────────────────────── */

export async function writeAudit(actorId, action, target, detail) {
  await supabase.from("audit_log").insert({ actor_id: actorId, action, target: String(target), detail });
}

export async function listAudit(limit = 150) {
  const { data, error } = await supabase
    .from("audit_log").select("*, profiles(full_name)")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

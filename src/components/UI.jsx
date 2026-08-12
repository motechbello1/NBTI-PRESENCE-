import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authorityBadgeFor, isSuperAdmin } from "../lib/authority";

/* ── SHELL ────────────────────────────────────────────── */

const ADMIN_LINKS = [
  ["/admin", "Overview"],
  ["/admin/register", "Register"],
  ["/admin/staff", "Staff"],
  ["/admin/flags", "Incidents"],
  ["/admin/reports", "Reports"],
  ["/admin/settings", "Settings"],
];

const STAFF_LINKS = [
  ["/", "Today"],
  ["/history", "My record"],
  ["/profile", "Profile"],
];

export function Shell({ children }) {
  const { profile, isAdmin, signOutOfApp } = useAuth();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = isAdmin ? ADMIN_LINKS : STAFF_LINKS;
  const superAdmin = isSuperAdmin(profile);
  const badge = superAdmin ? { kind: "super", label: "Developer super admin" } : authorityBadgeFor(profile);

  const navigation = (mobile = false) => (
    <nav className={mobile ? "app-mobile-nav" : "app-nav"} aria-label={isAdmin ? "Administration" : "Staff account"}>
      {links.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/" || to === "/admin"}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) => isActive ? "app-nav-link is-active" : "app-nav-link"}
        >
          <span>{label}</span>
          <span className="app-nav-rule" aria-hidden="true" />
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className={`app-shell${superAdmin ? " super-admin-shell" : ""}`} data-authority={superAdmin ? "master" : undefined}>
      <aside className="app-rail">
        <button className="app-home" onClick={() => nav(isAdmin ? "/admin" : "/")} aria-label="NBTI Presence home">
          <Wordmark />
        </button>

        <div className="app-rail-section mono">{isAdmin ? "Administration" : "Staff register"}</div>
        {navigation()}

        <div className="app-identity">
          <div className="app-identity-name">{profile?.full_name}<AuthorityBadge badge={badge} compact /></div>
          <div className="mono app-identity-code">{isAdmin ? "Administrator" : profile?.staff_id || "Staff"}</div>
          <button onClick={signOutOfApp} className="app-sign-out">Sign out</button>
        </div>

        <div className="app-agency mono">National Board for Technology Incubation</div>
      </aside>

      <header className="app-mobile-header">
        <button onClick={() => nav(isAdmin ? "/admin" : "/")} aria-label="NBTI Presence home"><Wordmark compact /></button>
        <button className="app-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="mobile-navigation">
          <span>Menu</span>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </header>

      {menuOpen ? (
        <div className="app-mobile-drawer" id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button className="app-drawer-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
          <div className="app-drawer-panel">
            <div className="app-drawer-head">
              <div className="mono">{isAdmin ? "Administration" : "Staff register"}</div>
              <button onClick={() => setMenuOpen(false)} aria-label="Close navigation">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" /></svg>
              </button>
            </div>
            {navigation(true)}
            <div className="app-drawer-identity">
              <span>{profile?.full_name}<AuthorityBadge badge={badge} compact /></span>
              <span className="mono">{profile?.staff_id || (isAdmin ? "Administrator" : "Staff")}</span>
              <button onClick={signOutOfApp}>Sign out</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="app-stage">
        <main className="app-content">{children}</main>
        <footer className="app-footer mono">NBTI Presence · ICT-managed attendance instrument</footer>
      </div>
    </div>
  );
}

/* ── SEAL ─────────────────────────────────────────────── */
/* A rotated square with a centre dot. Reads as an official stamp
   without being a literal coat of arms. */
export function Seal({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M1.5 8.5v-7h21.8l7.2 7.2v21.8h-29z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M23.3 1.5v7.2h7.2M7.5 12V7.5H12M20 7.5h4.5V12M24.5 20v4.5H20M12 24.5H7.5V20" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="3" fill="var(--bureau)" />
      <path d="M16 11v10M11 16h10" stroke="var(--ledger)" strokeWidth="1" />
    </svg>
  );
}

export function Wordmark({ compact = false }) {
  return (
    <div className="brand-lockup">
      <Seal />
      <div>
        <div className="brand-name">NBTI <span>Presence</span></div>
        {!compact && <div className="brand-agency">National Board for Technology Incubation</div>}
      </div>
    </div>
  );
}

export function AuthorityBadge({ profile, badge: suppliedBadge, compact = false }) {
  const badge = suppliedBadge || authorityBadgeFor(profile);
  if (!badge) return null;
  return (
    <span className={`authority-badge is-${badge.kind}${compact ? " is-compact" : ""}`} title={badge.label} aria-label={badge.label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="authority-badge-shape" d="M12 1.7l2.1 2 2.8-.5.9 2.7 2.7.9-.5 2.8 2 2.1-2 2.1.5 2.8-2.7.9-.9 2.7-2.8-.5-2.1 2-2.1-2-2.8.5-.9-2.7-2.7-.9.5-2.8-2-2.1 2-2.1-.5-2.8 2.7-.9.9-2.7 2.8.5z" />
        <path className="authority-badge-check" d="M7.4 12.1l3 3.1 6.2-6.4" />
      </svg>
      {!compact ? <span>{badge.label}</span> : null}
    </span>
  );
}

export function SecurityRail({ className = "" }) {
  return (
    <svg className={`security-rail ${className}`} viewBox="0 0 36 360" preserveAspectRatio="none" aria-hidden="true">
      <path d="M18 0C3 18 33 36 18 54S3 90 18 108s15 36 0 54-15 36 0 54 15 36 0 54-15 36 0 54 15 36 0 54" />
      <path d="M18 0c15 18-15 36 0 54s15 36 0 54-15 36 0 54 15 36 0 54-15 36 0 54 15 36 0 54-15 36 0 54" />
      <path d="M7 0c22 22 22 32 0 54s-22 32 0 54 22 32 0 54-22 32 0 54 22 32 0 54-22 32 0 54 22 32 0 54" />
      <path d="M29 0C7 22 7 32 29 54s22 32 0 54-22 32 0 54 22 32 0 54-22 32 0 54 22 32 0 54-22 32 0 54" />
    </svg>
  );
}

export function SplashScreen() {
  return (
    <div className="splash" role="status" aria-label="Starting NBTI Presence">
      <div className="splash-mark"><Seal size={42} /></div>
      <div className="splash-copy">
        <div className="brand-name">NBTI <span>Presence</span></div>
        <div className="mono splash-status">Preparing verification register</div>
      </div>
      <div className="splash-meter" aria-hidden="true"><span /></div>
    </div>
  );
}

/* ── HEADINGS ─────────────────────────────────────────── */

export function PageHead({ eyebrow, title, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-[30px] md:text-[40px]">{title}</h1>
      </div>
      {children}
    </div>
  );
}

/* ── GATE STRIP — the signature element ───────────────── */

export const GATES = [
  { key: "location", label: "Location" },
  { key: "live", label: "Liveness" },
  { key: "device", label: "Surroundings" },
  { key: "identity", label: "Identity" },
];

export function GateStrip({ states }) {
  const text = { pending: "Waiting", active: "Checking", clear: "Cleared", deny: "Refused" };
  return (
    <div className="gate-strip">
      {GATES.map((g, index) => (
        <div key={g.key} className="gate" data-state={states[g.key] || "pending"}>
          <span className="gate-number mono">{String(index + 1).padStart(2, "0")}</span>
          <span className="gate-label">{g.label}</span>
          <span className="gate-state"><i aria-hidden="true" />{text[states[g.key] || "pending"]}</span>
        </div>
      ))}
    </div>
  );
}

/* ── STATS ────────────────────────────────────────────── */

export function Stat({ label, value, sub, tone = "paper" }) {
  const colour = { paper: "text-paper", clear: "text-beam", hold: "text-hold", deny: "text-deny" }[tone];
  return (
    <div className="panel p-4">
      <div className="eyebrow mb-2">{label}</div>
      <div className={`display text-[30px] ${colour}`}>{value}</div>
      {sub && <div className="mono text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

/* ── PILLS ────────────────────────────────────────────── */

export function Pill({ tone = "mute", children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function StatusPill({ status }) {
  const map = {
    present: ["clear", "Present"],
    late: ["hold", "Late"],
    absent: ["deny", "Absent"],
    excused: ["mute", "Excused"],
  };
  const [tone, label] = map[status] || ["mute", status || "No record"];
  return <Pill tone={tone}>{label}</Pill>;
}

/* ── FEEDBACK ─────────────────────────────────────────── */

export function Notice({ tone = "mute", title, children }) {
  const border = {
    clear: "border-l-clear", hold: "border-l-hold",
    deny: "border-l-deny", mute: "border-l-line",
  }[tone];
  return (
    <div className={`panel border-l-2 ${border} p-4 rise`}>
      {title && <div className="display text-[15px] mb-1">{title}</div>}
      <div className="text-[14px] text-muted leading-relaxed">{children}</div>
    </div>
  );
}

export function Spinner({ label = "Working" }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--beam)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="mono text-[12px] uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="panel p-10 text-center">
      <div className="display text-[17px] mb-2">{title}</div>
      <div className="text-[14px] text-muted max-w-sm mx-auto leading-relaxed">{children}</div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { listDepartments } from "../lib/db";
import { Seal, Notice } from "../components/UI";

export default function CreateAccount() {
  const nav = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    full_name: "", staff_id: "", email: "", phone: "",
    department_id: "", password: "", confirm: "",
  });
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { listDepartments().then(setDepartments).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) { setError("The two passwords do not match."); return; }
    if (form.password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    if (!form.department_id) { setError("Choose your department."); return; }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          staff_id: form.staff_id,
          phone: form.phone,
          department_id: form.department_id,
        },
      },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSent(true);
    setTimeout(() => nav("/"), 2500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <Seal size={26} />
          <span className="display text-[17px]">NBTI <span className="text-beam">PRESENCE</span></span>
        </div>

        <div className="eyebrow mb-2">New staff record</div>
        <h2 className="display text-[30px] mb-2">Create your account</h2>
        <p className="text-[14px] text-muted mb-7 leading-relaxed">
          Use your official details. Your face is enrolled separately, from your
          profile, once you are signed in.
        </p>

        {sent ? (
          <Notice tone="clear" title="Account created">
            Check your email if confirmation is required, then sign in and enrol your face.
          </Notice>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full name</label>
                <input className="field" value={form.full_name} onChange={set("full_name")} required />
              </div>
              <div>
                <label className="label">Staff number</label>
                <input className="field" value={form.staff_id} onChange={set("staff_id")}
                       placeholder="NBTI/00000" required />
              </div>
            </div>

            <div>
              <label className="label">Department</label>
              <select className="field" value={form.department_id} onChange={set("department_id")} required>
                <option value="">Select your department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Work email</label>
                <input className="field" type="email" value={form.email} onChange={set("email")} required />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="field" value={form.phone} onChange={set("phone")} placeholder="0800 000 0000" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Password</label>
                <input className="field" type="password" value={form.password} onChange={set("password")} required />
              </div>
              <div>
                <label className="label">Repeat password</label>
                <input className="field" type="password" value={form.confirm} onChange={set("confirm")} required />
              </div>
            </div>

            {error && <div className="text-[13px] text-deny">{error}</div>}

            <button className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Creating" : "Create account"}
            </button>

            <p className="text-[13px] text-muted">
              Already registered? <Link to="/sign-in" className="text-beam hover:underline">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

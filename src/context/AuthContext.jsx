import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getProfile, getSettings } from "../lib/db";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (sess) => {
    if (!sess?.user) { setProfile(null); setLoading(false); return; }
    try {
      const [p, s] = await Promise.all([getProfile(sess.user.id), getSettings()]);
      setProfile(p);
      setSettings(s);
    } catch (e) {
      console.error("Could not load your record:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      hydrate(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setLoading(true);
      hydrate(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, [hydrate]);

  const refresh = useCallback(async () => {
    if (session?.user) setProfile(await getProfile(session.user.id));
  }, [session]);

  const signOutOfApp = () => supabase.auth.signOut();

  return (
    <Ctx.Provider value={{
      session, profile, settings, setSettings, loading,
      isAdmin: profile?.role === "admin",
      refresh, signOutOfApp,
    }}>
      {children}
    </Ctx.Provider>
  );
}

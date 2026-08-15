import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { supabaseConfigured } from "./lib/supabase";
import "./index.css";

function ConfigurationFailure() {
  return (
    <main className="configuration-failure" role="alert">
      <span className="mono">DEPLOYMENT CONFIGURATION</span>
      <h1 className="display">Attendance is temporarily unavailable.</h1>
      <p>The application could not connect to its protected attendance register. ICT needs to restore the public Supabase configuration for this deployment.</p>
      <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Try again</button>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {supabaseConfigured ? (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : <ConfigurationFailure />}
  </React.StrictMode>
);

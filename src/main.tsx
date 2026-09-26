import React from "react";
import ReactDOM from "react-dom/client";
import { firebaseIdentityAdapter } from "./adapters/identity/firebaseIdentity";
import { AuthShell } from "./features/auth/AuthShell";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthShell identity={firebaseIdentityAdapter} />
  </React.StrictMode>,
);

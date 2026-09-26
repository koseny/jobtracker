import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="civilbonus-title">
        <p className="eyebrow">CivilBonus</p>
        <h1 id="civilbonus-title">Engineering baseline</h1>
        <p>
          The Vite + TypeScript + React shell is active. Authentication parity
          is the next migration step before Home Cash Flow feature work.
        </p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

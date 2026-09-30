import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { IdentityUser } from "../../adapters/identity/identity";
import {
  ensureOwnerPreferences,
  setLanguagePreference,
  setThemePreference,
} from "../../application/ownerPreferencesService";
import type {
  LanguageCode,
  OwnerPreferences,
  OwnerPreferencesRepository,
  ThemeMode,
} from "../../domain/ownerPreferences";
import {
  PRIMARY_NAVIGATION,
  shellText,
  type AppDestination,
} from "./appShellModel";
import { HcfShellPreferenceProvider } from "./HcfShellPreferenceContext";
import "./appShell.css";

type Props = {
  user: IdentityUser;
  preferencesRepository: OwnerPreferencesRepository;
  activeDestination: AppDestination;
  onNavigate: (destination: AppDestination) => void;
  onSignOut: () => Promise<void>;
  children: ReactNode;
  focusMode?: "NONE" | "CALENDAR";
};

function languageTag(language: LanguageCode): string {
  switch (language) {
    case "HU": return "hu";
    case "DE": return "de";
    case "EN": return "en";
  }
}

export function HcfAppShell({
  user,
  preferencesRepository,
  activeDestination,
  onNavigate,
  onSignOut,
  children,
  focusMode = "NONE",
}: Props) {
  const [preferences, setPreferences] = useState<OwnerPreferences | null>(null);
  const [preferenceError, setPreferenceError] = useState("");
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusRailExpanded, setFocusRailExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    setPreferences(null);
    setPreferenceError("");

    ensureOwnerPreferences(
      preferencesRepository,
      user.id,
      new Date().toISOString(),
    )
      .then(result => {
        if (active) setPreferences(result);
      })
      .catch(cause => {
        console.error(cause);
        if (active) setPreferenceError("Preferences could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [preferencesRepository, user.id]);

  const language = preferences?.language ?? "EN";
  const theme = preferences?.theme ?? "LIGHT";
  const activeLabel = useMemo(
    () => shellText(language, activeDestination),
    [activeDestination, language],
  );

  async function updateLanguage(next: LanguageCode) {
    if (!preferences || preferenceBusy || next === preferences.language) return;
    setPreferenceBusy(true);
    setPreferenceError("");
    try {
      const updated = await setLanguagePreference(
        preferencesRepository,
        preferences,
        next,
        new Date().toISOString(),
      );
      setPreferences(updated);
    } catch (cause) {
      console.error(cause);
      setPreferenceError(shellText(language, "preferencesError"));
    } finally {
      setPreferenceBusy(false);
    }
  }

  async function updateTheme(next: ThemeMode) {
    if (!preferences || preferenceBusy || next === preferences.theme) return;
    setPreferenceBusy(true);
    setPreferenceError("");
    try {
      const updated = await setThemePreference(
        preferencesRepository,
        preferences,
        next,
        new Date().toISOString(),
      );
      setPreferences(updated);
    } catch (cause) {
      console.error(cause);
      setPreferenceError(shellText(language, "preferencesError"));
    } finally {
      setPreferenceBusy(false);
    }
  }

  function navigate(destination: AppDestination) {
    setDrawerOpen(false);
    onNavigate(destination);
  }

  const focusRail = focusMode === "CALENDAR";
  const railExpanded = focusRail && focusRailExpanded;

  return (
    <HcfShellPreferenceProvider value={{ language, theme }}>
    <div
      className={[
        "hcf-app-shell",
        focusRail ? "hcf-app-shell--focus-rail" : "",
        railExpanded ? "hcf-app-shell--focus-expanded" : "",
      ].filter(Boolean).join(" ")}
      data-theme={theme.toLowerCase()}
      lang={languageTag(language)}
    >
      <header className="hcf-mobile-header">
        <button
          className="hcf-icon-button hcf-mobile-menu-button"
          type="button"
          aria-label={shellText(language, drawerOpen ? "closeMenu" : "menu")}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(open => !open)}
        >
          {drawerOpen ? "×" : "☰"}
        </button>
        <strong>{activeLabel}</strong>
      </header>

      {drawerOpen && (
        <button
          className="hcf-drawer-scrim"
          type="button"
          aria-label={shellText(language, "closeMenu")}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        className={[
          "hcf-sidebar",
          drawerOpen ? "hcf-sidebar--drawer-open" : "",
        ].filter(Boolean).join(" ")}
        aria-label={shellText(language, "navigation")}
      >
        <div className="hcf-brand-block">
          <div className="hcf-brand-mark" aria-hidden="true">H</div>
          <div className="hcf-brand-copy">
            <strong>{shellText(language, "appName")}</strong>
            <span>CivilBonus</span>
          </div>
        </div>

        {focusRail && (
          <button
            className="hcf-rail-toggle"
            type="button"
            onClick={() => setFocusRailExpanded(expanded => !expanded)}
            aria-label={railExpanded ? "Collapse navigation rail" : "Expand navigation rail"}
            aria-expanded={railExpanded}
          >
            {railExpanded ? "‹" : "›"}
          </button>
        )}

        <nav className="hcf-nav">
          {PRIMARY_NAVIGATION.map(item => {
            const label = shellText(language, item.id);
            const active = item.id === activeDestination;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? "hcf-nav-item hcf-nav-item--active" : "hcf-nav-item"}
                aria-current={active ? "page" : undefined}
                title={label}
                onClick={() => navigate(item.id)}
              >
                <span className="hcf-nav-symbol" aria-hidden="true">{item.symbol}</span>
                <span className="hcf-nav-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hcf-user-block">
          {user.photoUrl ? (
            <img className="hcf-user-avatar" src={user.photoUrl} alt="" />
          ) : (
            <div className="hcf-user-avatar hcf-user-avatar--fallback" aria-hidden="true">
              {(user.displayName || user.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="hcf-user-copy">
            <strong>{user.displayName || "Google user"}</strong>
            <span>{user.email || ""}</span>
          </div>
          <button
            className="hcf-signout-button"
            type="button"
            onClick={() => void onSignOut()}
          >
            {shellText(language, "signOut")}
          </button>
        </div>
      </aside>

      <section className="hcf-main-column">
        <header className="hcf-global-header">
          <div>
            <div className="hcf-header-eyebrow">{shellText(language, "appName")}</div>
            <h1>{activeLabel}</h1>
          </div>

          <div className="hcf-preference-controls">
            <label>
              <span>{shellText(language, "language")}</span>
              <select
                value={language}
                disabled={!preferences || preferenceBusy}
                onChange={event => void updateLanguage(event.target.value as LanguageCode)}
              >
                <option value="HU">HU</option>
                <option value="EN">EN</option>
                <option value="DE">DE</option>
              </select>
            </label>

            <label>
              <span>{shellText(language, "theme")}</span>
              <select
                value={theme}
                disabled={!preferences || preferenceBusy}
                onChange={event => void updateTheme(event.target.value as ThemeMode)}
              >
                <option value="LIGHT">{shellText(language, "light")}</option>
                <option value="DARK">{shellText(language, "dark")}</option>
              </select>
            </label>
          </div>
        </header>

        {preferenceError && (
          <p className="hcf-preference-error" role="alert">{preferenceError}</p>
        )}
        {!preferences && !preferenceError && (
          <p className="hcf-preference-loading" aria-live="polite">
            {shellText(language, "preferencesLoading")}
          </p>
        )}

        <main className="hcf-workspace">
          {children}
        </main>
      </section>
    </div>
    </HcfShellPreferenceProvider>
  );
}

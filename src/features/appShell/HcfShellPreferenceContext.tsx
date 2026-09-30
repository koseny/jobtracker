import { createContext, useContext } from "react";
import type { LanguageCode, ThemeMode } from "../../domain/ownerPreferences";

export interface HcfShellPreferenceContextValue {
  language: LanguageCode;
  theme: ThemeMode;
}

const HcfShellPreferenceContext = createContext<HcfShellPreferenceContextValue>({
  language: "EN",
  theme: "LIGHT",
});

export const HcfShellPreferenceProvider = HcfShellPreferenceContext.Provider;

export function useHcfShellPreferences(): HcfShellPreferenceContextValue {
  return useContext(HcfShellPreferenceContext);
}

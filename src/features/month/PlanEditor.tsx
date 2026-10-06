import { useState, type FormEvent } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import type { CurrencyCode, Money, PlanDirection, PlanItem } from "../../domain/v2/cashFlowV2";
import { parsePlanAmountInput, formatPlanAmountInput } from "./planAmountInput";
import "./planEditor.css";

export type PlanEditorSelection =
  | { kind: "CREATE"; direction: PlanDirection; monthId: string }
  | { kind: "EDIT"; item: PlanItem };

type Props = {
  language: LanguageCode;
  selection: PlanEditorSelection;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (name: string, amount: Money, expectedDate?: string) => void;
  onDetails: (name: string, expectedDate: string | null) => void;
  onAmount: (amount: Money) => void;
  onCancel: () => void;
};

const TEXT = {
  EN: { create: "Add plan item", edit: "Edit plan item", name: "Name", amount: "Planned amount", currency: "Currency", date: "Expected date (optional)", save: "Add item", details: "Save details", revise: "Change amount", cancel: "Cancel plan item", confirm: "Confirm cancellation", keep: "Keep item", close: "Close", invalid: "Enter a name and a valid amount.", month: "Month" },
  HU: { create: "Tervtétel hozzáadása", edit: "Tervtétel szerkesztése", name: "Név", amount: "Tervezett összeg", currency: "Pénznem", date: "Várható dátum (nem kötelező)", save: "Tétel hozzáadása", details: "Adatok mentése", revise: "Összeg módosítása", cancel: "Tervtétel törlése", confirm: "Törlés megerősítése", keep: "Tétel megtartása", close: "Bezárás", invalid: "Adjon meg nevet és érvényes összeget.", month: "Hónap" },
  DE: { create: "Planeintrag hinzufügen", edit: "Planeintrag bearbeiten", name: "Name", amount: "Geplanter Betrag", currency: "Währung", date: "Erwartetes Datum (optional)", save: "Eintrag hinzufügen", details: "Details speichern", revise: "Betrag ändern", cancel: "Planeintrag stornieren", confirm: "Stornierung bestätigen", keep: "Eintrag behalten", close: "Schließen", invalid: "Name und gültigen Betrag eingeben.", month: "Monat" },
} satisfies Record<LanguageCode, Record<string, string>>;

export function PlanEditor({ language, selection, busy, error, onClose, onCreate, onDetails, onAmount, onCancel }: Props) {
  const copy = TEXT[language];
  const item = selection.kind === "EDIT" ? selection.item : null;
  const [name, setName] = useState(item?.name ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(item?.currentPlannedAmount.currencyCode ?? "HUF");
  const [amount, setAmount] = useState(item ? formatPlanAmountInput(item.currentPlannedAmount) : "");
  const [date, setDate] = useState(item?.expectedDate ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const monthId = item?.monthId ?? (selection.kind === "CREATE" ? selection.monthId : "");

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!name.trim()) throw new Error(copy.invalid);
      const parsed = parsePlanAmountInput(amount, currency);
      setInputError(null);
      onCreate(name.trim(), parsed, date || undefined);
    } catch (cause) {
      setInputError(cause instanceof Error ? cause.message : copy.invalid);
    }
  }

  function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !name.trim()) { setInputError(copy.invalid); return; }
    if (name.trim() === item.name && (date || undefined) === item.expectedDate) return;
    setInputError(null);
    onDetails(name.trim(), date || null);
  }

  function submitAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    try {
      const parsed = parsePlanAmountInput(amount, currency);
      if (parsed.amountMinor === item.currentPlannedAmount.amountMinor) return;
      setInputError(null);
      onAmount(parsed);
    } catch (cause) {
      setInputError(cause instanceof Error ? cause.message : copy.invalid);
    }
  }

  return (
    <aside className="hcf-plan-editor" aria-label={item ? copy.edit : copy.create}>
      <header><h2>{item ? copy.edit : copy.create}</h2><button type="button" onClick={onClose} disabled={busy}>{copy.close}</button></header>
      <p>{copy.month}: {monthId} · {selection.kind === "CREATE" ? selection.direction : item?.direction}</p>
      {(inputError || error) && <p role="alert" className="hcf-plan-editor__error">{inputError || error}</p>}
      <form onSubmit={item ? submitDetails : submitCreate}>
        <label>{copy.name}<input autoFocus required maxLength={160} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
        <label>{copy.date}<input type="date" value={date} min={`${monthId}-01`} max={`${monthId}-31`} onChange={event => setDate(event.target.value)} disabled={busy} /></label>
        {!item && <>
          <label>{copy.amount}<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label>
          <label>{copy.currency}<select value={currency} onChange={event => setCurrency(event.target.value as CurrencyCode)} disabled={busy}><option>HUF</option><option>EUR</option></select></label>
        </>}
        <button type="submit" disabled={busy || (item !== null && name.trim() === item.name && (date || undefined) === item.expectedDate)}>{item ? copy.details : copy.save}</button>
      </form>
      {item && <>
        <form onSubmit={submitAmount}>
          <label>{copy.amount} ({currency})<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label>
          <button type="submit" disabled={busy}>{copy.revise}</button>
        </form>
        <div className="hcf-plan-editor__cancel">
          {confirmCancel ? <><button type="button" disabled={busy} onClick={onCancel}>{copy.confirm}</button><button type="button" disabled={busy} onClick={() => setConfirmCancel(false)}>{copy.keep}</button></>
            : <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>{copy.cancel}</button>}
        </div>
      </>}
    </aside>
  );
}

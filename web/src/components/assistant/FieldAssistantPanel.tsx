import type { JSX } from "react";
import { useI18n } from "../../i18n";
import { Sprout } from "../Sprout";

export interface FieldAssistantContext { label: string; lat: number; lon: number; zip?: string; selectedFieldIds?: string[] }
export interface FieldAssistantPanelProps { context: FieldAssistantContext | null; onClose?: () => void; className?: string }

export function FieldAssistantPanel({ context, onClose, className = "" }: FieldAssistantPanelProps): JSX.Element {
  const { text } = useI18n();
  return <aside className={`theme-canopy field-assistant ${className}`} aria-label={text("Field Assistant")}>
    <header><Sprout mood="hello" width={36} decorative /><h2>{text("Field Assistant")}</h2>{onClose && <button type="button" onClick={onClose} aria-label={text("Close")}>×</button>}</header>
    <p>{context ? context.label : text("Enter a ZIP code to load your field context.")}</p>
  </aside>;
}

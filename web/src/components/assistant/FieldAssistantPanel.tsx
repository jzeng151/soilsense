import type { JSX } from "react";
import type { PlanResponse } from "../../../../src/shared/types";
import { FieldAssistantContent } from "./FieldAssistantContent";
import { ScoutSessionProvider, useOptionalScoutSession } from "../../ScoutSession";

export interface FieldAssistantContext { label: string; lat: number; lon: number; zip?: string; selectedFieldIds?: string[] }
export interface FieldAssistantPanelProps { context: FieldAssistantContext | null; onClose?: () => void; className?: string; sharedPlan?: PlanResponse | null }

export function FieldAssistantPanel(props: FieldAssistantPanelProps): JSX.Element {
  const session = useOptionalScoutSession();
  // Standalone embeds still work; the app uses the account-scoped owner above all routes.
  const content = <FieldAssistantContent key={JSON.stringify(props.context)} {...props} />;
  return session ? content : <ScoutSessionProvider ownerId="guest">{content}</ScoutSessionProvider>;
}

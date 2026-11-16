import type { JSX } from "react";
import type { PlanResponse } from "../../../../src/shared/types";
import { FieldAssistantContent } from "./FieldAssistantContent";

export interface FieldAssistantContext { label: string; lat: number; lon: number; zip?: string; selectedFieldIds?: string[] }
export interface FieldAssistantPanelProps { context: FieldAssistantContext | null; onClose?: () => void; className?: string; sharedPlan?: PlanResponse | null }

export function FieldAssistantPanel(props: FieldAssistantPanelProps): JSX.Element {
  // Remount on location/field changes, cancelling the old stream and clearing its context.
  return <FieldAssistantContent key={JSON.stringify(props.context)} {...props} />;
}

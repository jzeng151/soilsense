import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../env";
import { runPrewarm } from "./run";

// Same serializable step adapter convention as POWER refresh; callbacks here return only JSON/void.
interface ConfiguredSteps {
  do<T>(name: string, config: { retries: { limit: number; delay: string; backoff: "exponential" }; timeout: string }, callback: () => Promise<T>): Promise<T>;
}

export class PlanPrewarmWorkflow extends WorkflowEntrypoint<Env> {
  override async run(_event: WorkflowEvent<Record<string, never>>, step: WorkflowStep) {
    return runPrewarm(this.env, { do: (name, callback) => (step as unknown as ConfiguredSteps).do(name, {
      retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "10 minutes",
    }, callback) });
  }
}

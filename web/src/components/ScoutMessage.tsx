// Renders one Scout assistant message from its AI SDK parts:
// reasoning → collapsible "Thinking", tool parts → live analysis steps, text → markdown,
// source parts → a "Sources" list under the answer.

import type { UIMessage } from "ai";
import type { ChatCitationDisplay } from "../../../src/shared/chatResearch";
import { Markdown } from "./Markdown";

type Part = UIMessage["parts"][number];
type ToolPart = Extract<Part, { toolCallId: string }>;
type Obj = Record<string, unknown>;

const TOOL_META: Record<string, { running: string; done: string }> = {
  search_research: { running: "Searching reviewed research", done: "Research search complete" },
  find_location: { running: "Looking up location", done: "Found location" },
  get_field_data: { running: "Reading USDA soil & crop history", done: "Read USDA soil & crop history" },
  build_rotation_plan: { running: "Analyzing 35 years of NASA climate & scoring rotations", done: "Analyzed NASA climate & rotations" },
  get_crop_catalog: { running: "Reading crop catalog", done: "Read crop catalog" },
  get_usage_analytics: { running: "Running usage analytics", done: "Ran usage analytics" },
};

const isTool = (p: Part): p is ToolPart => "toolCallId" in p;
const toolName = (p: ToolPart) => ("toolName" in p && typeof p.toolName === "string" ? p.toolName : p.type.replace(/^tool-/, ""));
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d = 3) => (typeof v === "number" ? Number(v.toFixed(d)) : v);

function describeInput(name: string, input: unknown): string {
  if (name === "search_research") return String(obj(input).question ?? "");
  const i = obj(input);
  switch (name) {
    case "find_location":
      return i.zip ? `ZIP ${String(i.zip)}` : "";
    case "get_field_data":
      return i.lat !== undefined ? `${num(i.lat)}, ${num(i.lon)}` : "";
    case "build_rotation_plan":
      return i.lat !== undefined
        ? [`${num(i.lat)}, ${num(i.lon)}`, i.irrigated ? "irrigated" : "rain-fed", String(i.priority ?? "balanced"), arr(i.recent_crops).length ? `after ${arr(i.recent_crops).join(" → ")}` : ""]
            .filter(Boolean)
            .join(" · ")
        : "";
    case "get_usage_analytics":
      return `last ${String(i.days ?? 30)} days`;
    default:
      return "";
  }
}

function describeOutput(name: string, output: unknown): string {
  if (name === "search_research") {
    const result = obj(output);
    return `${String(result.status)} · ${arr(result.passages).length} passage(s) · ${String(result.reason ?? "")}`;
  }
  const o = obj(output);
  switch (name) {
    case "find_location":
      return `${String(o.place)}, ${String(o.state)} → ${num(o.lat)}, ${num(o.lon)}`;
    case "get_field_data": {
      const county = obj(o.county);
      const soil = obj(o.soil);
      const hist = obj(o.cropHistory);
      return [
        county.countyName ? `${String(county.countyName)}, ${String(county.stateCode)}` : "",
        soil.available ? `soil: ${String(soil.mapUnitName ?? soil.componentName)}` : "no soil survey here",
        `${arr(hist.years).length} years of crop history`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "build_rotation_plan": {
      const ind = arr(obj(o.climate).indicators).map(obj);
      const sig = ind.filter((x) => String(x.verdict).startsWith("significant"));
      const top = obj(arr(o.rankedPlans)[0]);
      return `${ind.length} climate indicators, ${sig.length} significant trend${sig.length === 1 ? "" : "s"} · ${arr(o.rankedPlans).length} rotations ranked${top.label ? ` · top: ${String(top.label)}` : ""}`;
    }
    case "get_crop_catalog":
      return `${arr(o.crops).length} crops, ${arr(o.covers).length} cover crops`;
    case "get_usage_analytics":
      return o.available === false ? "no plan history database" : `${String(o.totalPlans ?? 0)} plans analyzed`;
    default:
      return "";
  }
}

function ToolStep({ part }: { part: ToolPart }) {
  const name = toolName(part);
  const meta = TOOL_META[name] ?? { running: name, done: name };
  const state = part.state;
  const running = state === "input-streaming" || state === "input-available";
  const failed = state === "output-error" || state === "output-denied";
  const detail = state === "output-available" ? describeOutput(name, part.output) : failed && "errorText" in part ? String(part.errorText ?? "") : describeInput(name, part.input);
  return (
    <li className={`an-step ${running ? "run" : failed ? "fail" : "ok"}`}>
      <span className="an-icon" aria-hidden="true">
        {running ? <span className="spin" /> : failed ? "!" : "✓"}
      </span>
      <span className="an-body">
        <span className="an-label">{running ? `${meta.running}…` : meta.done}</span>
        {detail && <span className="an-detail">{detail}</span>}
      </span>
    </li>
  );
}

export function ScoutMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const parts = message.parts;
  const citationPart = parts.find(p => p.type === "data-research-citations");
  const citations = (citationPart && "data" in citationPart ? citationPart.data : null) as ChatCitationDisplay | null;
  const researchStates = parts.filter(p => p.type === "data-research-status").map(p => (p as { data: { status: string; reason?: string } }).data);
  const sources = parts.filter((p): p is Extract<Part, { type: "source-url" | "source-document" }> => p.type === "source-url" || p.type === "source-document");
  const tools = parts.filter(isTool);
  const toolsRunning = tools.some((t) => t.state === "input-streaming" || t.state === "input-available");
  const hasText = parts.some((p) => p.type === "text" && p.text.trim());

  // Group the message into: reasoning, analysis steps (all tool calls, in order), answer text.
  const reasoning = parts.filter((p): p is Extract<Part, { type: "reasoning" }> => p.type === "reasoning" && !!p.text.trim());
  const texts = parts.filter((p): p is Extract<Part, { type: "text" }> => p.type === "text");

  return (
    <div className="sc-msg sc-bot">
      {reasoning.length > 0 && (
        <details className="an-think" open={streaming && !hasText}>
          <summary>{streaming && !hasText ? "Thinking…" : "Thought process"}</summary>
          {reasoning.map((r, i) => (
            <Markdown key={i} text={r.text} />
          ))}
        </details>
      )}

      {tools.length > 0 && (
        <div className="an-card">
          <p className="an-title">
            {toolsRunning ? <span className="spin" /> : null}
            Analysis · {tools.length} step{tools.length === 1 ? "" : "s"}
          </p>
          <ol className="an-steps">
            {tools.map((t) => (
              <ToolStep key={t.toolCallId} part={t} />
            ))}
          </ol>
        </div>
      )}

      {texts.map((t, i) => (
        <Markdown key={i} text={t.text} />
      ))}
      {streaming && !toolsRunning && tools.length > 0 && !hasText && <p className="an-writing">Writing the answer…</p>}

      {researchStates.map((state, i) => <p key={i} className="sc-research-state" role="status">Research {state.status}: {state.reason}</p>)}
      {citations?.passages.map(p => (
        <details className="sc-research-quote" key={p.citationId}>
          <summary>[{p.citationId}] {p.sourceTitle} ({p.year}) — show verbatim passage</summary>
          <blockquote>{p.text}</blockquote>
          <p><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.publisher ?? p.attribution} · {p.year} · Open source</a></p>
          <p><strong>Applicability:</strong> {p.applicability}</p>
        </details>
      ))}

      {sources.length > 0 && (
        <div className="an-sources">
          <p className="an-sources-title">Sources</p>
          <ol>
            {sources.map((s, i) => (
              <li key={s.sourceId}>
                <span className="an-num">{i + 1}</span>
                {s.type === "source-url" ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title ?? new URL(s.url).hostname}
                    <small>{new URL(s.url).hostname.replace(/^www\./, "")}</small>
                  </a>
                ) : (
                  <span>{s.title}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

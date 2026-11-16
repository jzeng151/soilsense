import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DistrictOutlook } from "./DistrictOutlook";
import type { DistrictOutlook as Outlook } from "../../../src/shared/districtOutlook";
import { OUTLOOK_LABEL, OUTLOOK_CONTINUE, OUTLOOK_ONSET, OUTLOOK_SKILL } from "../../../src/shared/districtOutlook";
import { messages, translate, type TranslationKey } from "../i18n";

const outlook: Outlook = { fips: "20055", alert: "warning", situation: "continue", dataThrough: "2026-11-09", source: { name: "Team Kansas model", url: "https://example.test/model-fixture" }, basis: "dry-year water", dryYearRanking: true, usdm: { validStart: "2026-11-10", status: "matched", sourceUrl: "https://example.test/usdm-fixture" } };
const render = (value?: Outlook) => renderToStaticMarkup(createElement(DistrictOutlook, { outlook: value }));

describe("District outlook display", () => {
  it("renders nothing for absent, non-Kansas and normal context (also older runs)", () => {
    expect(render()).toBe("");
    expect(render({ ...outlook, fips: "19169" })).toBe("");
    expect(render({ ...outlook, alert: "normal" } as unknown as Outlook)).toBe("");
  });
  it("clearly labels continuation as separate district/model context and cites tested skill", () => {
    const html = render(outlook);
    expect(html).toContain("District outlook (next ~4 weeks, team&#x27;s Kansas model)");
    expect(html).toContain("drought likely to continue.");
    expect(html).not.toContain("possible drought onset");
    expect(html).toContain("<details>");
    expect(html).toContain("onset hit rate 0.17, false-alarm ratio 0.47");
    expect(html).toContain("model_report.md");
    expect(html).toContain("2026-11-09");
    expect(html).toContain("2026-11-10");
    expect(html).toContain("K-State rotations for this county are ranked for a dry year");
    expect(html).toContain("aria-controls=");
    expect(html).not.toContain("%");
  });
  it("uses low-confidence onset wording only when not currently in drought", () => {
    const html = render({ ...outlook, alert: "watch", situation: "onset", dryYearRanking: false });
    expect(html).toContain("possible drought onset (low confidence).");
    expect(html).not.toContain("drought likely to continue.");
    expect(html).not.toContain("K-State rotations for this county");
    expect(html).not.toContain("%");
  });
  it("has typed Spanish entries for every new UI sentence, with no percentages", () => {
    const keys: TranslationKey[] = [OUTLOOK_LABEL, OUTLOOK_CONTINUE, OUTLOOK_ONSET, OUTLOOK_SKILL, "Why this outlook?", "Model backtest report", "Model data through {date}", "County Drought Monitor map: {date}", "K-State rotations for this county are ranked for a dry year", "Second opinion"];
    for (const key of keys) {
      expect(messages[key]).toBeTruthy();
      expect(translate("es", key)).not.toBe(key);
      expect(translate("es", key)).not.toContain("%");
    }
    expect(translate("es", OUTLOOK_ONSET)).toContain("baja confianza");
  });
});

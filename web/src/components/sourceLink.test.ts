import { expect, it } from "vitest";
import { sourceLink } from "./sourceLink";

it("accepts local field-history links without assuming an absolute URL", () => {
  expect(sourceLink("/#/fieldwatch", "https://example.org")).toEqual({ href: "https://example.org/#/fieldwatch", label: "example.org" });
});
it("keeps official HTTPS sources", () => {
  expect(sourceLink("https://www.ksu.edu/research", "https://example.org")).toEqual({ href: "https://www.ksu.edu/research", label: "ksu.edu" });
});
it("rejects malformed and unsafe sources without throwing", () => {
  for (const value of ["https://[", "javascript:alert(1)", "data:text/html,bad", "not a url"]) {
    expect(sourceLink(value, "https://example.org")).toBeNull();
  }
});

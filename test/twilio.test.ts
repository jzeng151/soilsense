import { describe, expect, it } from "vitest";
import { computeTwilioSignature, gather, maskPhone, response, say, validateTwilioRequest, xmlEscape } from "../src/worker/lib/twilio";
import { validatePlanRequest } from "../src/worker/routes/api";
import { parseCropAnswer, parsePriorityAnswer, parseYesNo, parseZip } from "../src/worker/routes/voice";

const url = "https://fieldshift.example.workers.dev/voice/plan?zip=50010&crop=corn&irr=0";
const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };

describe("Twilio signature", () => {
  it("matches the official twilio-python RequestValidator", async () => {
    // Reference: twilio.request_validator.RequestValidator("12345").compute_signature(url, params)
    expect(await computeTwilioSignature("12345", url, params)).toBe("5bqg7ylimEa7f0KVEi62mDZ1j18=");
  });
  it("rejects tampered requests", async () => {
    expect(await validateTwilioRequest("12345", url, params, "5bqg7ylimEa7f0KVEi62mDZ1j18=")).toBe(true);
    expect(await validateTwilioRequest("12345", url, { ...params, Digits: "9" }, "5bqg7ylimEa7f0KVEi62mDZ1j18=")).toBe(false);
    expect(await validateTwilioRequest("12345", url, params, null)).toBe(false);
  });
});

describe("TwiML", () => {
  it("escapes XML and builds a gather", () => {
    expect(xmlEscape(`a&b<"c">`)).toBe("a&amp;b&lt;&quot;c&quot;&gt;");
    const xml = response(gather({ action: "/voice/zip?a=1&b=2", numDigits: 5 }, say("Hi & bye")));
    expect(xml).toContain('action="/voice/zip?a=1&amp;b=2"');
    expect(xml).toContain("Hi &amp; bye");
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
  });
  it("masks phone numbers", () => {
    expect(maskPhone("+15155550123")).toBe("***0123");
  });
});

describe("voice answer parsing", () => {
  it("parses ZIP codes from keypad and speech", () => {
    expect(parseZip("50010", "")).toBe("50010");
    expect(parseZip("", "five oh oh one oh")).toBe("50010");
    expect(parseZip("", "50010.")).toBe("50010");
    expect(parseZip("123", "")).toBeNull();
  });
  it("parses crops, priorities and yes/no", () => {
    expect(parseCropAnswer("1", "")).toBe("corn");
    expect(parseCropAnswer("", "we grew soybeans")).toBe("soybean");
    expect(parseCropAnswer("", "maíz")).toBe("corn");
    expect(parseCropAnswer("", "potatoes")).toBeNull();
    expect(parsePriorityAnswer("2", "")).toBe("soil");
    expect(parsePriorityAnswer("", "making money")).toBe("profit");
    expect(parseYesNo("", "yes it is")).toBe(true);
    expect(parseYesNo("2", "")).toBe(false);
  });
});

describe("plan request validation", () => {
  it("accepts a valid request", () => {
    expect(validatePlanRequest({ lat: 42.03, lon: -93.62, priority: "soil", irrigated: true, recentCrops: ["corn", "soybean"] })).toEqual({
      lat: 42.03,
      lon: -93.62,
      irrigated: true,
      priority: "soil",
      recentCrops: ["corn", "soybean"],
      language: "en",
    });
  });
  it("rejects bad input", () => {
    expect(typeof validatePlanRequest({ lat: 51.5, lon: -0.1 })).toBe("string");
    expect(typeof validatePlanRequest({ lat: 42, lon: -93, priority: "yolo" })).toBe("string");
    expect(typeof validatePlanRequest({ lat: 42, lon: -93, recentCrops: ["potato"] })).toBe("string");
    expect(typeof validatePlanRequest(null)).toBe("string");
  });
});

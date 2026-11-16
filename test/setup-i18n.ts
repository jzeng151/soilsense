import { beforeAll } from "vitest";
import { loadLanguage } from "../web/src/i18n";

// Translation assertions are synchronous; browsers instead load on language selection.
beforeAll(() => loadLanguage("ko"));

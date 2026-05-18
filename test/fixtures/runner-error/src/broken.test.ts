import { test } from "vitest";
// Intentionally unresolvable import → Vitest collection error (runner error).
import "./does-not-exist.js";

test("never collected", () => {});

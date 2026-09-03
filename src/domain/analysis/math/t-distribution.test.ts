import { describe, expect, it } from "vitest";

import { studentTQuantile, studentTPValue } from "./t-distribution";

describe("studentTQuantile / studentTPValue", () => {
  it("matches known two-sided 95% critical values (0.975 quantile)", () => {
    // Reference values (approx) from standard t tables
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.706, 2);
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.228, 2);
    expect(studentTQuantile(0.975, 30)).toBeCloseTo(2.042, 2);
    expect(studentTQuantile(0.975, 120)).toBeCloseTo(1.98, 1);
  });

  it("returns a two-tailed p-value near 0.05 at the 0.975 quantile", () => {
    const df = 8;
    const critical = studentTQuantile(0.975, df);
    expect(studentTPValue(critical, df)).toBeCloseTo(0.05, 2);
  });
});

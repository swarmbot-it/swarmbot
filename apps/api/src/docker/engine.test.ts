import { describe, it, expect } from "vitest";
import { negotiateApiVersion, mapServiceSummary } from "./engine.js";

describe("negotiateApiVersion", () => {
  it("clamps to daemon max", () => {
    expect(negotiateApiVersion("1.30", "1.44")).toBe("1.30");
  });
  it("clamps to our max", () => {
    expect(negotiateApiVersion("99.0", "1.44")).toBe("1.44");
  });
});

describe("mapServiceSummary", () => {
  it("extracts image from task template", () => {
    const s = {
      ID: "abc",
      Spec: {
        Name: "web",
        TaskTemplate: { ContainerSpec: { Image: "nginx:alpine" } },
        Mode: { Replicated: { Replicas: 2 } },
      },
    };
    expect(mapServiceSummary(s as never)).toEqual({
      id: "abc",
      name: "web",
      image: "nginx:alpine",
      replicas: 2,
    });
  });
});

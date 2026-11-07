import { describe, expect, it } from "vitest";
import { makeProtocol, remaining, slaDue, slaState } from "./support";

describe("suporte", () => {
  const t0 = new Date("2026-11-07T12:00:00Z");
  it("prazos por prioridade", () => {
    const u = slaDue("urgente", t0);
    expect(u.firstResponseDueAt.toISOString()).toBe("2026-11-07T13:00:00.000Z");
    expect(u.resolutionDueAt.toISOString()).toBe("2026-11-07T20:00:00.000Z");
    expect(slaDue("baixa", t0).resolutionDueAt.toISOString()).toBe("2026-11-11T12:00:00.000Z");
  });
  it("situação do prazo", () => {
    const due = new Date("2026-11-07T20:00:00Z");
    expect(slaState(due, null, t0, new Date("2026-11-07T13:00:00Z"))).toBe("ok");
    expect(slaState(due, null, t0, new Date("2026-11-07T18:30:00Z"))).toBe("risco");
    expect(slaState(due, null, t0, new Date("2026-11-07T21:00:00Z"))).toBe("atrasado");
    expect(slaState(due, new Date("2026-11-07T19:00:00Z"), t0)).toBe("cumprido");
    expect(slaState(due, new Date("2026-11-07T22:00:00Z"), t0)).toBe("violado");
  });
  it("protocolo legível", () => {
    expect(makeProtocol(t0, () => 0)).toBe("GW-20261107-2222");
    expect(makeProtocol(t0)).toMatch(/^GW-20261107-[2-9A-Z]{4}$/);
  });
  it("tempo restante", () => {
    expect(remaining(new Date("2026-11-07T15:00:00Z"), t0)).toBe("faltam 3 h");
    expect(remaining(new Date("2026-11-07T10:00:00Z"), t0, "es")).toBe("atrasado 2 h");
  });
});

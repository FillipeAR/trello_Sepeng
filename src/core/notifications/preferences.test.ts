import { describe, expect, it } from "vitest";
import { resolveChannelEnabled, type ChannelPreference } from "./preferences";

describe("resolveChannelEnabled", () => {
  it("IN_APP fica ligado mesmo sem nenhuma preferência gravada", () => {
    expect(resolveChannelEnabled([], "stage.entered", "IN_APP", { hasPhone: false })).toBe(true);
  });

  it("WHATSAPP fica desligado sem preferência explícita, mesmo com telefone", () => {
    expect(resolveChannelEnabled([], "stage.entered", "WHATSAPP", { hasPhone: true })).toBe(false);
  });

  it("WHATSAPP fica desligado sem telefone, mesmo com preferência habilitada", () => {
    const prefs: ChannelPreference[] = [
      { eventType: "stage.entered", channel: "WHATSAPP", enabled: true },
    ];
    expect(resolveChannelEnabled(prefs, "stage.entered", "WHATSAPP", { hasPhone: false })).toBe(false);
  });

  it("WHATSAPP liga com telefone cadastrado e preferência habilitada", () => {
    const prefs: ChannelPreference[] = [
      { eventType: "stage.entered", channel: "WHATSAPP", enabled: true },
    ];
    expect(resolveChannelEnabled(prefs, "stage.entered", "WHATSAPP", { hasPhone: true })).toBe(true);
  });

  it("preferência explícita desligada vence o default", () => {
    const prefs: ChannelPreference[] = [{ eventType: "sla.breached", channel: "IN_APP", enabled: false }];
    expect(resolveChannelEnabled(prefs, "sla.breached", "IN_APP", { hasPhone: false })).toBe(false);
  });

  it("preferência de um evento não vaza pra outro evento", () => {
    const prefs: ChannelPreference[] = [
      { eventType: "sla.breached", channel: "WHATSAPP", enabled: true },
    ];
    expect(resolveChannelEnabled(prefs, "task.assigned", "WHATSAPP", { hasPhone: true })).toBe(false);
  });
});

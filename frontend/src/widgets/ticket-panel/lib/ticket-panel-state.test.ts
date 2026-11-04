import { describe, expect, it } from "vitest";
import { ticketPanelErrorMode } from "./ticket-panel-state";

describe("ticketPanelErrorMode", () => {
  it("blocks only when loading failed before any ticket data was available", () => {
    expect(ticketPanelErrorMode(true, false)).toBe("blocking");
  });

  it("keeps the empty-data fallback while no tickets are available", () => {
    expect(ticketPanelErrorMode(false, false)).toBe("blocking");
  });

  it("keeps ticket data visible and marks a failed background refresh", () => {
    expect(ticketPanelErrorMode(true, true)).toBe("refresh");
  });

  it("does not show an error after a successful load", () => {
    expect(ticketPanelErrorMode(false, true)).toBe("none");
  });
});

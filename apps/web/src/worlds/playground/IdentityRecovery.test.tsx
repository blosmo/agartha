import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IdentityRecovery } from "./IdentityRecovery";
import { ensurePlaygroundSession } from "./identity";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not request or reveal a recovery secret while browsing, and restores only on submission", async () => {
  const restored = vi.fn();
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init.method === "POST" ? { agentId: "restored" } : null),
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<IdentityRecovery name="Maya" onRestored={restored} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText("Recovery code")).not.toBeInTheDocument();
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  fireEvent.change(screen.getByLabelText("Existing recovery code"), {
    target: { value: "private-restoration-fixture" },
  });
  expect(fetcher).toHaveBeenCalledOnce();
  fireEvent.click(
    screen.getByRole("button", { name: "Restore saved identity" }),
  );
  await waitFor(() => expect(restored).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[1][0]).toBe("/api/playground/identity/restore");
  expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({
    recoveryCode: "private-restoration-fixture",
  });
  expect(screen.getByLabelText("Existing recovery code")).toHaveValue("");
});
it("deduplicates simultaneous free-session creation across playground controls", async () => {
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const first = ensurePlaygroundSession("Maya");
  const second = ensurePlaygroundSession("Maya");
  expect(first).toBe(second);
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => {
    finish({ ok: true, status: 200, json: async () => ({}) });
    await first;
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const updates: Array<[string, unknown]> = [];
const opened: string[] = [];
let infoButtons: string[] = [];
let infoReturn: string | undefined;

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: <T>(key: string, d?: T) => (key === "remoteAudio.port" ? 47291 : d),
      update: (key: string, value: unknown) => {
        updates.push([key, value]);
        return Promise.resolve();
      },
    }),
  },
  window: {
    showInformationMessage: (_msg: string, ...buttons: string[]) => {
      infoButtons = buttons;
      return Promise.resolve(infoReturn);
    },
  },
  env: {
    openExternal: (uri: { toString: () => string }) => {
      opened.push(uri.toString());
      return Promise.resolve(true);
    },
    clipboard: { writeText: () => Promise.resolve() },
  },
  Uri: { parse: (s: string) => ({ toString: () => s }) },
  ConfigurationTarget: { Global: 1 },
}));

beforeEach(() => {
  updates.length = 0;
  opened.length = 0;
  infoButtons = [];
  infoReturn = undefined;
});

describe("setupRemoteAudio command", () => {
  it("enables remote-audio and opens the releases page in the local browser", async () => {
    const { setupRemoteAudio } = await import("../../src/notifications/remote-setup");
    await setupRemoteAudio();
    expect(updates).toContainEqual(["remoteAudio.enabled", true]);
    expect(opened.some((u) => u.includes("/releases"))).toBe(true);
    expect(infoButtons).toEqual(["Copy RemoteForward line", "Open setup guide"]);
  });

  it("opens the setup guide when that action is picked", async () => {
    infoReturn = "Open setup guide";
    const { setupRemoteAudio } = await import("../../src/notifications/remote-setup");
    await setupRemoteAudio();
    expect(opened.some((u) => u.includes("REMOTE_HOSTS.md"))).toBe(true);
  });
});

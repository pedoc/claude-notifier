import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as net from "net";

// remote.ts imports vscode (for the terminal-bell path); stub the surface it uses.
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: <T>(_k: string, d?: T) => d,
      update: () => Promise.resolve(),
    }),
  },
  commands: { executeCommand: () => Promise.resolve() },
  ConfigurationTarget: { Global: 1 },
}));

let tmpRoot: string;
let configFile: string;

// Capture the first line pushed to a one-shot loopback server.
function listen(): Promise<{ port: number; received: Promise<string>; close: () => void }> {
  return new Promise((resolve) => {
    let resolveData!: (s: string) => void;
    const received = new Promise<string>((r) => (resolveData = r));
    const srv = net.createServer((sock) => {
      let buf = "";
      sock.on("data", (d) => (buf += d.toString()));
      sock.on("end", () => resolveData(buf.trim()));
    });
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      resolve({ port: addr.port, received, close: () => srv.close() });
    });
  });
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote-audio-ext-"));
  const hooksDir = path.join(tmpRoot, ".claude", "hooks");
  configFile = path.join(hooksDir, "claude-notifier-config.json");
  fs.mkdirSync(hooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("extension pushRemoteAudio — src/notifications/remote.ts", () => {
  it("returns false (caller uses the bell fallback) when remote-audio is off", async () => {
    fs.writeFileSync(configFile, JSON.stringify({ remoteAudio: { enabled: false } }));
    vi.resetModules();
    const { pushRemoteAudio } = await import("../../src/notifications/remote");
    expect(pushRemoteAudio("done", "Hero", 1)).toBe(false);
  });

  it("returns false when there is no remoteAudio config at all", async () => {
    fs.writeFileSync(configFile, JSON.stringify({ soundVolume: 1 }));
    vi.resetModules();
    const { pushRemoteAudio } = await import("../../src/notifications/remote");
    expect(pushRemoteAudio("done", "Hero", 1)).toBe(false);
  });

  it("returns true and pushes the event when enabled (mirrors the hook path)", async () => {
    const { port, received, close } = await listen();
    fs.writeFileSync(configFile, JSON.stringify({ remoteAudio: { enabled: true, port } }));
    vi.resetModules();
    const { pushRemoteAudio } = await import("../../src/notifications/remote");
    expect(pushRemoteAudio("done", "Hero", 0.5)).toBe(true);
    expect(JSON.parse(await received)).toEqual({ reason: "done", sound: "Hero", volume: 0.5 });
    close();
  });
});

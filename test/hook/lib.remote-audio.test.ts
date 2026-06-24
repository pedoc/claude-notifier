import { describe, it, expect } from "vitest";
import * as net from "net";

const { pushRemoteAudio } = await import("../../hook/_lib/remote-audio");

// Stand up a one-shot loopback server that captures the first pushed line.
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

describe("hook/_lib/remote-audio — pushRemoteAudio", () => {
  it("returns false (caller plays locally) when remote-audio is off", () => {
    expect(pushRemoteAudio("done", "Hero", 1, null)).toBe(false);
    expect(pushRemoteAudio("done", "Hero", 1, {})).toBe(false);
    expect(pushRemoteAudio("done", "Hero", 1, { remoteAudio: { enabled: false } })).toBe(false);
  });

  it("returns true and pushes the event when enabled", async () => {
    const { port, received, close } = await listen();
    const handled = pushRemoteAudio("done", "Hero", 0.5, { remoteAudio: { enabled: true, port } });
    expect(handled).toBe(true);
    expect(JSON.parse(await received)).toEqual({ reason: "done", sound: "Hero", volume: 0.5 });
    close();
  });

  it("does not throw when the daemon is unreachable", () => {
    // Nothing is listening on this port — the push must be swallowed.
    expect(pushRemoteAudio("done", "Hero", 1, { remoteAudio: { enabled: true, port: 1 } })).toBe(
      true
    );
  });
});

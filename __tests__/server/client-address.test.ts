import { describe, it, expect } from "vitest";
import {
  clientAddress,
  tagClientAddress,
  CLIENT_ADDRESS_HEADER,
} from "../../server/client-address";

const request = (headers: Record<string, string | string[]> = {}) => ({
  headers: { ...headers } as Record<string, string | string[]>,
  socket: { remoteAddress: "192.168.1.20" },
});

describe("clientAddress", () => {
  it("uses the connection's address by default", () => {
    expect(clientAddress(request({ "x-forwarded-for": "1.2.3.4" }), {})).toBe(
      "192.168.1.20"
    );
  });

  it("uses the last X-Forwarded-For entry behind a trusted proxy", () => {
    const env = { TRUST_PROXY: "true" };
    expect(
      clientAddress(request({ "x-forwarded-for": "6.6.6.6, 10.0.0.5" }), env)
    ).toBe("10.0.0.5");
    expect(
      clientAddress(
        request({ "x-forwarded-for": ["6.6.6.6", "10.0.0.7"] }),
        env
      )
    ).toBe("10.0.0.7");
    expect(clientAddress(request(), env)).toBe("192.168.1.20");
  });

  it("copes with a request without a socket address", () => {
    expect(clientAddress({ headers: {}, socket: {} }, {})).toBe("unknown");
  });
});

describe("tagClientAddress", () => {
  it("replaces any value the client sent", () => {
    const req = request({ [CLIENT_ADDRESS_HEADER]: "spoofed" });
    tagClientAddress(req, {});
    expect(req.headers[CLIENT_ADDRESS_HEADER]).toBe("192.168.1.20");
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

test("GET /api/health returns ok", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "ok");
  } finally {
    server.close();
  }
});

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /health", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("GET /api/greet", () => {
  it("returns a greeting", async () => {
    const res = await request(app).get("/api/greet").query({ name: "Rupam" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello, Rupam!" });
  });

  it("returns 400 without a name", async () => {
    const res = await request(app).get("/api/greet");

    expect(res.status).toBe(400);
  });
});

import express, { type Express } from "express";

import { greet } from "./greeting.js";

export function createApp(): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: process.env.APP_VERSION ?? "dev" });
  });

  app.get("/api/greet", (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";

    try {
      res.json({ message: greet(name) });
    } catch {
      res.status(400).json({ error: "name is required" });
    }
  });

  return app;
}

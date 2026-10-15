import express, { type Express } from "express";

import { greet } from "./greeting.js";

export function createApp(): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: process.env.APP_VERSION ?? "dev" });
  });

  app.get("/api/greet", (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";

    const shout = req.query.shout === "1" || req.query.shout === "true";

    try {
      res.json({ message: greet(name, { shout }) });
    } catch {
      res.status(400).json({ error: "name is required" });
    }
  });

  return app;
}

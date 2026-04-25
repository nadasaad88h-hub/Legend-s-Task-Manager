"use strict";

const path = require("path");
const Database = require("better-sqlite3");

// On Railway, mount a Volume at /data and the DB will persist across deploys.
// Locally (or without a volume), it falls back to a file next to db.js.
const DB_PATH = process.env.DB_PATH
  || (require("fs").existsSync("/data") ? "/data/bot.sqlite" : path.join(__dirname, "bot.sqlite"));

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ----- Schema -----
db.exec(`
  CREATE TABLE IF NOT EXISTS cooldowns (
    user_id   TEXT PRIMARY KEY,
    expires   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS points (
    user_id   TEXT PRIMARY KEY,
    points    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS punishments (
    case_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT    NOT NULL,
    type      TEXT    NOT NULL,
    reason    TEXT    NOT NULL,
    evidence  TEXT    NOT NULL,
    issuer_id TEXT    NOT NULL,
    ts        INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_points_desc   ON points (points DESC);
  CREATE INDEX IF NOT EXISTS idx_punish_target ON punishments (target_id);
`);

// ----- Prepared statements (compiled once) -----
const stmts = {
  getCooldown:  db.prepare("SELECT expires FROM cooldowns WHERE user_id = ?"),
  setCooldown:  db.prepare(`
    INSERT INTO cooldowns (user_id, expires) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET expires = excluded.expires
  `),

  getPoints:    db.prepare("SELECT points FROM points WHERE user_id = ?"),
  upsertPoints: db.prepare(`
    INSERT INTO points (user_id, points) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET points = points.points + excluded.points
  `),
  getPointsRow: db.prepare("SELECT points FROM points WHERE user_id = ?"),
  topPoints:    db.prepare(`
    SELECT user_id AS userId, points FROM points
    ORDER BY points DESC, user_id ASC
    LIMIT ?
  `),

  insertPunish: db.prepare(`
    INSERT INTO punishments (target_id, type, reason, evidence, issuer_id, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
};

// ----- Cooldowns -----
function getCooldown(userId) {
  const row = stmts.getCooldown.get(userId);
  return row ? row.expires : null;
}
function setCooldown(userId, timestampMs) {
  stmts.setCooldown.run(userId, Number(timestampMs));
}

// ----- Punishments -----
function addPunishment(targetId, type, reason, evidence, issuerId) {
  const info = stmts.insertPunish.run(targetId, type, reason, evidence, issuerId, Date.now());
  return Number(info.lastInsertRowid);
}

// ----- Points / Economy -----
function getPoints(userId) {
  const row = stmts.getPoints.get(userId);
  return row ? row.points : 0;
}
function addPoints(userId, amount) {
  stmts.upsertPoints.run(userId, Number(amount));
  return stmts.getPointsRow.get(userId).points;
}
function getTopPoints(limit = 10) {
  return stmts.topPoints.all(limit);
}

// Cl

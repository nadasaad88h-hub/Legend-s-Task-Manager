"use strict";
const path = require("path");
const Database = require("better-sqlite3");
const db = new Database(path.join(__dirname, "bot.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS cooldowns (
    cooldown_key TEXT PRIMARY KEY,
    expires      INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS points (
    user_id      TEXT PRIMARY KEY,
    points       INTEGER NOT NULL DEFAULT 0
  );
`);

module.exports = {
  getCooldown: (key) => db.prepare("SELECT expires FROM cooldowns WHERE cooldown_key = ?").get(key)?.expires || 0,
  setCooldown: (key, ts) => {
    db.prepare("INSERT INTO cooldowns (cooldown_key, expires) VALUES (?, ?) ON CONFLICT(cooldown_key) DO UPDATE SET expires = excluded.expires").run(key, ts);
  },
  getPoints: (uid) => db.prepare("SELECT points FROM points WHERE user_id = ?").get(uid)?.points || 0,
  addPoints: (uid, amt) => {
    db.prepare("INSERT INTO points (user_id, points) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET points = points + excluded.points").run(uid, amt, amt);
    return db.prepare("SELECT points FROM points WHERE user_id = ?").get(uid).points;
  },
  getTopPoints: (limit) => db.prepare("SELECT user_id AS userId, points FROM points ORDER BY points DESC LIMIT ?").all(limit)
};

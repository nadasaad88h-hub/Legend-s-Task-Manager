"use strict";

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("tickets.db");

// Promisified helpers
const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );

const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    })
  );

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    })
  );

// Setup Tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      channelId TEXT PRIMARY KEY,
      userId TEXT,
      claimedBy TEXT,
      stage TEXT DEFAULT 'open',
      createdAt INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS staff_points (
      staffId TEXT PRIMARY KEY,
      points INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS terminations (
      staffId TEXT PRIMARY KEY,
      roles TEXT
    )
  `);
});

module.exports = {
  getTicket: (id) => get("SELECT * FROM tickets WHERE channelId = ?", [id]),
  saveTicket: (t) =>
    run("INSERT OR REPLACE INTO tickets VALUES (?, ?, ?, ?, ?)", [
      t.channelId,
      t.userId,
      t.claimedBy,
      t.stage,
      t.createdAt,
    ]),
  updateStage: (id, stage) =>
    run("UPDATE tickets SET stage = ? WHERE channelId = ?", [stage, id]),
  claimTicket: (id, staffId) =>
    run('UPDATE tickets SET claimedBy = ?, stage = "claimed" WHERE channelId = ?', [staffId, id]),
  deleteTicket: (id) => run("DELETE FROM tickets WHERE channelId = ?", [id]),
  addPoints: (staffId, pts) =>
    run(
      "INSERT INTO staff_points (staffId, points) VALUES (?, ?) ON CONFLICT(staffId) DO UPDATE SET points = points + ?",
      [staffId, pts, pts]
    ),
  getPoints: (staffId) => get("SELECT * FROM staff_points WHERE staffId = ?", [staffId]),
  getLeaderboard: () => all("SELECT * FROM staff_points ORDER BY points DESC"),
  getActiveClaims: async (staffId) => {
    const row = await get("SELECT COUNT(*) as count FROM tickets WHERE claimedBy = ?", [staffId]);
    return row ? row.count : 0;
  },
  saveTermination: (staffId, roles) =>
    run("INSERT OR REPLACE INTO terminations (staffId, roles) VALUES (?, ?)", [
      staffId,
      JSON.stringify(roles),
    ]),
  getTermination: async (staffId) => {
    const row = await get("SELECT * FROM terminations WHERE staffId = ?", [staffId]);
    if (!row) return null;
    return { ...row, roles: JSON.parse(row.roles) };
  },
  deleteTermination: (staffId) =>
    run("DELETE FROM terminations WHERE staffId = ?", [staffId]),
};

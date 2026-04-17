const Database = require('better-sqlite3');
const db = new Database('tickets.db');

// Setup Tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS tickets (
    channelId TEXT PRIMARY KEY,
    userId TEXT,
    claimedBy TEXT,
    stage TEXT DEFAULT 'open',
    createdAt INTEGER
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS staff_points (
    staffId TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0
  )
`).run();

module.exports = {
  getTicket: (id) => db.prepare('SELECT * FROM tickets WHERE channelId = ?').get(id),
  saveTicket: (t) => db.prepare('INSERT OR REPLACE INTO tickets VALUES (?, ?, ?, ?, ?)').run(t.channelId, t.userId, t.claimedBy, t.stage, t.createdAt),
  updateStage: (id, stage) => db.prepare('UPDATE tickets SET stage = ? WHERE channelId = ?').run(stage, id),
  claimTicket: (id, staffId) => db.prepare('UPDATE tickets SET claimedBy = ?, stage = "claimed" WHERE channelId = ?').run(staffId, id),
  deleteTicket: (id) => db.prepare('DELETE FROM tickets WHERE channelId = ?').run(id),
  addPoints: (staffId, pts) => db.prepare('INSERT INTO staff_points (staffId, points) VALUES (?, ?) ON CONFLICT(staffId) DO UPDATE SET points = points + ?').run(staffId, pts, pts),
  getActiveClaims: (staffId) => db.prepare('SELECT COUNT(*) as count FROM tickets WHERE claimedBy = ?').get(staffId).count
};

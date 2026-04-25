const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'republic.db'));

// Initialize Database Schema
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    bank INTEGER DEFAULT 0,
    lastDaily INTEGER DEFAULT 0,
    savedRoles TEXT DEFAULT '[]'
  )
`).run();

module.exports = {
  getPoints: (uid) => db.prepare('SELECT points FROM users WHERE id = ?').get(uid)?.points || 0,
  
  addPoints: (uid, amt) => {
    db.prepare(`INSERT INTO users (id, points) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET points = points + ?`).run(uid, amt, amt);
  },

  removePoints: (uid, amt) => {
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(amt, uid);
  },

  getBank: (uid) => db.prepare('SELECT bank FROM users WHERE id = ?').get(uid)?.bank || 0,

  addBank: (uid, amt) => {
    db.prepare(`INSERT INTO users (id, bank) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET bank = bank + ?`).run(uid, amt, amt);
  },

  getLastDaily: (uid) => db.prepare('SELECT lastDaily FROM users WHERE id = ?').get(uid)?.lastDaily || 0,

  setLastDaily: (uid, ts) => {
    db.prepare(`INSERT INTO users (id, lastDaily) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET lastDaily = ?`).run(uid, ts, ts);
  },

  saveRoles: (uid, roles) => {
    const data = JSON.stringify(roles);
    db.prepare(`INSERT INTO users (id, savedRoles) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET savedRoles = ?`).run(uid, data, data);
  },

  getRoles: (uid) => JSON.parse(db.prepare('SELECT savedRoles FROM users WHERE id = ?').get(uid)?.savedRoles || '[]')
};

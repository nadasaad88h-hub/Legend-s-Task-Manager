const Database = require('better-sqlite3');
const path = require('path');

// Initialize connection to the Federal Ledger
const db = new Database(path.join(__dirname, 'republic.db'));

// --- CONSTITUTIONAL TABLE SETUP ---
// We use a single table for users to keep lookups lightning fast.
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    bank INTEGER DEFAULT 0,
    lastDaily INTEGER DEFAULT 0,
    savedRoles TEXT DEFAULT '[]'
  )
`).run();

/**
 * 🏛️ THE FEDERAL DATA ACCESS LAYER
 */
module.exports = {
  // --- WALLET & ECONOMY ---
  getPoints: (userId) => {
    const row = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
    return row ? row.points : 0;
  },

  addPoints: (userId, amount) => {
    db.prepare(`
      INSERT INTO users (id, points) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET points = points + ?
    `).run(userId, amount, amount);
  },

  removePoints: (userId, amount) => {
    // Ensure we don't accidentally drop below zero unless the system allows debt
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(amount, userId);
  },

  // --- VAULT (BANK) ---
  getBank: (userId) => {
    const row = db.prepare('SELECT bank FROM users WHERE id = ?').get(userId);
    return row ? row.bank : 0;
  },

  addBank: (userId, amount) => {
    db.prepare(`
      INSERT INTO users (id, bank) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET bank = bank + ?
    `).run(userId, amount, amount);
  },

  // --- TREASURY COOLDOWNS ---
  getLastDaily: (userId) => {
    const row = db.prepare('SELECT lastDaily FROM users WHERE id = ?').get(userId);
    return row ? row.lastDaily : 0;
  },

  setLastDaily: (userId, timestamp) => {
    db.prepare(`
      INSERT INTO users (id, lastDaily) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET lastDaily = ?
    `).run(userId, timestamp, timestamp);
  },

  // --- JUDICIARY (ROLE PRESERVATION) ---
  // Used for 'Suspensions' so you can restore a user's ranks later.
  saveUserRoles: (userId, rolesArray) => {
    const rolesJSON = JSON.stringify(rolesArray);
    db.prepare(`
      INSERT INTO users (id, savedRoles) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET savedRoles = ?
    `).run(userId, rolesJSON, rolesJSON);
  },

  getSavedRoles: (userId) => {
    const row = db.prepare('SELECT savedRoles FROM users WHERE id = ?').get(userId);
    return row && row.savedRoles ? JSON.parse(row.savedRoles) : [];
  }
};

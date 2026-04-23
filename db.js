const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

// Initialize the table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS cooldowns (
    userId TEXT PRIMARY KEY,
    expiry INTEGER
  )
`).run();

module.exports = {
  // Sets or Updates a cooldown
  setCooldown: (userId, expiry) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO cooldowns (userId, expiry) VALUES (?, ?)');
    stmt.run(userId, expiry);
  },

  // Gets the cooldown timestamp
  getCooldown: (userId) => {
    const stmt = db.prepare('SELECT expiry FROM cooldowns WHERE userId = ?');
    const row = stmt.get(userId);
    return row ? row.expiry : null;
  },

  // Clears a cooldown manually
  clearCooldown: (userId) => {
    const stmt = db.prepare('DELETE FROM cooldowns WHERE userId = ?');
    stmt.run(userId);
  }
};

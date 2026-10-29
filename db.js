const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'chatgame.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err);
  } else {
    console.log('Connected to SQLite database at', DB_PATH);
  }
});

// Helper for running queries with Promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables and pragmas
async function initDatabase() {
  await run('PRAGMA foreign_keys = ON;');

  // 1. projects table
  await run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. project_state table
  await run(`
    CREATE TABLE IF NOT EXISTS project_state (
      project_id TEXT PRIMARY KEY,
      settings TEXT,
      draft_sender TEXT DEFAULT '',
      draft_receiver TEXT DEFAULT '',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // 3. messages table
  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      color TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id, order_index);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed DESC);`);

  // Migrate legacy chroma green #00B140 to digital green screen #00FF00
  try {
    await run(`UPDATE project_state SET settings = REPLACE(settings, '#00B140', '#00FF00') WHERE settings LIKE '%#00B140%'`);
  } catch (migErr) {
    console.warn('Migration warning:', migErr.message);
  }
}

const dbReadyPromise = initDatabase().catch(err => {
  console.error('Error initializing database tables:', err);
});

const DEFAULT_SETTINGS = {
  currentRatio: '16:9',
  currentQuality: '1080p',
  currentSenderColor: '#007aff',
  currentWidthPreset: 'narrow',
  currentVAlign: 'top',
  currentPacing: 'cinematic',
  isBounceEnabled: true,
  isSoundEnabled: true,
  isShadowEnabled: true,
  currentBgType: 'green',
  currentBgColor: '#00FF00'
};

/**
 * Returns all projects ordered by last_accessed DESC
 */
async function getAllProjects() {
  await dbReadyPromise;
  return all(`
    SELECT id, name, last_accessed 
    FROM projects 
    ORDER BY datetime(last_accessed) DESC, rowid DESC
  `);
}

/**
 * Creates a new project named "Untitled Project" (or specified name) with default settings
 */
async function createProject(name = 'Untitled Project', settings = null, draftSender = '', draftReceiver = '', initialMessages = []) {
  await dbReadyPromise;
  const id = crypto.randomUUID();
  const mergedSettings = settings ? { ...DEFAULT_SETTINGS, ...settings } : DEFAULT_SETTINGS;
  const settingsJson = JSON.stringify(mergedSettings);

  await run('BEGIN TRANSACTION');
  try {
    const now = new Date().toISOString();
    await run(
      `INSERT INTO projects (id, name, last_accessed) VALUES (?, ?, ?)`,
      [id, name, now]
    );

    await run(
      `INSERT INTO project_state (project_id, settings, draft_sender, draft_receiver) VALUES (?, ?, ?, ?)`,
      [id, settingsJson, draftSender || '', draftReceiver || '']
    );

    if (Array.isArray(initialMessages) && initialMessages.length > 0) {
      for (let i = 0; i < initialMessages.length; i++) {
        const msg = initialMessages[i];
        const orderIdx = typeof msg.order_index === 'number' ? msg.order_index : i;
        const msgType = msg.type === 'receiver' ? 'receiver' : 'sender';
        const msgText = msg.text || '';
        const msgColor = msg.color || (msgType === 'sender' ? (mergedSettings.currentSenderColor || '#007aff') : '#e5e5ea');
        await run(
          `INSERT INTO messages (project_id, order_index, type, text, color) VALUES (?, ?, ?, ?, ?)`,
          [id, orderIdx, msgType, msgText, msgColor]
        );
      }
    }

    await run('COMMIT');
    return { id, name, last_accessed: now };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

/**
 * Returns complete project payload, state, and messages ordered by order_index
 * Also updates last_accessed timestamp
 */
async function getProjectById(id) {
  await dbReadyPromise;
  const project = await get(`SELECT id, name, last_accessed FROM projects WHERE id = ?`, [id]);
  if (!project) return null;

  // Update last_accessed timestamp on read
  const now = new Date().toISOString();
  await run(`UPDATE projects SET last_accessed = ? WHERE id = ?`, [now, id]);
  project.last_accessed = now;

  const stateRow = await get(`SELECT settings, draft_sender, draft_receiver FROM project_state WHERE project_id = ?`, [id]);
  let settings = DEFAULT_SETTINGS;
  let draftSender = '';
  let draftReceiver = '';

  if (stateRow) {
    if (stateRow.settings) {
      try {
        settings = JSON.parse(stateRow.settings);
        if (settings && settings.currentBgColor === '#00B140') {
          settings.currentBgColor = '#00FF00';
        }
      } catch (e) {
        settings = DEFAULT_SETTINGS;
      }
    }
    draftSender = stateRow.draft_sender || '';
    draftReceiver = stateRow.draft_receiver || '';
  }

  const messageRows = await all(
    `SELECT id, order_index, type, text, color FROM messages WHERE project_id = ? ORDER BY order_index ASC`,
    [id]
  );

  return {
    id: project.id,
    name: project.name,
    last_accessed: project.last_accessed,
    settings,
    draft_sender: draftSender,
    draft_receiver: draftReceiver,
    messages: messageRows.map(m => ({
      id: m.id,
      order_index: m.order_index,
      type: m.type,
      text: m.text,
      color: m.color
    }))
  };
}

/**
 * Deletes a project and cascades deletions
 */
async function deleteProject(id) {
  await dbReadyPromise;
  await run('BEGIN TRANSACTION');
  try {
    await run(`DELETE FROM messages WHERE project_id = ?`, [id]);
    await run(`DELETE FROM project_state WHERE project_id = ?`, [id]);
    const res = await run(`DELETE FROM projects WHERE id = ?`, [id]);
    await run('COMMIT');
    return res.changes > 0;
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

/**
 * Syncs project state and messages
 */
async function syncProject(id, { name, settings, draft_sender, draft_receiver, messages: msgList }) {
  await dbReadyPromise;
  const project = await get(`SELECT id, name FROM projects WHERE id = ?`, [id]);
  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const settingsJson = JSON.stringify(settings || DEFAULT_SETTINGS);
  const draftSenderText = typeof draft_sender === 'string' ? draft_sender : '';
  const draftReceiverText = typeof draft_receiver === 'string' ? draft_receiver : '';

  await run('BEGIN TRANSACTION');
  try {
    if (name && typeof name === 'string' && name.trim()) {
      await run(`UPDATE projects SET name = ?, last_accessed = ? WHERE id = ?`, [name.trim(), now, id]);
    } else {
      await run(`UPDATE projects SET last_accessed = ? WHERE id = ?`, [now, id]);
    }

    // Upsert project_state
    await run(`
      INSERT INTO project_state (project_id, settings, draft_sender, draft_receiver)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        settings = excluded.settings,
        draft_sender = excluded.draft_sender,
        draft_receiver = excluded.draft_receiver
    `, [id, settingsJson, draftSenderText, draftReceiverText]);

    // Replace messages
    await run(`DELETE FROM messages WHERE project_id = ?`, [id]);

    if (Array.isArray(msgList) && msgList.length > 0) {
      for (let i = 0; i < msgList.length; i++) {
        const msg = msgList[i];
        const orderIdx = typeof msg.order_index === 'number' ? msg.order_index : i;
        const msgType = msg.type === 'receiver' ? 'receiver' : 'sender';
        const msgText = msg.text || '';
        const msgColor = msg.color || (msgType === 'sender' ? '#007aff' : '#e5e5ea');
        await run(
          `INSERT INTO messages (project_id, order_index, type, text, color) VALUES (?, ?, ?, ?, ?)`,
          [id, orderIdx, msgType, msgText, msgColor]
        );
      }
    }

    await run('COMMIT');
    return { id, last_accessed: now };
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

/**
 * Renames a project
 */
async function renameProject(id, newName) {
  await dbReadyPromise;
  const now = new Date().toISOString();
  const res = await run(
    `UPDATE projects SET name = ?, last_accessed = ? WHERE id = ?`,
    [newName.trim() || 'Untitled Project', now, id]
  );
  return res.changes > 0;
}

module.exports = {
  db,
  dbReadyPromise,
  getAllProjects,
  createProject,
  getProjectById,
  deleteProject,
  syncProject,
  renameProject,
  DEFAULT_SETTINGS
};

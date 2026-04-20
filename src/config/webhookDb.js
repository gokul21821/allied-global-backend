import sqlite3 from "sqlite3";

const sqlite = sqlite3.verbose();

export class WebhookDb {
  constructor(dbPath = "./webhook_logs.db") {
    this.db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error("Failed to open SQLite DB:", err);
        return;
      }
      console.log("SQLite DB opened successfully ✅");

      // Create webhook_logs table
      this.db.run(
        `
        CREATE TABLE IF NOT EXISTS webhook_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT,
          conversation_id TEXT,
          agent_id TEXT,
          headers TEXT,
          body TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) console.error("Failed to create webhook_logs table:", err);
          else console.log("webhook_logs table ready ✅");
        },
      );

      // Create indexes
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_conversation_id
        ON webhook_logs (conversation_id)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_agent_id
        ON webhook_logs (agent_id)
      `);

      // Create sent_webhooks table with optional but unique conversation_id
      this.db.run(
        `
        CREATE TABLE IF NOT EXISTS sent_webhooks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id TEXT UNIQUE,  -- optional, but unique if provided
          sent_url TEXT NOT NULL,
          sent_payload TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) console.error("Failed to create sent_webhooks table:", err);
          else console.log("sent_webhooks table ready ✅");
        },
      );
    });
  }

  // Save a webhook payload
  saveWebhook({
    path,
    conversation_id = null,
    agent_id = null,
    headers = {},
    body = {},
  }) {
    if (!conversation_id) {
      console.warn("Cannot save webhook without conversation_id");
      return;
    }

    this.db.serialize(() => {
      this.db.get(
        `SELECT id FROM webhook_logs WHERE conversation_id = ?`,
        [conversation_id],
        (err, row) => {
          if (err) {
            console.error("Failed to check existing conversation_id:", err);
            return;
          }

          if (row) {
            console.log(
              `Conversation ${conversation_id} already exists — skipping save`,
            );
            return;
          }

          const bodyToSave = { ...body };
          delete bodyToSave.full_audio;

          this.db.run(
            `INSERT INTO webhook_logs (path, conversation_id, agent_id, headers, body)
             VALUES (?, ?, ?, ?, ?)`,
            [
              path,
              conversation_id,
              agent_id,
              JSON.stringify(headers, null, 2),
              JSON.stringify(bodyToSave, null, 2),
            ],
            (err) => {
              if (err) {
                console.error("Failed to save webhook:", err);
                return;
              }
              console.log(
                `Webhook for conversation ${conversation_id} saved ✅`,
              );

              // Keep only last 100 entries
              this.db.run(
                `
                DELETE FROM webhook_logs
                WHERE id NOT IN (
                  SELECT id FROM webhook_logs
                  ORDER BY id DESC
                  LIMIT 100
                )
              `,
                (err) => {
                  if (err)
                    console.error("Failed to cleanup old webhooks:", err);
                },
              );
            },
          );
        },
      );
    });
  }

  // Save just a sent URL and payload
  saveSentWebhookSimple({ conversation_id = null, sent_url, sent_payload }) {
    if (!sent_url) {
      console.warn("Cannot save sent webhook without sent_url");
      return;
    }

    const sql = `
      INSERT OR IGNORE INTO sent_webhooks (conversation_id, sent_url, sent_payload, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const bodyToSave = { ...sent_payload };
    delete bodyToSave.data.full_audio;

    this.db.run(
      sql,
      [conversation_id, sent_url, JSON.stringify(bodyToSave, null, 2)],
      function (err) {
        if (err) {
          console.error("Failed to save sent webhook:", err);
          return;
        }

        if (this.changes === 0 && conversation_id) {
          console.log(`Sent webhook skipped — conversation_id "${conversation_id}" already exists`);
        } else {
          console.log(`Sent webhook saved for URL: ${sent_url} ✅`);
        }
      }
    );
  }


  // Fetch webhooks with optional filters
  getWebhooks({ conversation_id, agent_id }, callback) {
    let sql = `
      SELECT id, conversation_id, agent_id, headers, body, created_at
      FROM webhook_logs
    `;

    const conditions = [];
    const params = [];

    if (conversation_id) {
      conditions.push("conversation_id = ?");
      params.push(conversation_id);
    }
    if (agent_id) {
      conditions.push("agent_id = ?");
      params.push(agent_id);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY id DESC LIMIT 100";

    this.db.all(sql, params, (err, rows) => {
      if (err) return callback(err);
      callback(
        null,
        rows.map((r) => ({
          id: r.id,
          conversation_id: r.conversation_id,
          agent_id: r.agent_id,
          headers: JSON.parse(r.headers),
          body: JSON.parse(r.body),
          created_at: r.created_at,
        })),
      );
    });
  }
  getSentWebhooks({ conversation_id, sent_url }, callback) {
    let sql = `
      SELECT id, conversation_id, sent_url, sent_payload, created_at
      FROM sent_webhooks
    `;

    const conditions = [];
    const params = [];

    if (conversation_id) {
      conditions.push("conversation_id = ?");
      params.push(conversation_id);
    }

    if (sent_url) {
      conditions.push("sent_url = ?");
      params.push(sent_url);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY id DESC LIMIT 100";

    this.db.all(sql, params, (err, rows) => {
      if (err) return callback(err);

      callback(
        null,
        rows.map(r => ({
          id: r.id,
          conversation_id: r.conversation_id,
          sent_url: r.sent_url,
          sent_payload: JSON.parse(r.sent_payload),
          created_at: r.created_at
        }))
      );
    });
  }

}

// import { db } from "../config/firebase.js";

// export const auditController = {
//   async getAuditLogs(req, res) {
//     try {
//       const {
//         limit = 100,
//         offset = 0,
//         startDate,
//         endDate,
//         userEmail,
//         action,
//         userName,
//       } = req.query;

//       let query = db.collection("audit_logs").orderBy("timestamp", "desc");

//       // Apply filters
//       if (startDate) {
//         query = query.where("timestamp", ">=", new Date(startDate));
//       }
//       if (endDate) {
//         query = query.where("timestamp", "<=", new Date(endDate));
//       }
//       if (userEmail) {
//         query = query.where("userEmail", "==", userEmail);
//       }
//       if (userName) {
//         query = query.where("userName", "==", userName);
//       }
//       if (action) {
//         query = query.where("action", "==", action);
//       }

//       query = query.limit(parseInt(limit)).offset(parseInt(offset));

//       const snapshot = await query.get();
//       const logs = snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//         timestamp: doc.data().timestamp.toDate(),
//       }));

//       res.json({
//         logs,
//         total: snapshot.size,
//         hasMore: snapshot.size === parseInt(limit),
//       });
//     } catch (error) {
//       console.error("Error fetching audit logs:", error);
//       res.status(500).json({ error: "Failed to fetch audit logs" });
//     }
//   },

//   async getMyAuditLogs(req, res) {
//     try {
//       if (!req.user || !req.user.email) {
//         return res.status(401).json({ error: "Authentication required" });
//       }

//       const {
//         limit = 50,
//         offset = 0,
//         startDate,
//         endDate,
//         action,
//       } = req.query;

//       let query = db
//         .collection("audit_logs")
//         .where("userEmail", "==", req.user.email)
//         .orderBy("timestamp", "desc");

//       // Apply additional filters
//       if (startDate) {
//         query = query.where("timestamp", ">=", new Date(startDate));
//       }
//       if (endDate) {
//         query = query.where("timestamp", "<=", new Date(endDate));
//       }
//       if (action) {
//         query = query.where("action", "==", action);
//       }

//       query = query.limit(parseInt(limit)).offset(parseInt(offset));

//       const snapshot = await query.get();
//       const logs = snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//         timestamp: doc.data().timestamp.toDate(),
//       }));

//       res.json({
//         logs,
//         total: snapshot.size,
//         hasMore: snapshot.size === parseInt(limit),
//       });
//     } catch (error) {
//       console.error("Error fetching my audit logs:", error);
//       res.status(500).json({ error: "Failed to fetch your audit logs" });
//     }
//   },

//   async getUserAuditLogs(req, res) {
//     try {
//       if (!req.user || req.user.role !== "admin") {
//         return res.status(403).json({ error: "Admin access required" });
//       }

//       const { userEmail } = req.params;
//       const { limit = 50 } = req.query;

//       const snapshot = await db
//         .collection("audit_logs")
//         .where("userEmail", "==", userEmail)
//         .orderBy("timestamp", "desc")
//         .limit(parseInt(limit))
//         .get();

//       const logs = snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//         timestamp: doc.data().timestamp.toDate(),
//       }));

//       res.json({ logs });
//     } catch (error) {
//       console.error("Error fetching user audit logs:", error);
//       res.status(500).json({ error: "Failed to fetch user audit logs" });
//     }
//   },

//   async getAuditStats(req, res) {
//     try {
//       if (!req.user || req.user.role !== "admin") {
//         return res.status(403).json({ error: "Admin access required" });
//       }

//       const { days = 7 } = req.query;
//       const startDate = new Date();
//       startDate.setDate(startDate.getDate() - parseInt(days));

//       const snapshot = await db
//         .collection("audit_logs")
//         .where("timestamp", ">=", startDate)
//         .get();

//       const stats = {
//         totalLogs: snapshot.size,
//         byAction: {},
//         byUser: {},
//       };

//       snapshot.docs.forEach((doc) => {
//         const data = doc.data();

//         // Count by action
//         stats.byAction[data.action] = (stats.byAction[data.action] || 0) + 1;

//         // Count by user
//         stats.byUser[data.userEmail] = (stats.byUser[data.userEmail] || 0) + 1;
//       });

//       res.json(stats);
//     } catch (error) {
//       console.error("Error fetching audit stats:", error);
//       res.status(500).json({ error: "Failed to fetch audit stats" });
//     }
//   },
// };

import { db, } from "../config/firebase.js";
import admin from 'firebase-admin';
export const auditController = {
  async getAuditLogs(req, res) {
    try {
      const {
        limit = 100,
        offset = 0,
        startDate,
        endDate,
        userEmail,
        action,
        userName,
      } = req.query;

      let query = db.collection("audit_logs").orderBy("timestamp", "desc");

      // Apply filters
      if (startDate) {
        query = query.where("timestamp", ">=", new Date(startDate));
      }
      if (endDate) {
        query = query.where("timestamp", "<=", new Date(endDate));
      }
      if (userEmail) {
        query = query.where("userEmail", "==", userEmail);
      }
      if (userName) {
        query = query.where("userName", "==", userName);
      }
      if (action) {
        query = query.where("action", "==", action);
      }

      query = query.limit(parseInt(limit)).offset(parseInt(offset));

      const snapshot = await query.get();
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate(),
      }));

      res.json({
        logs,
        total: snapshot.size,
        hasMore: snapshot.size === parseInt(limit),
      });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  },

  async getMyAuditLogs(req, res) {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const token = authHeader.split('Bearer ')[1];

      // Verify the token and get user info
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
      } catch (error) {
        console.error("Token verification failed:", error);
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const userEmail = decodedToken.email;
      if (!userEmail) {
        return res.status(401).json({ error: "User email not found in token" });
      }

      const {
        limit = 50,
        offset = 0,
        startDate,
        endDate,
        action,
      } = req.query;

      // Build query without orderBy to avoid index requirement
      let query = db
        .collection("audit_logs")
        .where("userEmail", "==", userEmail);

      // Apply additional filters
      if (startDate) {
        query = query.where("timestamp", ">=", new Date(startDate));
      }
      if (endDate) {
        query = query.where("timestamp", "<=", new Date(endDate));
      }
      if (action) {
        query = query.where("action", "==", action);
      }

      const snapshot = await query.get();

      // Get all logs and sort in memory
      let logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate(),
      }));

      // Sort by timestamp descending
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply pagination in memory
      const paginatedLogs = logs.slice(
        parseInt(offset),
        parseInt(offset) + parseInt(limit)
      );

      res.json({
        logs: paginatedLogs,
        total: logs.length,
        hasMore: (parseInt(offset) + parseInt(limit)) < logs.length,
      });
    } catch (error) {
      console.error("Error fetching my audit logs:", error);
      res.status(500).json({ error: "Failed to fetch your audit logs" });
    }
  },

  async getUserAuditLogs(req, res) {
    try {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { userEmail } = req.params;
      const { limit = 50 } = req.query;

      const snapshot = await db
        .collection("audit_logs")
        .where("userEmail", "==", userEmail)
        .orderBy("timestamp", "desc")
        .limit(parseInt(limit))
        .get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp.toDate(),
      }));

      res.json({ logs });
    } catch (error) {
      console.error("Error fetching user audit logs:", error);
      res.status(500).json({ error: "Failed to fetch user audit logs" });
    }
  },

  async getAuditStats(req, res) {
    try {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { days = 7 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const snapshot = await db
        .collection("audit_logs")
        .where("timestamp", ">=", startDate)
        .get();

      const stats = {
        totalLogs: snapshot.size,
        byAction: {},
        byUser: {},
      };

      snapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Count by action
        stats.byAction[data.action] = (stats.byAction[data.action] || 0) + 1;

        // Count by user
        stats.byUser[data.userEmail] = (stats.byUser[data.userEmail] || 0) + 1;
      });

      res.json(stats);
    } catch (error) {
      console.error("Error fetching audit stats:", error);
      res.status(500).json({ error: "Failed to fetch audit stats" });
    }
  },
};
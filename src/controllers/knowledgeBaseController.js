import { db } from "../config/firebase.js";
import { elevenLabsKnowledgeBaseService } from "../services/elevenLabsKnowledgeBase.js";
import {
  createKnowledgeBaseSchema,
  getKnowledgeBaseSchema,
  deleteKnowledgeBaseSchema,
  listKnowledgeBasesSchema,
  getDependentAgentsSchema,
} from "../validators/knowledgeBase.js";
import admin from "firebase-admin";
import { auditService } from "../services/auditService.js";
import { canAccessUserData, getAccessibleUserIds, getRequestingUserId, batchGetUsers } from "../utils/permissionUtils.js";

export const knowledgeBaseController = {
  async createKnowledgeBase(req, res) {
    try {
      const { error, value } = createKnowledgeBaseSchema.validate({
        user_id: req.body.user_id,
        url: req.body.url,
      });

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, url } = req.body;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can create knowledge bases for target user
      if (requestingUserId !== user_id) {
        const canAccess = await canAccessUserData(requestingUserId, user_id);
        if (!canAccess) {
          return res.status(403).json({
            error: "Access denied. You can only create knowledge bases for users in your hierarchy.",
          });
        }
      }

      // Validate that either file or URL is provided
      if (!req.file && !url) {
        return res
          .status(400)
          .json({ error: "Either file or URL must be provided" });
      }

      // Create knowledge base in Eleven Labs
      const elevenLabsKnowledgeBase =
        await elevenLabsKnowledgeBaseService.createKnowledgeBase(
          req.file, // Multer adds the file to req.file
          url,
        );

      // Store knowledge base reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ knowledgeBases: [] });
      }

      await userRef.update({
        knowledgeBases: admin.firestore.FieldValue.arrayUnion({
          document_id: elevenLabsKnowledgeBase.id,
          created_at: new Date().toISOString(),
        }),
      });

      // Log knowledge base creation
      await auditService.logKnowledgeBaseAction(
        user_id,
        'created',
        elevenLabsKnowledgeBase.id,
        `Created knowledge base "${elevenLabsKnowledgeBase.name || 'Unknown'}" with ID ${elevenLabsKnowledgeBase.id}${req.file ? ' from file' : url ? ' from URL' : ''}`
      );

      res.status(201).json(elevenLabsKnowledgeBase);
    } catch (error) {
      console.error("Error creating knowledge base:", error);
      res.status(500).json({ error: "Failed to create knowledge base" });
    }
  },

  async getKnowledgeBase(req, res) {
    try {
      const { error, value } = getKnowledgeBaseSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, document_id } = req.params;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only view knowledge bases for users in your hierarchy.",
        });
      }

      // Check if knowledge base belongs to user (or any user in hierarchy)
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      let knowledgeBaseExists = userData.knowledgeBases?.some(
        (kb) => kb.document_id === document_id,
      );

      // If not found in target user, check accessible users (for sub-admin/sub-admin-user aggregation)
      if (!knowledgeBaseExists && (requestingUserId === user_id)) {
        const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
            const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [, accessibleUserData] of usersMap) {
              if (accessibleUserData.knowledgeBases?.some((kb) => kb.document_id === document_id)) {
                knowledgeBaseExists = true;
                break;
              }
            }
          }
        }
      }

      if (!knowledgeBaseExists) {
        return res.status(404).json({
          error: "Knowledge base not found or does not belong to user",
        });
      }

      // Get knowledge base details from Eleven Labs
      const knowledgeBaseDetails =
        await elevenLabsKnowledgeBaseService.getKnowledgeBase(document_id);
      res.json(knowledgeBaseDetails);
    } catch (error) {
      console.error("Error getting knowledge base:", error);
      res.status(500).json({ error: "Failed to get knowledge base" });
    }
  },

  async deleteKnowledgeBase(req, res) {
    try {
      const { error, value } = deleteKnowledgeBaseSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, document_id } = req.params;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only delete knowledge bases for users in your hierarchy.",
        });
      }

      // Find the actual owner of the knowledge base for deletion
      let actualOwnerDoc = null;
      let actualOwnerData = null;
      let knowledgeBaseExists = false;

      // First check target user
      const userDoc = await db.collection("users").doc(user_id).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        knowledgeBaseExists = userData.knowledgeBases?.some(
          (kb) => kb.document_id === document_id,
        );
        if (knowledgeBaseExists) {
          actualOwnerDoc = userDoc;
          actualOwnerData = userData;
        }
      }

      // If not found in target user, check accessible users (for sub-admin/sub-admin-user aggregation)
      if (!knowledgeBaseExists && (requestingUserId === user_id)) {
        const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
            const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [uid, accessibleUserData] of usersMap) {
              if (accessibleUserData.knowledgeBases?.some((kb) => kb.document_id === document_id)) {
                knowledgeBaseExists = true;
                actualOwnerData = accessibleUserData;
                // Get the actual document reference for updates
                const targetDoc = await db.collection("users").doc(uid).get();
                if (targetDoc.exists) {
                  actualOwnerDoc = targetDoc;
                }
                break;
              }
            }
          }
        }
      }

      if (!knowledgeBaseExists || !actualOwnerDoc || !actualOwnerData) {
        return res.status(404).json({
          error: "Knowledge base not found or does not belong to user",
        });
      }

      // Delete knowledge base from Eleven Labs
      const response =
        await elevenLabsKnowledgeBaseService.deleteKnowledgeBase(document_id);

      // Remove knowledge base from actual owner's list
      const updatedKnowledgeBases = actualOwnerData.knowledgeBases.filter(
        (kb) => kb.document_id !== document_id,
      );
      await actualOwnerDoc.ref.update({ knowledgeBases: updatedKnowledgeBases });

      // Log knowledge base deletion
      await auditService.logKnowledgeBaseAction(
        user_id,
        'deleted',
        document_id,
        `Deleted knowledge base with ID ${document_id}`
      );

      res.json(response);
    } catch (error) {
      console.error("Error deleting knowledge base:", error);
      res.status(500).json({ error: "Failed to delete knowledge base" });
    }
  },

  async listKnowledgeBases(req, res) {
    try {
      const { error, value } = listKnowledgeBasesSchema.validate({
        ...req.params,
        ...req.query,
      });

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, cursor, page_size } = value;

      // Get current user from request (requesting user)
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only view knowledge bases for users in your hierarchy.",
        });
      }

      // Get requesting user data to check role
      const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
      if (!requestingUserDoc.exists) {
        return res.status(404).json({ error: "Requesting user not found" });
      }

      const requestingUserData = requestingUserDoc.data();
      const requestingUserRole = requestingUserData.role;

      // Get all knowledge bases from Eleven Labs with pagination
      const response = await elevenLabsKnowledgeBaseService.listKnowledgeBases(
        cursor,
        page_size,
      );
      const { documents, has_more, next_cursor } = response;

      // For sub-admin and sub-admin-user: aggregate knowledge bases from all managed users
      if ((requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") && requestingUserId === user_id) {
        // Get all accessible user IDs using the utility function
        const accessibleUserIds = await getAccessibleUserIds(requestingUserId);

        // Batch fetch all user documents in parallel
        const usersMap = await batchGetUsers(accessibleUserIds);

        // Collect all knowledge base IDs from accessible users
        const allKnowledgeBaseIds = new Set();

        usersMap.forEach((accessibleUserData) => {
          const knowledgeBases = accessibleUserData.knowledgeBases || [];
          knowledgeBases.forEach((kb) => {
            allKnowledgeBaseIds.add(kb.document_id);
          });
        });

        // Filter knowledge bases to include those from all accessible users
        const filteredDocuments = documents.filter((doc) =>
          allKnowledgeBaseIds.has(doc.id),
        );

        res.json({
          documents: filteredDocuments,
          has_more,
          next_cursor,
        });
      } else {
        // For regular users or when accessing specific user_id: return that user's knowledge bases
        const userDoc = await db.collection("users").doc(user_id).get();
        if (!userDoc.exists) {
          return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        const userKnowledgeBases = userData.knowledgeBases || [];

        // Filter knowledge bases to only include those belonging to the user
        const userKnowledgeBaseIds = new Set(
          userKnowledgeBases.map((kb) => kb.document_id),
        );
        const filteredDocuments = documents.filter((doc) =>
          userKnowledgeBaseIds.has(doc.id),
        );

        res.json({
          documents: filteredDocuments,
          has_more,
          next_cursor,
        });
      }
    } catch (error) {
      console.error("Error listing knowledge bases:", error);
      res.status(500).json({ error: "Failed to list knowledge bases" });
    }
  },

  async getDependentAgents(req, res) {
    try {
      const { error, value } = getDependentAgentsSchema.validate({
        ...req.params,
        ...req.query,
      });

      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, document_id, cursor, page_size } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only view dependent agents for knowledge bases in your hierarchy.",
        });
      }

      // Check if knowledge base belongs to user (or any user in hierarchy)
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      let knowledgeBaseExists = userData.knowledgeBases?.some(
        (kb) => kb.document_id === document_id,
      );

      // If not found in target user, check accessible users (for sub-admin/sub-admin-user aggregation)
      if (!knowledgeBaseExists && (requestingUserId === user_id)) {
        const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
            const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [, accessibleUserData] of usersMap) {
              if (accessibleUserData.knowledgeBases?.some((kb) => kb.document_id === document_id)) {
                knowledgeBaseExists = true;
                break;
              }
            }
          }
        }
      }

      if (!knowledgeBaseExists) {
        return res.status(404).json({
          error: "Knowledge base not found or does not belong to user",
        });
      }

      // Get dependent agents from Eleven Labs
      const response = await elevenLabsKnowledgeBaseService.getDependentAgents(
        document_id,
        cursor,
        page_size,
      );

      res.json(response);
    } catch (error) {
      console.error("Error getting dependent agents:", error);
      res.status(500).json({ error: "Failed to get dependent agents" });
    }
  },
};

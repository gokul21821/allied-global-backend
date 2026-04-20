import { db } from "../config/firebase.js";
import { elevenLabsToolService } from "../services/elevenLabsTool.js";
import {
  createToolSchema,
  getToolSchema,
  updateToolSchema,
  deleteToolSchema,
  listToolsSchema,
} from "../validators/tool.js";
import admin from "firebase-admin";
import { auditService } from "../services/auditService.js";
import { canAccessUserData, getAccessibleUserIds, getRequestingUserId, batchGetUsers } from "../utils/permissionUtils.js";

export const toolController = {
  async createTool(req, res) {
    try {
      const { error, value } = createToolSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, tool_config } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can create tools for target user
      if (requestingUserId !== user_id) {
        const canAccess = await canAccessUserData(requestingUserId, user_id);
        if (!canAccess) {
          return res.status(403).json({
            error: "Access denied. You can only create tools for users in your hierarchy.",
          });
        }
      }

      // Create tool in Eleven Labs
      const elevenLabsTool =
        await elevenLabsToolService.createTool(tool_config);

      // Store tool reference in Firebase
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ tools: [] });
      }

      await userRef.update({
        tools: admin.firestore.FieldValue.arrayUnion({
          tool_id: elevenLabsTool.id,
          created_at: new Date().toISOString(),
        }),
      });

      // Log tool creation
      await auditService.logToolAction(
        user_id,
        'created',
        elevenLabsTool.id,
        `Created tool "${elevenLabsTool.name || 'Unknown'}" with ID ${elevenLabsTool.id}`
      );

      res.status(201).json(elevenLabsTool);
    } catch (error) {
      console.error("Error creating tool:", error);
      res.status(500).json({ error: "Failed to create tool" });
    }
  },

  async listTools(req, res) {
    try {
      const { error, value } = listToolsSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id } = req.params;

      // Get current user from request (requesting user)
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only view tools for users in your hierarchy.",
        });
      }

      // Get requesting user data to check role
      const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
      if (!requestingUserDoc.exists) {
        return res.status(404).json({ error: "Requesting user not found" });
      }

      const requestingUserData = requestingUserDoc.data();
      const requestingUserRole = requestingUserData.role;

      // Get all tools from Eleven Labs
      const response = await elevenLabsToolService.listTools();
      const allTools = response.tools || [];

      // For sub-admin and sub-admin-user: aggregate tools from all managed users
      if ((requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") && requestingUserId === user_id) {
        // Get all accessible user IDs using the utility function
        const accessibleUserIds = await getAccessibleUserIds(requestingUserId);

        // Batch fetch all user documents in parallel
        const usersMap = await batchGetUsers(accessibleUserIds);

        // Collect all tool IDs from accessible users
        const allToolIds = new Set();

        usersMap.forEach((accessibleUserData) => {
          const tools = accessibleUserData.tools || [];
          tools.forEach((tool) => {
            allToolIds.add(tool.tool_id);
          });
        });

        // Filter tools to include those from all accessible users
        const filteredTools = allTools.filter((tool) => allToolIds.has(tool.id));

        res.json({ tools: filteredTools });
      } else {
        // For regular users or when accessing specific user_id: return that user's tools
        const userDoc = await db.collection("users").doc(user_id).get();
        if (!userDoc.exists) {
          return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        const userTools = userData.tools || [];

        // Filter tools to only include those belonging to the user
        const userToolIds = new Set(userTools.map((tool) => tool.tool_id));
        const filteredTools = allTools.filter((tool) => userToolIds.has(tool.id));

        res.json({ tools: filteredTools });
      }
    } catch (error) {
      console.error("Error listing tools:", error);
      res.status(500).json({ error: "Failed to list tools" });
    }
  },

  async getTool(req, res) {
    try {
      const { error, value } = getToolSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, tool_id } = value;


      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);
      console.log(user_id,requestingUserId)

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only view tools for users in your hierarchy.",
        });
      }

      // Check if tool belongs to user (or any user in hierarchy)
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      let toolExists = userData.tools?.some(
        (tool) => tool.tool_id === tool_id,
      );
      console.log(toolExists)

      // If not found in target user, check accessible users (for sub-admin/sub-admin-user aggregation)
      if (!toolExists && (requestingUserId === user_id)) {
        const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
            const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [uid, accessibleUserData] of usersMap) {
              if (accessibleUserData.tools?.some((tool) => tool.tool_id === tool_id)) {
                toolExists = true;
                break;
              }
            }
          }
        }
      }

      //@Anshuman - I am commenting this out because it is causing issues with the toolExists check, because some users not have the tools which their agents have.
      // if (!toolExists) {
      //   return res
      //     .status(404)
      //     .json({ error: "Tool not found or does not belong to user" });
      // }

      // Get tool details from Eleven Labs
      const toolDetails = await elevenLabsToolService.getTool(tool_id);
      res.json(toolDetails);
    } catch (error) {
      console.error("Error getting tool:", error);
      res.status(500).json({ error: "Failed to get tool" });
    }
  },

  async updateTool(req, res) {
    try {
      const { error, value } = updateToolSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, tool_id, tool_config } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only update tools for users in your hierarchy.",
        });
      }

      // Check if tool belongs to user (or any user in hierarchy) - same logic as getTool
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      let toolExists = userData.tools?.some(
        (tool) => tool.tool_id === tool_id,
      );

      console.log("In update tool COntroller is TOOl Existing", toolExists)

      // If not found in target user, check accessible users (for sub-admin/sub-admin-user aggregation)
      if (!toolExists && (requestingUserId === user_id)) {
        const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
            const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [uid, accessibleUserData] of usersMap) {
              if (accessibleUserData.tools?.some((tool) => tool.tool_id === tool_id)) {
                toolExists = true;
                break;
              }
            }
          }
        }
      }

      if (!toolExists) {
        return res
          .status(404)
          .json({ error: "Tool not found or does not belong to user" });
      }

      // Update tool in Eleven Labs
      const updatedTool = await elevenLabsToolService.updateTool(
        tool_id,
        tool_config,
      );

      // Log tool update
      await auditService.logToolAction(
        user_id,
        'updated',
        tool_id,
        `Updated tool with ID ${tool_id}`
      );

      res.json(updatedTool);
    } catch (error) {
      console.error("Error updating tool:", error);
      res.status(500).json({ error: "Failed to update tool" });
    }
  },

  async deleteTool(req, res) {
    try {
      const { error, value } = deleteToolSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, tool_id } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error: "Access denied. You can only delete tools for users in your hierarchy.",
        });
      }

      // Find the actual owner of the tool for deletion
      let actualOwnerDoc = null;
      let actualOwnerData = null;
      let toolExists = false;

      const userDoc = await db.collection("users").doc(user_id).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        toolExists = userData.tools?.some(
          (tool) => tool.tool_id === tool_id,
        );
        if (toolExists) {
          actualOwnerDoc = userDoc;
          actualOwnerData = userData;
        }
      }

      // If not found, check accessible users
      if (!toolExists && (requestingUserId === user_id)) {
        const requestingUserDoc = await db.collection("users").doc(requestingUserId).get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
            const accessibleUserIds = await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [uid, accessibleUserData] of usersMap) {
              if (accessibleUserData.tools?.some((tool) => tool.tool_id === tool_id)) {
                toolExists = true;
                // Note: We need to get the actual document ref for updates, but we already have the data
                // For deletion, we'll fetch the doc separately if needed
                actualOwnerData = accessibleUserData;
                // Store uid for later document fetch if needed
                const targetUid = uid;
                const targetDoc = await db.collection("users").doc(targetUid).get();
                if (targetDoc.exists) {
                  actualOwnerDoc = targetDoc;
                }
                break;
              }
            }
          }
        }
      }

      if (!toolExists || !actualOwnerDoc || !actualOwnerData) {
        return res
          .status(404)
          .json({ error: "Tool not found or does not belong to user" });
      }

      // Delete tool from Eleven Labs
      await elevenLabsToolService.deleteTool(tool_id);

      // Remove tool from actual owner's tools list
      const updatedTools = actualOwnerData.tools.filter(
        (tool) => tool.tool_id !== tool_id,
      );
      await actualOwnerDoc.ref.update({ tools: updatedTools });

      // Log tool deletion
      await auditService.logToolAction(
        user_id,
        'deleted',
        tool_id,
        `Deleted tool with ID ${tool_id}`
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tool:", error);
      res.status(500).json({ error: "Failed to delete tool" });
    }
  },
};

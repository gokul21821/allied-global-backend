import { db } from "../config/firebase.js";
import { elevenLabsPhoneNumberService } from "../services/elevenLabsPhoneNumber.js";
import {
  createPhoneNumberSchema,
  getPhoneNumberSchema,
  updatePhoneNumberSchema,
  deletePhoneNumberSchema,
  listPhoneNumbersSchema,
} from "../validators/phoneNumber.js";
import admin from "firebase-admin";
import { auditService } from "../services/auditService.js";
import {
  canAccessUserData,
  getAccessibleUserIds,
  getRequestingUserId,
  batchGetUsers,
} from "../utils/permissionUtils.js";

export const phoneNumberController = {
  async createPhoneNumber(req, res) {
    try {
      const { error, value } = createPhoneNumberSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, ...phoneNumberData } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can create phone numbers for target user
      if (requestingUserId !== user_id) {
        const canAccess = await canAccessUserData(requestingUserId, user_id);
        if (!canAccess) {
          return res.status(403).json({
            error:
              "Access denied. You can only create phone numbers for users in your hierarchy.",
          });
        }
      }

      // Check if user exists and get their current phone numbers
      const userRef = db.collection("users").doc(user_id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        await userRef.set({ phoneNumbers: [] });
      } else {
        // Check for duplicate phone number
        const userData = userDoc.data();
        const existingPhoneNumber = userData.phoneNumbers?.find(
          (pn) => pn.phone_number === phoneNumberData.phone_number,
        );

        if (existingPhoneNumber) {
          return res.status(409).json({
            error: "Phone number already exists for this user",
          });
        }
      }

      // Log the phone number data being sent (without sensitive info)
      console.log("Creating phone number:", {
        user_id,
        provider: phoneNumberData.provider,
        phone_number: phoneNumberData.phone_number,
        label: phoneNumberData.label,
      });

      // Create phone number in Eleven Labs
      const elevenLabsPhoneNumber =
        await elevenLabsPhoneNumberService.createPhoneNumber(phoneNumberData);

      const phoneNumberDetails = {
        phone_number_id: elevenLabsPhoneNumber.phone_number_id,
        phone_number: phoneNumberData.phone_number,
        provider: phoneNumberData.provider,
        label: phoneNumberData.label,
        created_at: new Date().toISOString(),
        ...(phoneNumberData.provider === "twilio" && {
          sid: phoneNumberData.sid,
          token: phoneNumberData.token,
        }),
        ...(phoneNumberData.provider === "sip_trunk" && {
          credentials: phoneNumberData.credentials,
          address: phoneNumberData.address,
        }),
      };

      await userRef.update({
        phoneNumbers: admin.firestore.FieldValue.arrayUnion(phoneNumberDetails),
      });

      // Log phone number creation
      await auditService.logPhoneNumberAction(
        user_id,
        "created",
        elevenLabsPhoneNumber.phone_number_id,
        `Created phone number ${phoneNumberData.phone_number} with provider ${phoneNumberData.provider}`,
      );

      res.status(201).json(elevenLabsPhoneNumber);
    } catch (error) {
      console.error("Error creating phone number:", error);

      // Pass through specific error messages from the service layer
      const errorMessage = error.message || "Failed to create phone number";
      const statusCode = error.message?.includes("already exists") ? 409 : 500;

      res.status(statusCode).json({
        error: errorMessage.replace("Error: ", ""),
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  },

  async getPhoneNumber(req, res) {
    try {
      const { error, value } = getPhoneNumberSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, phone_number_id } = req.params;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only view phone numbers for users in your hierarchy.",
        });
      }

      // Check if phone number belongs to user (or any user in hierarchy)
      const userDoc = await db.collection("users").doc(user_id).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      let phoneNumber = userData.phoneNumbers?.find(
        (pn) => pn.phone_number_id === phone_number_id,
      );

      // If not found in target user, check accessible users (for sub-admin/sub-admin-user aggregation)
      if (!phoneNumber && requestingUserId === user_id) {
        const requestingUserDoc = await db
          .collection("users")
          .doc(requestingUserId)
          .get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (
            requestingUserRole === "sub-admin" ||
            requestingUserRole === "sub-admin-user"
          ) {
            const accessibleUserIds =
              await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [, accessibleUserData] of usersMap) {
              const foundPhoneNumber = accessibleUserData.phoneNumbers?.find(
                (pn) => pn.phone_number_id === phone_number_id,
              );
              if (foundPhoneNumber) {
                phoneNumber = foundPhoneNumber;
                break;
              }
            }
          }
        }
      }

      if (!phoneNumber) {
        return res
          .status(404)
          .json({ error: "Phone number not found or does not belong to user" });
      }

      // Get phone number details from Eleven Labs and combine with stored data
      const phoneNumberDetails =
        await elevenLabsPhoneNumberService.getPhoneNumber(phone_number_id);

      // Merge the stored details with the API response
      const combinedDetails = {
        ...phoneNumberDetails,
        label: phoneNumber.label,
        ...(phoneNumber.sid && { sid: phoneNumber.sid }),
        ...(phoneNumber.token && { token: phoneNumber.token }),
        ...(phoneNumber.credentials && {
          credentials: phoneNumber.credentials,
        }),
        ...(phoneNumber.address && { address: phoneNumber.address }),
      };

      res.json(combinedDetails);
    } catch (error) {
      console.error("Error getting phone number:", error);
      res.status(500).json({ error: "Failed to get phone number" });
    }
  },

  async updatePhoneNumber(req, res) {
    try {
      const { error, value } = updatePhoneNumberSchema.validate({
        ...req.params,
        ...req.body,
      });
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, phone_number_id, agent_id, ...updateData } = value;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only update phone numbers for users in your hierarchy.",
        });
      }

      // Find the actual owner of the phone number
      let actualOwnerDoc = null;
      let actualOwnerData = null;
      let phoneNumberIndex = -1;

      const userDoc = await db.collection("users").doc(user_id).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const phoneNumbers = userData.phoneNumbers || [];
        phoneNumberIndex = phoneNumbers.findIndex(
          (pn) => pn.phone_number_id === phone_number_id,
        );
        if (phoneNumberIndex !== -1) {
          actualOwnerDoc = userDoc;
          actualOwnerData = userData;
        }
      }

      // If not found, check accessible users
      if (phoneNumberIndex === -1 && requestingUserId === user_id) {
        const requestingUserDoc = await db
          .collection("users")
          .doc(requestingUserId)
          .get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (
            requestingUserRole === "sub-admin" ||
            requestingUserRole === "sub-admin-user"
          ) {
            const accessibleUserIds =
              await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [uid, accessibleUserData] of usersMap) {
              const phoneNumbers = accessibleUserData.phoneNumbers || [];
              phoneNumberIndex = phoneNumbers.findIndex(
                (pn) => pn.phone_number_id === phone_number_id,
              );
              if (phoneNumberIndex !== -1) {
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

      if (phoneNumberIndex === -1 || !actualOwnerDoc || !actualOwnerData) {
        return res
          .status(404)
          .json({ error: "Phone number not found or does not belong to user" });
      }

      // Update phone number in Eleven Labs
      const updatePayload = {
        ...updateData,
        ...(agent_id ? { agent_id } : {}),
      };

      const updatedPhoneNumber =
        await elevenLabsPhoneNumberService.updatePhoneNumber(
          phone_number_id,
          updatePayload,
        );

      // Update the phone number details in Firebase
      const phoneNumbers = actualOwnerData.phoneNumbers || [];
      const updatedPhoneNumbers = [...phoneNumbers];
      updatedPhoneNumbers[phoneNumberIndex] = {
        ...phoneNumbers[phoneNumberIndex],
        ...updateData,
        ...(agent_id ? { agent_id } : {}), // Add agent_id to Firebase update if present
      };

      await actualOwnerDoc.ref.update({ phoneNumbers: updatedPhoneNumbers });

      // Log phone number update
      await auditService.logPhoneNumberAction(
        user_id,
        "updated",
        phone_number_id,
        `Updated phone number ${phoneNumbers[phoneNumberIndex].phone_number}`,
      );

      res.json(updatedPhoneNumber);
    } catch (error) {
      console.error("Error updating phone number:", error);
      res.status(500).json({ error: "Failed to update phone number" });
    }
  },

  async deletePhoneNumber(req, res) {
    try {
      const { error, value } = deletePhoneNumberSchema.validate(req.params);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { user_id, phone_number_id } = req.params;

      // Get current user from request
      const requestingUserId = getRequestingUserId(req, user_id);

      // Check if requesting user can access target user's data
      const canAccess = await canAccessUserData(requestingUserId, user_id);
      if (!canAccess) {
        return res.status(403).json({
          error:
            "Access denied. You can only delete phone numbers for users in your hierarchy.",
        });
      }

      // Find the actual owner of the phone number
      let actualOwnerDoc = null;
      let actualOwnerData = null;
      let phoneNumberToDelete = null;

      const userDoc = await db.collection("users").doc(user_id).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        phoneNumberToDelete = userData.phoneNumbers?.find(
          (pn) => pn.phone_number_id === phone_number_id,
        );
        if (phoneNumberToDelete) {
          actualOwnerDoc = userDoc;
          actualOwnerData = userData;
        }
      }

      // If not found, check accessible users
      if (!phoneNumberToDelete && requestingUserId === user_id) {
        const requestingUserDoc = await db
          .collection("users")
          .doc(requestingUserId)
          .get();
        if (requestingUserDoc.exists) {
          const requestingUserData = requestingUserDoc.data();
          const requestingUserRole = requestingUserData.role;

          if (
            requestingUserRole === "sub-admin" ||
            requestingUserRole === "sub-admin-user"
          ) {
            const accessibleUserIds =
              await getAccessibleUserIds(requestingUserId);
            const usersMap = await batchGetUsers(accessibleUserIds);

            for (const [uid, accessibleUserData] of usersMap) {
              phoneNumberToDelete = accessibleUserData.phoneNumbers?.find(
                (pn) => pn.phone_number_id === phone_number_id,
              );
              if (phoneNumberToDelete) {
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

      if (!phoneNumberToDelete || !actualOwnerDoc || !actualOwnerData) {
        return res
          .status(404)
          .json({ error: "Phone number not found or does not belong to user" });
      }

      // Delete phone number from Eleven Labs
      await elevenLabsPhoneNumberService.deletePhoneNumber(phone_number_id);

      // Remove phone number from actual owner's phone numbers list
      const updatedPhoneNumbers = actualOwnerData.phoneNumbers.filter(
        (pn) => pn.phone_number_id !== phone_number_id,
      );
      await actualOwnerDoc.ref.update({ phoneNumbers: updatedPhoneNumbers });

      // Log phone number deletion
      await auditService.logPhoneNumberAction(
        user_id,
        "deleted",
        phone_number_id,
        `Deleted phone number ${phoneNumberToDelete?.phone_number || phone_number_id}`,
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting phone number:", error);
      res.status(500).json({ error: "Failed to delete phone number" });
    }
  },

  async listPhoneNumbers(req, res) {
    try {
      const { error, value } = listPhoneNumbersSchema.validate(req.params);
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
          error:
            "Access denied. You can only view phone numbers for users in your hierarchy.",
        });
      }

      // Get requesting user data to check role
      const requestingUserDoc = await db
        .collection("users")
        .doc(requestingUserId)
        .get();
      if (!requestingUserDoc.exists) {
        return res.status(404).json({ error: "Requesting user not found" });
      }

      const requestingUserData = requestingUserDoc.data();
      const requestingUserRole = requestingUserData.role;

      // Get all phone numbers from Eleven Labs
      const allPhoneNumbers =
        await elevenLabsPhoneNumberService.listPhoneNumbers();

      // For sub-admin and sub-admin-user: aggregate phone numbers from all managed users
      if (
        (requestingUserRole === "sub-admin" ||
          requestingUserRole === "sub-admin-user") &&
        requestingUserId === user_id
      ) {
        // Get all accessible user IDs using the utility function
        const accessibleUserIds = await getAccessibleUserIds(requestingUserId);

        // Batch fetch all user documents in parallel
        const usersMap = await batchGetUsers(accessibleUserIds);

        // Collect all phone numbers from accessible users with owner tracking
        const allUserPhoneNumbers = [];
        const phoneNumberOwners = new Map(); // Map phone_number_id to owner user_id

        usersMap.forEach((accessibleUserData, uid) => {
          const phoneNumbers = accessibleUserData.phoneNumbers || [];
          phoneNumbers.forEach((pn) => {
            phoneNumberOwners.set(pn.phone_number_id, uid);
          });
          allUserPhoneNumbers.push(...phoneNumbers);
        });

        // Combine Eleven Labs data with stored Firebase data
        const enrichedPhoneNumbers = allPhoneNumbers.map((phoneNumber) => {
          const storedPhoneNumber = allUserPhoneNumbers.find(
            (pn) => pn.phone_number_id === phoneNumber.phone_number_id,
          );
          return storedPhoneNumber
            ? {
                ...phoneNumber,
                owner_user_id: phoneNumberOwners.get(
                  phoneNumber.phone_number_id,
                ), // Track owner
                label: storedPhoneNumber.label,
                ...(storedPhoneNumber.sid && { sid: storedPhoneNumber.sid }),
                ...(storedPhoneNumber.token && {
                  token: storedPhoneNumber.token,
                }),
                ...(storedPhoneNumber.credentials && {
                  credentials: storedPhoneNumber.credentials,
                }),
                ...(storedPhoneNumber.address && {
                  address: storedPhoneNumber.address,
                }),
              }
            : phoneNumber;
        });

        // Filter phone numbers to include those from all accessible users
        const userPhoneNumberIds = new Set(
          allUserPhoneNumbers.map((pn) => pn.phone_number_id),
        );
        const filteredPhoneNumbers = enrichedPhoneNumbers.filter((pn) =>
          userPhoneNumberIds.has(pn.phone_number_id),
        );

        res.json(filteredPhoneNumbers);
      } else {
        // For regular users or when accessing specific user_id: return that user's phone numbers
        const userDoc = await db.collection("users").doc(user_id).get();
        if (!userDoc.exists) {
          return res.status(404).json({ error: "User not found" });
        }

        const userData = userDoc.data();
        const userPhoneNumbers = userData.phoneNumbers || [];

        // Combine Eleven Labs data with stored Firebase data
        const enrichedPhoneNumbers = allPhoneNumbers.map((phoneNumber) => {
          const storedPhoneNumber = userPhoneNumbers.find(
            (pn) => pn.phone_number_id === phoneNumber.phone_number_id,
          );
          return storedPhoneNumber
            ? {
                ...phoneNumber,
                label: storedPhoneNumber.label,
                ...(storedPhoneNumber.sid && { sid: storedPhoneNumber.sid }),
                ...(storedPhoneNumber.token && {
                  token: storedPhoneNumber.token,
                }),
                ...(storedPhoneNumber.credentials && {
                  credentials: storedPhoneNumber.credentials,
                }),
                ...(storedPhoneNumber.address && {
                  address: storedPhoneNumber.address,
                }),
              }
            : phoneNumber;
        });

        // Filter phone numbers to only include those belonging to the user
        const userPhoneNumberIds = new Set(
          userPhoneNumbers.map((pn) => pn.phone_number_id),
        );
        const filteredPhoneNumbers = enrichedPhoneNumbers.filter((pn) =>
          userPhoneNumberIds.has(pn.phone_number_id),
        );

        res.json(filteredPhoneNumbers);
      }
    } catch (error) {
      console.error("Error listing phone numbers:", error);
      res.status(500).json({ error: "Failed to list phone numbers" });
    }
  },
};

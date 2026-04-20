import { db } from "../config/firebase.js";

/**
 * Helper function to check if current user can access target user's data
 * Returns true if user can access, false otherwise
 * 
 * @param {string} currentUserId - The ID of the user making the request
 * @param {string} targetUserId - The ID of the user whose data is being accessed
 * @returns {Promise<boolean>} - True if access is allowed, false otherwise
 */
export const canAccessUserData = async (currentUserId, targetUserId) => {
  // Same user always has access
  if (currentUserId === targetUserId) {
    return true;
  }

  // Get current user data
  const currentUserDoc = await db.collection("users").doc(currentUserId).get();
  if (!currentUserDoc.exists) {
    return false;
  }

  const currentUserData = currentUserDoc.data();
  const currentRole = currentUserData.role;

  // Super-admin can access anyone's data
  if (currentRole === "super-admin") {
    return true;
  }

  // Get target user data
  const targetUserDoc = await db.collection("users").doc(targetUserId).get();
  if (!targetUserDoc.exists) {
    return false;
  }

  const targetUserData = targetUserDoc.data();

  // For admin: check if target user is in their hierarchy
  if (currentRole === "admin") {
    // Direct creation - target was created by current admin
    if (targetUserData.createdBySubAdminId === currentUserId) {
      return true;
    }

    // Can access users created by other admins in their hierarchy
    if (targetUserData.createdByAdmin && targetUserData.createdBySubAdminId) {
      const creatorDoc = await db.collection("users").doc(targetUserData.createdBySubAdminId).get();
      if (creatorDoc.exists) {
        const creatorData = creatorDoc.data();
        // Creator must be an admin created by current admin
        if (creatorData.role === "admin" && creatorData.createdBySubAdminId === currentUserId) {
          return true;
        }
      }
    }
  }

  // For sub-admin and sub-admin-user: check if target user is in their hierarchy
  if (currentRole === "sub-admin" || currentRole === "sub-admin-user") {
    // Direct creation - target was created by current user
    if (targetUserData.createdBySubAdminId === currentUserId) {
      return true;
    }

    // For sub-admin-user: check if target was created by parent sub-admin OR by another sub-admin-user under same parent
    if (currentRole === "sub-admin-user" && currentUserData.createdBySubAdminId) {
      const parentSubAdminId = currentUserData.createdBySubAdminId;
      
      // Target was directly created by parent sub-admin
      if (targetUserData.createdBySubAdminId === parentSubAdminId) {
        return true;
      }
      
      // Target was created by another sub-admin-user under the same parent
      if (targetUserData.createdBySubAdminId) {
        const creatorDoc = await db.collection("users").doc(targetUserData.createdBySubAdminId).get();
        if (creatorDoc.exists) {
          const creatorData = creatorDoc.data();
          // If creator is a sub-admin-user created by same parent
          if (creatorData.createdBySubAdminId === parentSubAdminId && creatorData.role === "sub-admin-user") {
            return true;
          }
        }
      }
    }

    // For sub-admin: check if target was created by one of their sub-admin-users (directly or nested)
    if (currentRole === "sub-admin" && targetUserData.createdBySubAdminId) {
      // Recursively check the hierarchy
      let creatorId = targetUserData.createdBySubAdminId;
      let depth = 0;
      const maxDepth = 10; // Prevent infinite loops
      
      while (creatorId && depth < maxDepth) {
        const creatorDoc = await db.collection("users").doc(creatorId).get();
        if (!creatorDoc.exists) break;
        
        const creatorData = creatorDoc.data();
        
        // If creator is a sub-admin-user created by current sub-admin
        if (creatorData.createdBySubAdminId === currentUserId && creatorData.role === "sub-admin-user") {
          return true;
        }
        
        // Move up the hierarchy
        if (creatorData.createdBySubAdminId) {
          creatorId = creatorData.createdBySubAdminId;
          depth++;
        } else {
          break;
        }
      }
    }
  }

  return false;
};

/**
 * Get all user IDs that the requesting user can access (including themselves)
 * For sub-admin and sub-admin-user, this includes all managed users in their hierarchy
 * Optimized version that works in-memory instead of making individual DB calls
 * 
 * @param {string} requestingUserId - The ID of the user making the request
 * @returns {Promise<string[]>} - Array of user IDs that can be accessed
 */
export const getAccessibleUserIds = async (requestingUserId) => {
  const accessibleUserIds = new Set();
  accessibleUserIds.add(requestingUserId); // Always include self

  // Get all users in one query for efficient processing
  const allUsersSnapshot = await db.collection("users").get();
  
  // Build a map of userId -> userData for fast lookups
  const usersMap = new Map();
  allUsersSnapshot.forEach((docSnap) => {
    usersMap.set(docSnap.id, docSnap.data());
  });

  // Get requesting user data from map
  const requestingUserData = usersMap.get(requestingUserId);
  if (!requestingUserData) {
    return Array.from(accessibleUserIds);
  }

  const requestingUserRole = requestingUserData.role;

  // Super-admin can access all users
  if (requestingUserRole === "super-admin") {
    usersMap.forEach((_, userId) => {
      accessibleUserIds.add(userId);
    });
    return Array.from(accessibleUserIds);
  }

  // For admin: get all users in their admin hierarchy
  if (requestingUserRole === "admin") {
    // Get all users created directly by this admin
    usersMap.forEach((userData, userId) => {
      if (userData.createdBySubAdminId === requestingUserId) {
        accessibleUserIds.add(userId);
      }
    });

    // Get all users created by admins in this admin's hierarchy
    usersMap.forEach((userData, userId) => {
      if (userData.createdByAdmin && userData.createdBySubAdminId) {
        const creatorData = usersMap.get(userData.createdBySubAdminId);
        if (creatorData && creatorData.role === "admin" && creatorData.createdBySubAdminId === requestingUserId) {
          accessibleUserIds.add(userId);
        }
      }
    });
  }

  // For sub-admin and sub-admin-user: get all users in their hierarchy
  if (requestingUserRole === "sub-admin" || requestingUserRole === "sub-admin-user") {
    if (requestingUserRole === "sub-admin") {
      // Sub-admin: get all users they created (directly or through sub-admin-users)
      // Use in-memory hierarchy checking
      const checkHierarchy = (userId, visited = new Set()) => {
        if (visited.has(userId) || userId === requestingUserId) return;
        
        const userData = usersMap.get(userId);
        if (!userData) return;
        
        visited.add(userId);
        
        // Direct creation
        if (userData.createdBySubAdminId === requestingUserId) {
          accessibleUserIds.add(userId);
          // Recursively check users created by this user
          usersMap.forEach((targetData, targetId) => {
            if (targetData.createdBySubAdminId === userId) {
              checkHierarchy(targetId, visited);
            }
          });
        } else if (userData.createdBySubAdminId) {
          // Check if creator is a sub-admin-user created by current sub-admin
          const creatorData = usersMap.get(userData.createdBySubAdminId);
          if (creatorData && creatorData.createdBySubAdminId === requestingUserId && creatorData.role === "sub-admin-user") {
            accessibleUserIds.add(userId);
            // Recursively check users created by this user
            usersMap.forEach((targetData, targetId) => {
              if (targetData.createdBySubAdminId === userId) {
                checkHierarchy(targetId, visited);
              }
            });
          }
        }
      };

      // Process all users
      usersMap.forEach((_, userId) => {
        checkHierarchy(userId);
      });
    } else if (requestingUserRole === "sub-admin-user") {
      // Sub-admin-user: get all users accessible through parent sub-admin's hierarchy
      const parentSubAdminId = requestingUserData.createdBySubAdminId;
      
      if (parentSubAdminId) {
        // Get parent's accessible users first (using same logic)
        const parentAccessibleIds = new Set();
        parentAccessibleIds.add(parentSubAdminId);
        
        const checkParentHierarchy = (userId, visited = new Set()) => {
          if (visited.has(userId)) return;
          
          const userData = usersMap.get(userId);
          if (!userData) return;
          
          visited.add(userId);
          
          if (userData.createdBySubAdminId === parentSubAdminId) {
            parentAccessibleIds.add(userId);
            usersMap.forEach((targetData, targetId) => {
              if (targetData.createdBySubAdminId === userId) {
                checkParentHierarchy(targetId, visited);
              }
            });
          } else if (userData.createdBySubAdminId) {
            const creatorData = usersMap.get(userData.createdBySubAdminId);
            if (creatorData && creatorData.createdBySubAdminId === parentSubAdminId && creatorData.role === "sub-admin-user") {
              parentAccessibleIds.add(userId);
              usersMap.forEach((targetData, targetId) => {
                if (targetData.createdBySubAdminId === userId) {
                  checkParentHierarchy(targetId, visited);
                }
              });
            }
          }
        };

        usersMap.forEach((_, userId) => {
          checkParentHierarchy(userId);
        });

        // Add all users accessible through parent
        parentAccessibleIds.forEach(id => accessibleUserIds.add(id));
      }
      
      // Also get users created directly by this sub-admin-user
      usersMap.forEach((userData, userId) => {
        if (userData.createdBySubAdminId === requestingUserId) {
          accessibleUserIds.add(userId);
        }
      });
    }
  }

  return Array.from(accessibleUserIds);
};

/**
 * Batch fetch user documents in parallel for better performance
 * 
 * @param {string[]} userIds - Array of user IDs to fetch
 * @returns {Promise<Map<string, any>>} - Map of userId -> userData
 */
export const batchGetUsers = async (userIds) => {
  if (!userIds || userIds.length === 0) {
    return new Map();
  }

  // Fetch all users in parallel
  const userPromises = userIds.map(uid => 
    db.collection("users").doc(uid).get().then(doc => ({
      id: uid,
      data: doc.exists ? doc.data() : null,
      exists: doc.exists
    }))
  );

  const results = await Promise.all(userPromises);
  
  // Build map
  const usersMap = new Map();
  results.forEach(({ id, data, exists }) => {
    if (exists && data) {
      usersMap.set(id, data);
    }
  });

  return usersMap;
};

/**
 * Extract the requesting user ID from the request object
 * Checks multiple possible locations where the user ID might be stored
 * 
 * @param {Object} req - Express request object
 * @param {string} fallbackUserId - Fallback user ID (usually from params or body)
 * @returns {string} - The requesting user ID
 */
export const getRequestingUserId = (req, fallbackUserId) => {
  // Try to get from authenticated user (set by auth middleware)
  if (req.user?.uid) {
    return req.user.uid;
  }
  
  // Try to get from query parameters
  if (req.query?.requestingUserId) {
    return req.query.requestingUserId;
  }
  
  // Try to get from body
  if (req.body?.requestingUserId) {
    return req.body.requestingUserId;
  }
  
  // Fallback to provided user ID (usually from params or body)
  return fallbackUserId;
};
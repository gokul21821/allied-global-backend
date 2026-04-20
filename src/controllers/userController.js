// import { db } from "../config/firebase.js";
// import admin from "firebase-admin";
// import { deleteUserSchema, createManagedUserSchema, toggleUserStatusSchema } from "../validators/user.js";

// export const userController = {
//   async deleteUser(req, res) {
//     try {
//       const { error, value } = deleteUserSchema.validate(req.body);
//       if (error) {
//         return res.status(400).json({ error: error.details[0].message });
//       }

//       const { currentUserId, targetUserId } = value;

//       // First, verify that the current user is a super-admin
//       const currentUserDoc = await db.collection('users').doc(currentUserId).get();

//       if (!currentUserDoc.exists) {
//         return res.status(404).json({ error: 'Current user not found' });
//       }

//       const currentUserData = currentUserDoc.data();

//       // Verify target user exists
//       const targetUserDoc = await db.collection('users').doc(targetUserId).get();
//       if (!targetUserDoc.exists) {
//         return res.status(404).json({ error: 'Target user not found' });
//       }

//       const targetUserData = targetUserDoc.data();

//       // Check permissions: super-admin can delete anyone, sub-admin can delete their managed users
//       const isSuperAdmin = currentUserData.role === 'super-admin';
//       const isSubAdmin = currentUserData.role === 'sub-admin';
//       const isManagingThisUser = targetUserData.createdBySubAdminId === currentUserId;

//       if (!isSuperAdmin && !(isSubAdmin && isManagingThisUser)) {
//         return res.status(403).json({
//           error: 'Access denied. You can only delete users you manage.'
//         });
//       }

//       // Start batch operations
//       const batch = db.batch();

//       // 1. Delete the target user document
//       batch.delete(db.collection('users').doc(targetUserId));

//       // 2. Remove target user from current user's sentRequests
//       const newSentRequests = { ...currentUserData.sentRequests };
//       delete newSentRequests[targetUserId];

//       batch.update(db.collection('users').doc(currentUserId), {
//         sentRequests: newSentRequests,
//         updatedAt: admin.firestore.FieldValue.serverTimestamp()
//       });

//       // 3. Get all users to clean up references
//       const allUsersSnapshot = await db.collection('users').get();

//       allUsersSnapshot.docs.forEach(userDoc => {
//         if (userDoc.id === targetUserId || userDoc.id === currentUserId) return;

//         const userData = userDoc.data();
//         let needsUpdate = false;
//         const updates = {};

//         // Remove from sentRequests
//         if (userData.sentRequests && userData.sentRequests[targetUserId]) {
//           const newSentRequests = { ...userData.sentRequests };
//           delete newSentRequests[targetUserId];
//           updates.sentRequests = newSentRequests;
//           needsUpdate = true;
//         }

//         // Remove from receivedRequests
//         if (userData.receivedRequests && userData.receivedRequests[targetUserId]) {
//           const newReceivedRequests = { ...userData.receivedRequests };
//           delete newReceivedRequests[targetUserId];
//           updates.receivedRequests = newReceivedRequests;
//           needsUpdate = true;
//         }

//         if (needsUpdate) {
//           updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
//           batch.update(db.collection('users').doc(userDoc.id), updates);
//         }
//       });

//       // Execute all operations
//       await batch.commit();

//       // Try to delete from Firebase Auth (optional - may fail if no permissions)
//       try {
//         await admin.auth().deleteUser(targetUserId);
//         console.log('User deleted from Firebase Auth:', targetUserId);
//       } catch (authError) {
//         console.warn('Could not delete from Firebase Auth:', authError.message);
//         // Continue - Firestore deletion was successful
//       }

//       res.json({
//         success: true,
//         message: `User ${targetUserData.email} has been successfully deleted`,
//         deletedUserId: targetUserId
//       });

//     } catch (error) {
//       console.error('Error deleting user:', error);
//       res.status(500).json({
//         error: 'Internal server error',
//         details: error.message
//       });
//     }
//   },

//   async createManagedUser(req, res) {
//     try {
//       const { error, value } = createManagedUserSchema.validate(req.body);
//       if (error) {
//         return res.status(400).json({ error: error.details[0].message });
//       }

//       const { subAdminId, email, password } = value;

//       // Verify that the sub-admin exists and has the correct role
//       const subAdminDoc = await db.collection('users').doc(subAdminId).get();

//       if (!subAdminDoc.exists) {
//         return res.status(404).json({ error: 'Sub-admin not found' });
//       }

//       const subAdminData = subAdminDoc.data();

//       // Check if the user has sub-admin role
//       if (subAdminData.role !== 'sub-admin') {
//         return res.status(403).json({
//           error: 'Access denied. Only sub-admin users can create managed users.'
//         });
//       }

//       // Create the user in Firebase Auth
//       let userRecord;
//       try {
//         userRecord = await admin.auth().createUser({
//           email: email,
//           password: password,
//           emailVerified: false,
//         });
//       } catch (authError) {
//         console.error('Error creating user in Firebase Auth:', authError);
//         if (authError.code === 'auth/email-already-exists') {
//           return res.status(400).json({ error: 'Email already exists' });
//         }
//         return res.status(500).json({
//           error: 'Failed to create user account',
//           details: authError.message
//         });
//       }

//       // Create the user document in Firestore
//       const userData = {
//         name: email.split('@')[0], // Use email prefix as default name
//         email: email,
//         role: 'user',
//         createdByAdmin: false,
//         createdBySubAdminId: subAdminId,
//         isActive: true, // Default to active
//         createdAt: admin.firestore.FieldValue.serverTimestamp(),
//         updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//         hasToppedUp: false,
//         totalBalance: 0,
//         sentRequests: {},
//         receivedRequests: {}
//       };

//       await db.collection('users').doc(userRecord.uid).set(userData);

//       res.status(201).json({
//         success: true,
//         message: `Managed user created successfully`,
//         userId: userRecord.uid,
//         email: email
//       });

//     } catch (error) {
//       console.error('Error creating managed user:', error);
//       res.status(500).json({
//         error: 'Internal server error',
//         details: error.message
//       });
//     }
//   },

//   async toggleUserStatus(req, res) {
//     try {
//       const { error, value } = toggleUserStatusSchema.validate(req.body);
//       if (error) {
//         return res.status(400).json({ error: error.details[0].message });
//       }

//       const { currentUserId, targetUserId, isActive } = value;

//       // Verify that the current user exists
//       const currentUserDoc = await db.collection('users').doc(currentUserId).get();

//       if (!currentUserDoc.exists) {
//         return res.status(404).json({ error: 'Current user not found' });
//       }

//       const currentUserData = currentUserDoc.data();

//       // Verify target user exists
//       const targetUserDoc = await db.collection('users').doc(targetUserId).get();
//       if (!targetUserDoc.exists) {
//         return res.status(404).json({ error: 'Target user not found' });
//       }

//       const targetUserData = targetUserDoc.data();

//       // Check permissions: super-admin can toggle anyone, sub-admin can toggle their managed users
//       const isSuperAdmin = currentUserData.role === 'super-admin';
//       const isSubAdmin = currentUserData.role === 'sub-admin';
//       const isManagingThisUser = targetUserData.createdBySubAdminId === currentUserId;

//       if (!isSuperAdmin && !(isSubAdmin && isManagingThisUser)) {
//         return res.status(403).json({
//           error: 'Access denied. You can only manage users you created.'
//         });
//       }

//       // Update user status
//       await db.collection('users').doc(targetUserId).update({
//         isActive: isActive,
//         updatedAt: admin.firestore.FieldValue.serverTimestamp()
//       });

//       // Optionally disable/enable the user in Firebase Auth
//       try {
//         await admin.auth().updateUser(targetUserId, {
//           disabled: !isActive
//         });
//       } catch (authError) {
//         console.warn('Could not update Firebase Auth status:', authError.message);
//         // Continue - Firestore update was successful
//       }

//       res.json({
//         success: true,
//         message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
//         userId: targetUserId,
//         isActive: isActive
//       });

//     } catch (error) {
//       console.error('Error toggling user status:', error);
//       res.status(500).json({
//         error: 'Internal server error',
//         details: error.message
//       });
//     }
//   }
// };



import { db } from "../config/firebase.js";
import admin from "firebase-admin";
import { deleteUserSchema, createManagedUserSchema, toggleUserStatusSchema } from "../validators/user.js";

// Helper function to check if current user can manage target user
const canManageUser = (currentUser, targetUser) => {
  const currentUserId = currentUser.id;
  const currentRole = currentUser.role;

  // Super-admin can manage anyone
  if (currentRole === 'super-admin') {
    return true;
  }

  // Direct creation check - user can manage users they directly created
  // This works for both sub-admin and sub-admin-user
  if (targetUser.createdBySubAdminId === currentUserId) {
    return true;
  }

  // Both sub-admin and sub-admin-user can manage users in their hierarchy
  // Users created by their sub-admin-users or nested hierarchy
  if ((currentRole === 'sub-admin' || currentRole === 'sub-admin-user') && targetUser.createdBySubAdminId) {
    // Check if the creator is in the current user's hierarchy
    // This would require an additional DB query, so we'll handle it in the main functions
    return 'check_hierarchy';
  }

  // Admin can manage users in their hierarchy
  if (currentRole === 'admin' && targetUser.createdByAdmin) {
    return 'check_hierarchy';
  }

  return false;
};

export const userController = {
  async deleteUser(req, res) {
    try {
      const { error, value } = deleteUserSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { currentUserId, targetUserId } = value;

      // First, verify that the current user exists
      const currentUserDoc = await db.collection('users').doc(currentUserId).get();

      if (!currentUserDoc.exists) {
        return res.status(404).json({ error: 'Current user not found' });
      }

      const currentUserData = currentUserDoc.data();

      // Verify target user exists
      const targetUserDoc = await db.collection('users').doc(targetUserId).get();
      if (!targetUserDoc.exists) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      const targetUserData = targetUserDoc.data();

      // Check permissions using helper function
      const permissionCheck = canManageUser(
        {
          id: currentUserId,
          role: currentUserData.role,
          createdBySubAdminId: currentUserData.createdBySubAdminId
        },
        {
          role: targetUserData.role,
          createdBySubAdminId: targetUserData.createdBySubAdminId,
          createdByAdmin: targetUserData.createdByAdmin
        }
      );

      // If admin, check for admin hierarchy
      if (permissionCheck === 'check_hierarchy' && currentUserData.role === 'admin') {
        // Admin can only delete users created by admins in their hierarchy
        if (targetUserData.createdByAdmin && targetUserData.createdBySubAdminId) {
          const creatorDoc = await db.collection('users').doc(targetUserData.createdBySubAdminId).get();
          if (creatorDoc.exists) {
            const creatorData = creatorDoc.data();
            // Creator must be an admin created by current admin or the current admin themselves
            if (creatorData.role === 'admin' && (creatorData.createdBySubAdminId === currentUserId || targetUserData.createdBySubAdminId === currentUserId)) {
              // Permission granted - continue
            } else {
              return res.status(403).json({
                error: 'Access denied. You can only delete users within your admin hierarchy.'
              });
            }
          } else {
            return res.status(403).json({
              error: 'Access denied. You can only delete users within your admin hierarchy.'
            });
          }
        } else if (!targetUserData.createdByAdmin) {
          return res.status(403).json({
            error: 'Access denied. Admins can only delete users created by admins.'
          });
        }
      }
      // If sub-admin or sub-admin-user, check for nested hierarchy
      else if (permissionCheck === 'check_hierarchy' && (currentUserData.role === 'sub-admin' || currentUserData.role === 'sub-admin-user')) {
        // Check if target was created by someone in the current user's hierarchy
        if (targetUserData.createdBySubAdminId) {
          const creatorDoc = await db.collection('users').doc(targetUserData.createdBySubAdminId).get();
          if (creatorDoc.exists) {
            const creatorData = creatorDoc.data();

            // For sub-admin: creator must be a sub-admin-user created by this sub-admin
            if (currentUserData.role === 'sub-admin') {
              if (creatorData.createdBySubAdminId === currentUserId && creatorData.role === 'sub-admin-user') {
                // Permission granted - continue
              } else {
                return res.status(403).json({
                  error: 'Access denied. You can only delete users within your hierarchy.'
                });
              }
            }
            // For sub-admin-user: creator must be created by current user or be in their hierarchy
            else if (currentUserData.role === 'sub-admin-user') {
              // Direct creation by current user
              if (creatorData.createdBySubAdminId === currentUserId) {
                // Permission granted - continue
              }
              // Creator is a sub-admin-user created by current user
              else if (creatorData.role === 'sub-admin-user' && creatorData.createdBySubAdminId === currentUserId) {
                // Permission granted - continue
              }
              // Creator is another sub-admin-user created by same parent (sibling)
              else if (creatorData.role === 'sub-admin-user' && creatorData.createdBySubAdminId === currentUserData.createdBySubAdminId) {
                // Permission granted - continue
              }
              // Recursively check if creator's parent is in hierarchy
              else if (creatorData.createdBySubAdminId) {
                // Check if the creator was created by a sub-admin-user in current user's hierarchy
                const parentCreatorDoc = await db.collection('users').doc(creatorData.createdBySubAdminId).get();
                if (parentCreatorDoc.exists) {
                  const parentCreatorData = parentCreatorDoc.data();
                  // If parent creator was created by current user, allow
                  if (parentCreatorData.createdBySubAdminId === currentUserId) {
                    // Permission granted - continue
                  } else {
                    return res.status(403).json({
                      error: 'Access denied. You can only delete users within your hierarchy.'
                    });
                  }
                } else {
                  return res.status(403).json({
                    error: 'Access denied. You can only delete users within your hierarchy.'
                  });
                }
              } else {
                return res.status(403).json({
                  error: 'Access denied. You can only delete users within your hierarchy.'
                });
              }
            }
          } else {
            return res.status(403).json({
              error: 'Access denied. You can only delete users within your hierarchy.'
            });
          }
        } else {
          return res.status(403).json({
            error: 'Access denied. You can only delete users within your hierarchy.'
          });
        }
      } else if (!permissionCheck || permissionCheck === false) {
        return res.status(403).json({
          error: 'Access denied. You can only delete users within your hierarchy.'
        });
      }

      // Start batch operations
      const batch = db.batch();

      // 1. Delete the target user document
      batch.delete(db.collection('users').doc(targetUserId));

      // 2. Remove target user from current user's sentRequests
      const newSentRequests = { ...currentUserData.sentRequests };
      delete newSentRequests[targetUserId];

      batch.update(db.collection('users').doc(currentUserId), {
        sentRequests: newSentRequests,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 3. Get all users to clean up references
      const allUsersSnapshot = await db.collection('users').get();

      allUsersSnapshot.docs.forEach(userDoc => {
        if (userDoc.id === targetUserId || userDoc.id === currentUserId) return;

        const userData = userDoc.data();
        let needsUpdate = false;
        const updates = {};

        // Remove from sentRequests
        if (userData.sentRequests && userData.sentRequests[targetUserId]) {
          const newSentRequests = { ...userData.sentRequests };
          delete newSentRequests[targetUserId];
          updates.sentRequests = newSentRequests;
          needsUpdate = true;
        }

        // Remove from receivedRequests
        if (userData.receivedRequests && userData.receivedRequests[targetUserId]) {
          const newReceivedRequests = { ...userData.receivedRequests };
          delete newReceivedRequests[targetUserId];
          updates.receivedRequests = newReceivedRequests;
          needsUpdate = true;
        }

        if (needsUpdate) {
          updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          batch.update(db.collection('users').doc(userDoc.id), updates);
        }
      });

      // Execute all operations
      await batch.commit();

      // Try to delete from Firebase Auth (optional - may fail if no permissions)
      try {
        await admin.auth().deleteUser(targetUserId);
        console.log('User deleted from Firebase Auth:', targetUserId);
      } catch (authError) {
        console.warn('Could not delete from Firebase Auth:', authError.message);
        // Continue - Firestore deletion was successful
      }

      res.json({
        success: true,
        message: `User ${targetUserData.email} has been successfully deleted`,
        deletedUserId: targetUserId
      });

    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async createManagedUser(req, res) {
    try {
      console.log('Received request body:', req.body);

      const { error, value } = createManagedUserSchema.validate(req.body);
      if (error) {
        console.error('Validation error:', error.details[0].message);
        return res.status(400).json({ error: error.details[0].message });
      }

      const { subAdminId, email, password, role } = value;
      console.log('Validated values:', { subAdminId, email, role });

      // Verify that the creator exists and has the correct role
      const subAdminDoc = await db.collection('users').doc(subAdminId).get();

      if (!subAdminDoc.exists) {
        return res.status(404).json({ error: 'Creator not found' });
      }

      const subAdminData = subAdminDoc.data();
      const creatorRole = subAdminData.role;
      const isAdminCreator = creatorRole === 'admin' || creatorRole === 'super-admin';
      const hasSubAdminPrivileges = creatorRole === 'sub-admin' || creatorRole === 'sub-admin-user';

      // Only admins, sub-admins, and sub-admin-users can create users via this endpoint
      if (!isAdminCreator && !hasSubAdminPrivileges) {
        return res.status(403).json({
          error: 'Access denied. You do not have permission to create users.'
        });
      }

      // Validate the role parameter - ensure it's allowed for the creator role
      const allowedRoles = isAdminCreator ? ['user', 'sub-admin', 'admin', 'super-admin'] : ['user', 'sub-admin-user'];
      const finalRole = role || 'user'; // Default to 'user' if not provided

      if (!allowedRoles.includes(finalRole)) {
        return res.status(400).json({
          error: `Invalid role. Allowed roles for your account are: ${allowedRoles.join(', ')}`
        });
      }

      console.log('Creating user with role:', finalRole);

      // Create the user in Firebase Auth
      let userRecord;
      try {
        userRecord = await admin.auth().createUser({
          email: email,
          password: password,
          emailVerified: false,
        });
      } catch (authError) {
        console.error('Error creating user in Firebase Auth:', authError);
        if (authError.code === 'auth/email-already-exists') {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({
          error: 'Failed to create user account',
          details: authError.message
        });
      }

      // Create the user document in Firestore
      const userData = {
        name: email.split('@')[0], // Use email prefix as default name
        email: email,
        role: finalRole, // Use the validated role
        createdByAdmin: isAdminCreator,
        createdBySubAdminId: isAdminCreator ? null : subAdminId,
        isActive: true, // Default to active
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        hasToppedUp: false,
        totalBalance: 0,
        sentRequests: {},
        receivedRequests: {}
      };

      console.log('Creating Firestore document with userData:', userData);

      await db.collection('users').doc(userRecord.uid).set(userData);

      console.log('User created successfully with role:', finalRole);

      res.status(201).json({
        success: true,
        message: `Managed user created successfully with role: ${finalRole}`,
        userId: userRecord.uid,
        email: email,
        role: finalRole
      });

    } catch (error) {
      console.error('Error creating managed user:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  },

  async toggleUserStatus(req, res) {
    try {
      const { error, value } = toggleUserStatusSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { currentUserId, targetUserId, isActive } = value;

      // Verify that the current user exists
      const currentUserDoc = await db.collection('users').doc(currentUserId).get();

      if (!currentUserDoc.exists) {
        return res.status(404).json({ error: 'Current user not found' });
      }

      const currentUserData = currentUserDoc.data();

      // Verify target user exists
      const targetUserDoc = await db.collection('users').doc(targetUserId).get();
      if (!targetUserDoc.exists) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      const targetUserData = targetUserDoc.data();

      // Check permissions using helper function
      const permissionCheck = canManageUser(
        {
          id: currentUserId,
          role: currentUserData.role,
          createdBySubAdminId: currentUserData.createdBySubAdminId
        },
        {
          role: targetUserData.role,
          createdBySubAdminId: targetUserData.createdBySubAdminId,
          createdByAdmin: targetUserData.createdByAdmin
        }
      );

      // If admin, check for admin hierarchy
      if (permissionCheck === 'check_hierarchy' && currentUserData.role === 'admin') {
        // Admin can only toggle users created by admins in their hierarchy
        if (targetUserData.createdByAdmin && targetUserData.createdBySubAdminId) {
          const creatorDoc = await db.collection('users').doc(targetUserData.createdBySubAdminId).get();
          if (creatorDoc.exists) {
            const creatorData = creatorDoc.data();
            // Creator must be an admin created by current admin or the current admin themselves
            if (creatorData.role === 'admin' && (creatorData.createdBySubAdminId === currentUserId || targetUserData.createdBySubAdminId === currentUserId)) {
              // Permission granted - continue
            } else {
              return res.status(403).json({
                error: 'Access denied. You can only manage users within your admin hierarchy.'
              });
            }
          } else {
            return res.status(403).json({
              error: 'Access denied. You can only manage users within your admin hierarchy.'
            });
          }
        } else if (!targetUserData.createdByAdmin) {
          return res.status(403).json({
            error: 'Access denied. Admins can only manage users created by admins.'
          });
        }
      }
      // If sub-admin or sub-admin-user, check for nested hierarchy
      else if (permissionCheck === 'check_hierarchy' && (currentUserData.role === 'sub-admin' || currentUserData.role === 'sub-admin-user')) {
        // Check if target was created by someone in the current user's hierarchy
        if (targetUserData.createdBySubAdminId) {
          const creatorDoc = await db.collection('users').doc(targetUserData.createdBySubAdminId).get();
          if (creatorDoc.exists) {
            const creatorData = creatorDoc.data();

            // For sub-admin: creator must be a sub-admin-user created by this sub-admin
            if (currentUserData.role === 'sub-admin') {
              if (creatorData.createdBySubAdminId === currentUserId && creatorData.role === 'sub-admin-user') {
                // Permission granted - continue
              } else {
                return res.status(403).json({
                  error: 'Access denied. You can only manage users within your hierarchy.'
                });
              }
            }
            // For sub-admin-user: creator must be created by current user or be in their hierarchy
            else if (currentUserData.role === 'sub-admin-user') {
              // Direct creation by current user
              if (creatorData.createdBySubAdminId === currentUserId) {
                // Permission granted - continue
              }
              // Creator is a sub-admin-user created by current user
              else if (creatorData.role === 'sub-admin-user' && creatorData.createdBySubAdminId === currentUserId) {
                // Permission granted - continue
              }
              // Creator is another sub-admin-user created by same parent (sibling)
              else if (creatorData.role === 'sub-admin-user' && creatorData.createdBySubAdminId === currentUserData.createdBySubAdminId) {
                // Permission granted - continue
              }
              // Recursively check if creator's parent is in hierarchy
              else if (creatorData.createdBySubAdminId) {
                // Check if the creator was created by a sub-admin-user in current user's hierarchy
                const parentCreatorDoc = await db.collection('users').doc(creatorData.createdBySubAdminId).get();
                if (parentCreatorDoc.exists) {
                  const parentCreatorData = parentCreatorDoc.data();
                  // If parent creator was created by current user, allow
                  if (parentCreatorData.createdBySubAdminId === currentUserId) {
                    // Permission granted - continue
                  } else {
                    return res.status(403).json({
                      error: 'Access denied. You can only manage users within your hierarchy.'
                    });
                  }
                } else {
                  return res.status(403).json({
                    error: 'Access denied. You can only manage users within your hierarchy.'
                  });
                }
              } else {
                return res.status(403).json({
                  error: 'Access denied. You can only manage users within your hierarchy.'
                });
              }
            }
          } else {
            return res.status(403).json({
              error: 'Access denied. You can only manage users within your hierarchy.'
            });
          }
        } else {
          return res.status(403).json({
            error: 'Access denied. You can only manage users within your hierarchy.'
          });
        }
      } else if (!permissionCheck || permissionCheck === false) {
        return res.status(403).json({
          error: 'Access denied. You can only manage users within your hierarchy.'
        });
      }

      // Update user status
      await db.collection('users').doc(targetUserId).update({
        isActive: isActive,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Optionally disable/enable the user in Firebase Auth
      try {
        await admin.auth().updateUser(targetUserId, {
          disabled: !isActive
        });
      } catch (authError) {
        console.warn('Could not update Firebase Auth status:', authError.message);
        // Continue - Firestore update was successful
      }

      res.json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        userId: targetUserId,
        isActive: isActive
      });

    } catch (error) {
      console.error('Error toggling user status:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  }
};
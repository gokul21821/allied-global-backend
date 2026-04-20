import Joi from "joi";

export const deleteUserSchema = Joi.object({
  currentUserId: Joi.string().required(),
  targetUserId: Joi.string().required(),
});

export const createManagedUserSchema = Joi.object({
  subAdminId: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('user', 'sub-admin-user', 'sub-admin', 'admin', 'super-admin').default('user').messages({
    'any.only': 'Role must be "user", "sub-admin-user", "sub-admin", "admin", or "super-admin"'
  })
});

export const toggleUserStatusSchema = Joi.object({
  currentUserId: Joi.string().required(),
  targetUserId: Joi.string().required(),
  isActive: Joi.boolean().required(),
});

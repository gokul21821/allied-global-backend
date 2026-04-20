import Joi from "joi";

export const createToolSchema = Joi.object({
  user_id: Joi.string().required(),
  tool_config: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    type: Joi.string().required(),
    api_schema: Joi.object({
      url: Joi.string().uri().required(),
      method: Joi.string().optional(),
      path_params_schema: Joi.object().optional(),
      query_params_schema: Joi.object().optional(),
      request_body_schema: Joi.object().optional(),
      request_headers: Joi.object().optional(),
    }).optional(),
    parameters: Joi.object().optional(),
    expects_response: Joi.boolean().optional(),
    response_timeout_secs: Joi.number().optional(),
  }).pattern(/.*/, Joi.any()).required(),
});

export const getToolSchema = Joi.object({
  user_id: Joi.string().required(),
  tool_id: Joi.string().required(),
});

export const updateToolSchema = Joi.object({
  user_id: Joi.string().required(),
  tool_id: Joi.string().required(),
  tool_config: Joi.object({
    response_timeout_secs: Joi.number().optional(),
    type: Joi.string().optional(),
    api_schema: Joi.object({
      auth_connection: Joi.object().optional().allow(null),
      url: Joi.string().uri().required(),
      method: Joi.string().optional(),
      path_params_schema: Joi.object().optional().allow(null),
      query_params_schema: Joi.object().optional().allow(null),
      request_body_schema: Joi.object().optional().allow(null),
      request_headers: Joi.object().optional(),
      content_type: Joi.string().optional()
    }).required(),
    dynamic_variables: Joi.object({
      dynamic_variable_placeholders: Joi.object().optional(),
    }).optional(),
    description: Joi.string().required(),
    name: Joi.string().required(),
  }).pattern(/.*/, Joi.any()).required(),
});

export const deleteToolSchema = Joi.object({
  user_id: Joi.string().required(),
  tool_id: Joi.string().required(),
});

export const listToolsSchema = Joi.object({
  user_id: Joi.string().required(),
});

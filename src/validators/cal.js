
import Joi from 'joi';

export const bookingSchema = Joi.object({
  start: Joi.date().iso().required(),
  end: Joi.date().iso().min(Joi.ref('start')).required(),
  attendee: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    timeZone: Joi.string().required()
  }).required(),
  apiKey: Joi.string().required(),
});

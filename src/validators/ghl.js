
import Joi from 'joi';

export const bookingSchema = Joi.object({
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().min(Joi.ref('startTime')).required(),
  title: Joi.string().required(),
  timezone: Joi.string().required(),
  contactInfo: Joi.object({
    phone: Joi.string().required(),
  }).required(),
  apiKey: Joi.string().required(),
  calendarId: Joi.string().required(),
  locationId: Joi.string().required()
});

import axios from 'axios';
import { bookingSchema } from '../validators/cal.js';
import { db } from '../config/firebase.js';

const CAL_BASE_URL = 'https://api.cal.com/v2';

// These defaults come straight from your working curl example
const DEFAULT_BOOKING = {
  attendee: {
    language: 'en',
    name: 'Adam',
    timeZone: 'Asia/Kolkata',
    email: 'pranavg387@gmail.com',
  },
  start: '2025-05-09T06:00:00Z',
  eventTypeId: 2429643,
};

/**
 * POST /bookings with the exact payload shape you need,
 * logging both request and response (or error) for debugging.
 */
async function createBooking(calApiKey, attendee, start, eventTypeId) {
  // Merge any provided attendee fields on top of your defaults
  const payload = {
    attendee: {
      ...DEFAULT_BOOKING.attendee,
      ...attendee,
    },
    start,
    eventTypeId: Number(eventTypeId),
  };

  try {
    const resp = await axios.post(
      `${CAL_BASE_URL}/bookings`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${calApiKey}`,
          'cal-api-version': '2024-08-13',
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅ Cal.com response:', JSON.stringify(resp.data, null, 2));
    return resp.data;
  } catch (err) {
    if (err.response) {
      console.error('❌ Cal.com returned status', err.response.status);
      console.error(
        '❌ Error response body:',
        JSON.stringify(err.response.data, null, 2)
      );
      const serverMsg =
        err.response.data.message || JSON.stringify(err.response.data);
      throw new Error(`Booking creation failed: ${serverMsg}`);
    }
    console.error('🔥 Unexpected error:', err.message);
    throw new Error(`Booking creation failed: ${err.message}`);
  }
}

export const calController = {
  async bookSlot(req, res) {
    // 1. Validate request body
    const { error, value } = bookingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // 2. Apply defaults for anything missing
    const start = value.start || DEFAULT_BOOKING.start;
    const eventTypeId = value.eventTypeId || DEFAULT_BOOKING.eventTypeId;
    const rawAttendee = value.attendee || {};
    const attendee = {
      language:
        rawAttendee.language || DEFAULT_BOOKING.attendee.language,
      name: rawAttendee.name || DEFAULT_BOOKING.attendee.name,
      timeZone:
        rawAttendee.timeZone || DEFAULT_BOOKING.attendee.timeZone,
      email: rawAttendee.email || DEFAULT_BOOKING.attendee.email,
    };
    const calApiKey = value.apiKey || DEFAULT_BOOKING.apiKey

    try {
      if (!calApiKey) {
        return res
          .status(400)
          .json({ error: 'Cal.com credentials not configured' });
      }

      // 4. Create the booking
      const bookingData = await createBooking(
        calApiKey,
        attendee,
        start,
        eventTypeId
      );

      // 5. Success
      return res.status(201).json({
        message: 'Booking confirmed successfully',
        booking: bookingData,
      });
    } catch (err) {
      console.error('Booking error:', err.message);
      const statusCode = err.message.startsWith(
        'Booking creation failed'
      )
        ? 502
        : 500;
      return res.status(statusCode).json({ error: err.message });
    }
  },
  async checkSlots(req, res) {
    const { apiKey, calendarId, start, end } = req.body;

    // 1. Validate required fields
    if (!apiKey || !calendarId || !start || !end) {
      return res.status(400).json({
        error: 'Missing required fields: apiKey, calendarId, start, end',
      });
    }

    // 2. Construct the request to Cal.com
    const payload = {
      calendarId,
      start,
      end,
    };

    try {
      const response = await axios.post(
        `${CAL_BASE_URL}/availability/check`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'cal-api-version': '2024-08-13',
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(
        '✅ Cal.com check slots response:',
        JSON.stringify(response.data, null, 2)
      );

      return res.status(200).json({
        message: 'Available slots fetched successfully',
        slots: response.data,
      });
    } catch (err) {
      if (err.response) {
        console.error('❌ Cal.com error status:', err.response.status);
        console.error(
          '❌ Error response body:',
          JSON.stringify(err.response.data, null, 2)
        );
        return res
          .status(502)
          .json({ error: err.response.data.message || 'Cal.com error' });
      }
      console.error('🔥 Unexpected error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  },
};

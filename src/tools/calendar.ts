// =============================================================================
// Calendar Tool — Google Calendar integration
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { google } from "googleapis";

// --- List Events ---

export const listEventsTool = buildTool({
  name: "list_calendar_events",
  description: "List upcoming calendar events. Filter by date range, calendar, or search query.",
  category: "calendar",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    startDate: z.string().describe("ISO date string for range start (e.g., '2026-04-12T00:00:00Z')"),
    endDate: z.string().describe("ISO date string for range end"),
    query: z.string().optional().describe("Free-text search within events"),
    maxResults: z.number().optional().default(20),
    calendarId: z.string().optional().default("primary"),
  }),
  async call(input, context) {
    try {
      const auth = await getCalendarAuth(context);
      const calendar = google.calendar({ version: "v3", auth });

      const res = await calendar.events.list({
        calendarId: input.calendarId,
        timeMin: input.startDate,
        timeMax: input.endDate,
        q: input.query,
        maxResults: input.maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (res.data.items || []).map((e) => ({
        id: e.id,
        summary: e.summary,
        description: e.description,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location,
        attendees: e.attendees?.map((a) => ({ email: a.email, status: a.responseStatus })),
        status: e.status,
        organizer: e.organizer?.email,
      }));

      return { success: true, data: { count: events.length, events } };
    } catch (err) {
      return { success: false, error: `Failed to list events: ${err}` };
    }
  },
});

// --- Create Event ---

export const createEventTool = buildTool({
  name: "create_calendar_event",
  description: "Create a new calendar event with attendees, location, and reminders.",
  category: "calendar",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    summary: z.string().describe("Event title"),
    description: z.string().optional(),
    startTime: z.string().describe("ISO datetime for event start"),
    endTime: z.string().describe("ISO datetime for event end"),
    location: z.string().optional(),
    attendees: z.array(z.string()).optional().describe("List of attendee email addresses"),
    sendNotifications: z.boolean().optional().default(true),
    calendarId: z.string().optional().default("primary"),
  }),
  async call(input, context) {
    try {
      const auth = await getCalendarAuth(context);
      const calendar = google.calendar({ version: "v3", auth });

      const event = await calendar.events.insert({
        calendarId: input.calendarId,
        sendNotifications: input.sendNotifications,
        requestBody: {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: { dateTime: input.startTime },
          end: { dateTime: input.endTime },
          attendees: input.attendees?.map((email) => ({ email })),
          reminders: { useDefault: true },
        },
      });

      return {
        success: true,
        data: { eventId: event.data.id, htmlLink: event.data.htmlLink },
      };
    } catch (err) {
      return { success: false, error: `Failed to create event: ${err}` };
    }
  },
});

// --- Update Event ---

export const updateEventTool = buildTool({
  name: "update_calendar_event",
  description: "Update an existing calendar event (reschedule, change attendees, etc).",
  category: "calendar",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    eventId: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    location: z.string().optional(),
    addAttendees: z.array(z.string()).optional(),
    calendarId: z.string().optional().default("primary"),
  }),
  async call(input, context) {
    try {
      const auth = await getCalendarAuth(context);
      const calendar = google.calendar({ version: "v3", auth });

      // Fetch current event
      const existing = await calendar.events.get({
        calendarId: input.calendarId,
        eventId: input.eventId,
      });

      const update: Record<string, any> = {};
      if (input.summary) update.summary = input.summary;
      if (input.description) update.description = input.description;
      if (input.startTime) update.start = { dateTime: input.startTime };
      if (input.endTime) update.end = { dateTime: input.endTime };
      if (input.location) update.location = input.location;
      if (input.addAttendees) {
        const current = existing.data.attendees || [];
        update.attendees = [
          ...current,
          ...input.addAttendees.map((email) => ({ email })),
        ];
      }

      const result = await calendar.events.patch({
        calendarId: input.calendarId,
        eventId: input.eventId,
        requestBody: update,
      });

      return { success: true, data: { eventId: result.data.id, updated: Object.keys(update) } };
    } catch (err) {
      return { success: false, error: `Failed to update event: ${err}` };
    }
  },
});

// --- Find Free Slots ---

export const findFreeSlotsTool = buildTool({
  name: "find_free_slots",
  description: "Find available time slots in the calendar for scheduling meetings.",
  category: "calendar",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    startDate: z.string(),
    endDate: z.string(),
    durationMinutes: z.number().describe("Desired meeting duration in minutes"),
    workingHoursStart: z.number().optional().default(9).describe("Working hours start (24h)"),
    workingHoursEnd: z.number().optional().default(18).describe("Working hours end (24h)"),
    calendarId: z.string().optional().default("primary"),
  }),
  async call(input, context) {
    try {
      const auth = await getCalendarAuth(context);
      const calendar = google.calendar({ version: "v3", auth });

      const res = await calendar.events.list({
        calendarId: input.calendarId,
        timeMin: input.startDate,
        timeMax: input.endDate,
        singleEvents: true,
        orderBy: "startTime",
      });

      const busySlots = (res.data.items || [])
        .filter((e) => e.start?.dateTime && e.end?.dateTime)
        .map((e) => ({
          start: new Date(e.start!.dateTime!).getTime(),
          end: new Date(e.end!.dateTime!).getTime(),
        }));

      // Find gaps
      const freeSlots: Array<{ start: string; end: string }> = [];
      const duration = input.durationMinutes * 60 * 1000;
      const dayStart = new Date(input.startDate);
      const dayEnd = new Date(input.endDate);

      for (let d = new Date(dayStart); d < dayEnd; d.setDate(d.getDate() + 1)) {
        const workStart = new Date(d);
        workStart.setHours(input.workingHoursStart ?? 9, 0, 0, 0);
        const workEnd = new Date(d);
        workEnd.setHours(input.workingHoursEnd ?? 18, 0, 0, 0);

        let cursor = workStart.getTime();
        const dayBusy = busySlots.filter((s) => s.start < workEnd.getTime() && s.end > workStart.getTime());

        for (const busy of dayBusy) {
          if (busy.start - cursor >= duration) {
            freeSlots.push({
              start: new Date(cursor).toISOString(),
              end: new Date(cursor + duration).toISOString(),
            });
          }
          cursor = Math.max(cursor, busy.end);
        }

        if (workEnd.getTime() - cursor >= duration) {
          freeSlots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(cursor + duration).toISOString(),
          });
        }
      }

      return { success: true, data: { freeSlots: freeSlots.slice(0, 10) } };
    } catch (err) {
      return { success: false, error: `Failed to find free slots: ${err}` };
    }
  },
});

// --- Delete Event ---

export const deleteEventTool = buildTool({
  name: "delete_calendar_event",
  description: "Delete a calendar event by event ID. This is permanent and cannot be undone.",
  category: "calendar",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    eventId: z.string().describe("Google Calendar event ID"),
    calendarId: z.string().optional().default("primary"),
    sendNotifications: z.boolean().optional().default(true).describe("Send cancellation email to attendees"),
  }),
  async call(input, context) {
    try {
      const auth = await getCalendarAuth(context);
      const calendar = google.calendar({ version: "v3", auth });
      await calendar.events.delete({
        calendarId: input.calendarId,
        eventId: input.eventId,
        sendNotifications: input.sendNotifications,
      });
      return { success: true, data: { deleted: input.eventId, notified: input.sendNotifications } };
    } catch (err) {
      return { success: false, error: `Failed to delete event: ${err}` };
    }
  },
});

async function getCalendarAuth(context: any) {
  const keyPath = context.config.tools.googleServiceAccount;
  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
  }
  throw new Error("Google service account not configured");
}

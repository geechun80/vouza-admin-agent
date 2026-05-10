---
name: schedule-meeting
displayName: Meeting Scheduler
description: Find available time slots and schedule meetings with attendees
whenToUse: When the user asks to schedule, book, or arrange a meeting
category: calendar
allowedTools:
  - list_calendar_events
  - find_free_slots
  - create_calendar_event
  - send_email
  - send_slack_message
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember preferred meeting times and durations"
  onFailure: "Note scheduling conflicts and how they were resolved"
---

## Meeting Scheduling Workflow

1. **Understand the meeting request**:
   - Who needs to attend?
   - What is the purpose/agenda?
   - How long should it be? (default: 30 min for 1:1, 60 min for group)
   - Any preferred time slots?

2. **Find availability** using `find_free_slots`:
   - Check the next 5 working days
   - Respect working hours (9 AM - 6 PM)
   - Avoid lunch hour (12-1 PM) unless specified

3. **Propose time slots** — present top 3 options to user

4. **Create the event** using `create_calendar_event`:
   - Include agenda in description
   - Add all attendees
   - Set appropriate reminders

5. **Notify attendees** via email or Slack:
   - Send calendar invite (via event creation)
   - Optionally send a Slack heads-up

## Learning Notes
- Track preferred meeting lengths by type
- Track which attendees are frequently invited together
- Note recurring meetings that could be auto-scheduled

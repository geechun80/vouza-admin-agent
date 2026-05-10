---
name: daily-briefing
displayName: Daily Briefing
description: Generate a morning briefing with calendar, emails, and tasks summary
whenToUse: When the user starts their day or asks for a status update
category: general
allowedTools:
  - read_emails
  - list_calendar_events
  - read_spreadsheet
  - read_slack_messages
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember which sections the user finds most valuable"
  onFailure: "Adjust briefing format based on feedback"
---

## Daily Briefing Workflow

1. **Calendar Overview** — `list_calendar_events` for today + tomorrow:
   - List all meetings with times and attendees
   - Highlight back-to-back meetings (no break)
   - Note preparation needed for upcoming meetings

2. **Email Summary** — `read_emails` for unread:
   - Count: total unread, urgent, action required
   - Top 5 most important emails (by sender priority + subject)
   - Pending replies older than 24 hours

3. **Task Status** — check tracking spreadsheets:
   - Overdue items
   - Items due today
   - Items due this week

4. **Team Activity** — `read_slack_messages` from key channels:
   - Important announcements
   - Messages mentioning the user
   - Unresolved questions

5. **Format the Briefing**:
   ```
   🌅 Good morning! Here's your briefing for [DATE]:

   📅 TODAY'S SCHEDULE (X meetings)
   [timeline view]

   📧 INBOX (X unread, Y urgent)
   [top items]

   ✅ TASKS (X due today, Y overdue)
   [priority list]

   💬 TEAM UPDATES
   [highlights]

   🎯 RECOMMENDED PRIORITIES
   [top 3 suggested actions]
   ```

## Learning Notes
- Track which briefing sections get the most engagement
- Adjust priority scoring based on user behavior
- Note optimal briefing delivery time

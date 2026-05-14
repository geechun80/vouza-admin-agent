---
name: weekly-report
displayName: Weekly Report
description: Compile a weekly summary of emails, meetings, tasks, and output as a formatted report
category: productivity
whenToUse: Every Friday afternoon or when asked to prepare a weekly summary
allowedTools:
  - read_emails
  - list_calendar_events
  - search_memory
  - write_file
  - send_email
  - read_spreadsheet
---

# Weekly Report Skill

## Purpose
Compile a concise, executive-level weekly summary covering key communications, meetings held, decisions made, and action items outstanding.

## Process

### Step 1 — Gather this week's data
- Call `read_emails` with query `after:{monday_of_this_week} is:important` to get important emails
- Call `list_calendar_events` for Monday through Friday this week
- Call `search_memory` for "action item" and "follow up" to find outstanding items

### Step 2 — Synthesise into structured report
Format the report as:

```
WEEKLY REPORT — Week of {date}
Prepared by {agent_name}

EXECUTIVE SUMMARY
[2–3 sentence overview of the week]

KEY COMMUNICATIONS (top 5)
• [Sender] — [Subject] — [1-line summary] — [Action needed: yes/no]

MEETINGS HELD
• {Day} {Time} — {Title} — {Attendees} — {Key outcome}

DECISIONS MADE
• [Decision] — [Owner] — [Due date if applicable]

OUTSTANDING ACTION ITEMS
• [Item] — [Owner] — [Due date] — [Priority: H/M/L]

NEXT WEEK PREVIEW
• [Upcoming meeting or deadline worth flagging]
```

### Step 3 — Save and optionally send
- Call `write_file` to save the report as `reports/weekly-{YYYY-MM-DD}.txt`
- If the user has requested auto-send, call `send_email` to deliver to their specified recipient list

## Output
A formatted weekly report file saved locally, and optionally emailed.

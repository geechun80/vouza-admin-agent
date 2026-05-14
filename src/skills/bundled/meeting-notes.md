---
name: meeting-notes
displayName: Meeting Notes
description: Transcribe, summarise, and action-item a meeting recording or conversation dump
category: productivity
whenToUse: After a meeting concludes — when the user shares a recording, voice note, or raw transcript
allowedTools:
  - transcribe_audio
  - save_memory
  - write_file
  - send_email
  - draft_email
  - create_calendar_event
---

# Meeting Notes Skill

## Purpose
Convert a raw meeting recording or transcript into a structured summary with clear action items and follow-up calendar events.

## Process

### Step 1 — Transcribe if audio
If the user provides a file path or voice note:
- Call `transcribe_audio` with the file path
- Treat the transcript as the meeting input

### Step 2 — Extract structure
Parse the transcript to identify:
- **Meeting date, time, attendees** (from transcript context or user input)
- **Agenda items discussed**
- **Decisions made** (look for "we agreed", "decided", "confirmed", "approved")
- **Action items** (look for "will", "needs to", "by [date]", "TODO", names + verbs)
- **Open questions** (look for "to be confirmed", "TBD", "follow up")

### Step 3 — Format notes
```
MEETING NOTES — {Meeting Title}
Date: {date} | Attendees: {names}

AGENDA COVERED
• [Item 1]
• [Item 2]

KEY DECISIONS
• [Decision] — agreed by {person}

ACTION ITEMS
• [ ] {Task} — Owner: {name} — Due: {date}
• [ ] {Task} — Owner: {name} — Due: {date}

OPEN QUESTIONS
• {Question} — to be followed up by {person}

NEXT MEETING: {date/time if mentioned}
```

### Step 4 — Save and distribute
- Call `write_file` to save as `meetings/{YYYY-MM-DD}-{meeting-title}.txt`
- Call `save_memory` for each confirmed action item so it's retrievable later
- Optionally call `draft_email` to send notes to attendees (ask user first)
- If "Next meeting" was mentioned, call `create_calendar_event` to book it

## Output
Formatted meeting notes saved to disk, memories created for action items, optional email to attendees.

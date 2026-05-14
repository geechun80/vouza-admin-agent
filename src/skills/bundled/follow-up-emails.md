---
name: follow-up-emails
displayName: Follow-Up Emails
description: Identify emails awaiting a reply and draft polite follow-up messages
category: email
whenToUse: When asked to chase outstanding emails, check who hasn't replied, or send follow-ups
allowedTools:
  - read_emails
  - get_email_thread
  - reply_email
  - draft_email
  - save_memory
  - search_memory
---

# Follow-Up Emails Skill

## Purpose
Automatically identify sent emails with no reply after a configurable number of days and draft or send polite follow-up messages.

## Process

### Step 1 — Find emails needing follow-up
- Call `read_emails` with query `in:sent after:{N_days_ago}` (default: 3 days ago)
- For each sent email, call `get_email_thread` to check if a reply exists
- Flag threads where the **last message is from the user** (no reply received)

### Step 2 — Filter intelligently
Skip threads where:
- Subject starts with "Re:" and the last reply is from the other party
- Email was sent to a mailing list or no-reply address
- The user has marked the conversation as resolved in memory (call `search_memory` for the email subject)

### Step 3 — Draft follow-ups
For each flagged thread, draft a polite follow-up:

```
Subject: Re: {original subject}

Hi {first name},

I wanted to follow up on my email from {original_date} regarding {brief topic}.

{context-specific line — e.g. "Have you had a chance to review the proposal?" or "Please let me know if you need any additional information."}

Looking forward to hearing from you.

Best regards,
{sender name}
```

- Call `draft_email` to save each as a Gmail draft (user reviews before sending)
- OR call `reply_email` directly if the user has approved auto-send for follow-ups

### Step 4 — Memory update
- Call `save_memory` to record which threads were followed up and when, so we don't follow up twice

## Output
A list of threads that needed follow-up, with drafts created or replies sent.

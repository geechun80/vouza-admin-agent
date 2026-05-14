---
name: lead-qualification
displayName: Lead Qualification
description: Score and qualify inbound leads from email, assess fit, and draft personalised first responses
category: sales
whenToUse: When a new lead or inquiry email arrives; or when asked to assess a batch of inbound contacts
allowedTools:
  - read_emails
  - get_email_thread
  - search_memory
  - save_memory
  - draft_email
  - reply_email
  - write_spreadsheet
---

# Lead Qualification Skill

## Purpose
Review inbound inquiries, score leads against ideal customer profile (ICP) criteria stored in memory, draft personalised first-response emails, and log qualified leads to the pipeline spreadsheet.

## Process

### Step 1 — Read inbound inquiries
- Call `read_emails` with query `is:unread (inquiry OR "interested in" OR "quote" OR "pricing" OR "demo")` 
- For each email, call `get_email_thread` if it has prior context

### Step 2 — Load ICP from memory
- Call `search_memory` for "ideal customer profile" or "ICP" to get the user's stored qualification criteria
- If no ICP is saved, ask the user to define: industry, company size, budget range, decision-maker title

### Step 3 — Score each lead (0–10)
Score on:
| Criterion | Weight |
|---|---|
| Industry match | 25% |
| Company size / revenue | 20% |
| Decision-maker level (C-suite vs junior) | 20% |
| Clear pain point / urgency mentioned | 20% |
| Budget signals | 15% |

Classify:
- **8–10**: Hot lead — prioritise, draft immediate personalised reply
- **5–7**: Warm lead — draft reply, add to nurture sequence  
- **0–4**: Cold / not a fit — draft polite decline or no-reply

### Step 4 — Draft response emails
For each qualified lead, draft a personalised first response:
- Address their specific question or pain point
- Introduce the relevant product/service benefit
- Propose a clear next step (call, demo, proposal)
- Keep under 150 words — concise and direct

Call `draft_email` for each (user reviews before sending), or `reply_email` if auto-reply is approved.

### Step 5 — Log to pipeline
- Call `write_spreadsheet` to append each lead to the pipeline tracker:
  `| Date | Name | Company | Email | Score | Status | Notes | Next Action |`

### Step 6 — Save to memory
- Call `save_memory` for any new company/contact details learned (type: contact)

## Output
Scored lead list, drafted responses ready for review, pipeline spreadsheet updated.

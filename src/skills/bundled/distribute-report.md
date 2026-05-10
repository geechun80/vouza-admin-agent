---
name: distribute-report
displayName: Report Distributor
description: Send the right report to the right person at the right time, with delivery tracking and retry on failure
whenToUse: When the user needs to send reports to a list of recipients, or on a scheduled basis
category: general
allowedTools:
  - read_spreadsheet
  - draft_email
  - send_email
  - send_telegram_message
  - send_whatsapp_message
  - write_spreadsheet
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember which recipients prefer which channels and formats"
  onFailure: "Log failed sends and retry automatically on next run"
---

## Report Distribution Workflow

1. **Load the distribution list** from the configured spreadsheet:
   - Columns: Name | Email | Telegram/WhatsApp | Report Type | Schedule
2. **Fetch the relevant report** (or generate it via `analytics-report` skill if not yet produced)
3. **Personalise per recipient**:
   - Filter report data to their scope (their team, region, or role)
   - Use their preferred format (summary vs. full detail)
   - Address by name in the message
4. **Send via preferred channel**:
   - Email: attach full report, include summary in body
   - Telegram: send summary text with key numbers
   - WhatsApp: short summary only (under 300 words)
5. **Log each send** to delivery tracker sheet:
   - Columns: Timestamp | Recipient | Channel | Status | Error (if any)
6. **Retry failed sends** once after 10 minutes
7. **Final summary** to the admin/user:
   - X sent successfully
   - Y failed (list names and errors)

## Schedule Support
- Daily summary: weekdays at 8:00 AM
- Weekly report: Monday at 7:00 AM
- Monthly wrap-up: 1st of each month at 9:00 AM
- On-demand: triggered by user message

## Learning Notes
- Build recipient preference profiles (channel, detail level, timing)
- Track open/response rates to optimise send times
- Remember which report formats generate the most follow-up questions

---
name: triage-email
displayName: Email Triage
description: Automatically categorize, prioritize, and organize incoming emails
whenToUse: When the user asks to check, sort, or manage their inbox
category: email
allowedTools:
  - read_emails
  - triage_emails
  - draft_email
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember the triage rules that worked well"
  onFailure: "Note which emails were miscategorized and why"
---

## Email Triage Workflow

1. **Read unread emails** using `read_emails` with query `is:unread`
2. **Categorize each email** into priority levels:
   - **URGENT**: From executives, clients, contains "urgent/asap/deadline"
   - **ACTION**: Requires a response or task completion
   - **FYI**: Newsletters, updates, CC'd emails
   - **SPAM/LOW**: Promotions, automated notifications
3. **Apply labels** using `triage_emails`:
   - Star urgent emails
   - Label action items as "Action Required"
   - Archive FYI items after noting them
4. **Draft replies** for urgent items using `draft_email`
5. **Report summary** to user:
   - Count by category
   - Highlight top 3 urgent items
   - List action items with suggested next steps

## Learning Notes
- Track which senders the user always responds to (mark as priority)
- Track which senders the user always archives (mark as low priority)
- Adapt categorization rules based on feedback

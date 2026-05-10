---
name: handle-support
displayName: Support Handler
description: Triage and respond to incoming support requests across email, Telegram, and WhatsApp
whenToUse: When a user asks for help, reports a problem, or sends a support request via any channel
category: support
allowedTools:
  - read_emails
  - draft_email
  - send_telegram_message
  - send_whatsapp_message
  - read_file
  - write_file
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember resolution patterns and phrases that satisfied the user"
  onFailure: "Note misclassified issues and incorrect resolutions"
---

## Support Handling Workflow

1. **Identify the channel** — email, Telegram, or WhatsApp
2. **Read the message** and extract:
   - What the user is asking or reporting
   - Urgency level (blocker, question, feedback)
   - Any error messages, screenshots, or context provided
3. **Classify the issue**:
   - **BLOCKER**: System down, can't log in, data lost → respond within 15 min
   - **QUESTION**: How-to, feature request, clarification → respond within 2 hours
   - **FEEDBACK**: Suggestions, complaints, praise → acknowledge and log
4. **Check memory** for known solutions to this type of issue
5. **Draft a response**:
   - Acknowledge the issue with empathy ("I understand this is frustrating...")
   - Provide a clear solution or next step
   - If unknown, say so honestly and give an estimated resolution time
   - Sign off warmly
6. **Send via the same channel** the message came in on
7. **Log the interaction** to support tracking file with: date, channel, issue type, resolution

## Tone Guide
- **Blockers**: Calm, fast, action-focused — "Here's what to do right now..."
- **Questions**: Friendly and clear — avoid jargon
- **Feedback**: Grateful and genuine — "Thank you for taking the time..."

## Learning Notes
- Build a library of common issues and proven resolutions
- Track which users contact frequently (flag for proactive outreach)
- Note which response styles get positive follow-ups vs. escalations

---
name: draft-reply
displayName: Email Reply Drafter
description: Draft professional email replies matching the user's tone and style
whenToUse: When the user asks to reply to an email or draft a response
category: email
allowedTools:
  - read_emails
  - draft_email
  - send_email
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember tone and phrases the user approved"
  onFailure: "Note corrections to tone, content, or style"
---

## Email Reply Drafting Workflow

1. **Read the original email** using `read_emails` with body included
2. **Analyze context**:
   - Who is the sender? (check memory for relationship/history)
   - What is being asked or discussed?
   - What tone is appropriate? (formal for clients, casual for team)
   - Are there action items to address?
3. **Draft the reply** considering:
   - Match the formality level of the original
   - Address all questions/points raised
   - Be concise but thorough
   - Include next steps if applicable
   - Use the user's preferred sign-off (check memory)
4. **Create draft** using `draft_email` — never auto-send
5. **Present to user** for review with:
   - The draft content
   - Key points addressed
   - Suggested modifications

## Tone Guide (adapt from memory)
- **Clients/External**: Professional, warm, solution-oriented
- **Executives**: Concise, data-driven, action-focused
- **Team/Internal**: Friendly, direct, collaborative
- **Vendors**: Professional, clear requirements, firm on deadlines

## Learning Notes
- Build a profile of the user's writing style over time
- Track preferred greetings and sign-offs
- Note which types of replies get edited vs sent as-is

---
name: summarize-email
description: Search for a specific email, read its contents, and summarize it based on custom instructions.
---

# Summarize Email

## Objective
Find a specific email based on a query, read its contents, and generate a summary according to the user's instructions.

## Prerequisites
- The agent must be connected to a working Gmail or email account.

## Workflow

1.  **Search for the Email**:
    - Use the `read_emails` tool.
    - Set the `query` argument to match the user's criteria (e.g., "from:boss@company.com", "subject:Weekly Update", "is:unread").
    - Set `includeBody: true` so the tool retrieves the full email contents immediately.

2.  **Read and Analyze**:
    - If multiple emails match, find the most relevant one (usually the most recent).
    - Read the `body` of the selected email.

3.  **Summarize per Instructions**:
    - Analyze the email content based on the *exact instructions* provided by the user. 
    - If the user asks for key takeaways, list them. If they ask for action items, extract them.
    - If no specific summarization instructions are provided, produce a concise summary of the sender's main points, the purpose of the email, and any obvious action items or deadlines.

4.  **Present the Summary**:
    - Deliver the final summary to the user in a clear, formatted response. Include the email's original Subject, Date, and Sender for context.

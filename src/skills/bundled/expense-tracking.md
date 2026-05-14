---
name: expense-tracking
displayName: Expense Tracking
description: Extract expenses from emails/files, categorise them, and update the expenses spreadsheet
category: finance
whenToUse: When processing receipts, invoices, or expense emails; or when asked to log/report expenses
allowedTools:
  - read_emails
  - read_file
  - read_spreadsheet
  - write_spreadsheet
  - write_file
  - save_memory
---

# Expense Tracking Skill

## Purpose
Capture expense data from emails, PDFs, and images, categorise each expense, and maintain a running Google Sheet or local CSV ledger.

## Process

### Step 1 — Gather expense sources
Options (use whichever applies):
- **Email receipts**: Call `read_emails` with query `subject:(receipt OR invoice OR "your order") after:{date}`
- **Uploaded files**: Call `read_file` on any PDF, image, or Excel receipt the user provides
- **Existing sheet**: Call `read_spreadsheet` on the configured expenses spreadsheet to see current entries

### Step 2 — Extract expense fields
For each source, extract:
| Field | Description |
|---|---|
| date | Transaction date |
| vendor | Company/person paid |
| description | What it was for |
| amount | Numeric value |
| currency | SGD, USD, etc. |
| category | See categories below |
| receipt_ref | Invoice number or email subject |

**Default categories**: Travel, Accommodation, Meals, Software, Office, Marketing, Professional Services, Miscellaneous

### Step 3 — Append to ledger
- Call `write_spreadsheet` to append new rows to the expenses sheet
- Format: each row = one expense line item with the 7 fields above
- If no spreadsheet is configured, call `write_file` to append to `expenses/expenses-{YYYY-MM}.csv`

### Step 4 — Generate summary (if requested)
Calculate:
- Total by category
- Total by month
- Largest single expense

Format as a plain-text summary and include in the response.

### Step 5 — Memory
- Call `save_memory` to record recurring vendors (e.g., "AWS = Software, monthly ~$X")

## Output
Updated expense ledger with new entries, plus a summary of what was added.

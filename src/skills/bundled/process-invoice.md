---
name: process-invoice
displayName: Invoice Processor
description: Extract data from invoices and log them in spreadsheets
whenToUse: When the user asks to process, log, track, or manage invoices
category: data-entry
allowedTools:
  - read_emails
  - read_file
  - read_spreadsheet
  - write_spreadsheet
  - organize_files
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember the invoice format and spreadsheet mapping"
  onFailure: "Note extraction errors and correct field mappings"
---

## Invoice Processing Workflow

1. **Find invoices** — check email attachments or a designated folder
2. **Extract key fields** from each invoice:
   - Invoice number
   - Vendor/supplier name
   - Date issued
   - Due date
   - Line items (description, quantity, unit price)
   - Total amount
   - Currency
   - Payment terms
3. **Validate data**:
   - Check for duplicate invoice numbers in the tracking sheet
   - Verify math (line items sum = total)
   - Flag anomalies (unusually high amounts, past-due dates)
4. **Log to spreadsheet** using `write_spreadsheet`:
   - Append to the invoice tracking sheet
   - Format: [Date | Invoice# | Vendor | Amount | Due Date | Status]
5. **Organize files** using `organize_files`:
   - Move processed invoices to `Processed/YYYY-MM/` folder
6. **Report**:
   - Summary of processed invoices
   - Any flagged items needing attention
   - Upcoming payment deadlines

## Learning Notes
- Map vendor-specific invoice formats for faster extraction
- Track payment patterns to predict cash flow
- Remember which vendors need prompt payment

---
name: data-entry
displayName: Data Entry Assistant
description: Extract data from various sources and enter into spreadsheets or databases
whenToUse: When the user asks to enter data, update records, or fill in spreadsheets
category: data-entry
allowedTools:
  - read_file
  - read_emails
  - read_spreadsheet
  - write_spreadsheet
  - search_spreadsheet
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember field mappings and validation rules"
  onFailure: "Note data quality issues and correct mappings"
---

## Data Entry Workflow

1. **Identify the data source**:
   - Email attachments (invoices, forms, reports)
   - Local files (CSV, JSON, text)
   - Verbal/text instructions from user
   - Other spreadsheets (cross-sheet transfer)

2. **Identify the target**:
   - Which spreadsheet and sheet?
   - What columns/fields to populate?
   - Any existing data to match against?

3. **Extract and validate**:
   - Parse source data into structured fields
   - Check for duplicates using `search_spreadsheet`
   - Validate data types (dates, numbers, emails)
   - Flag missing required fields

4. **Enter data** using `write_spreadsheet`:
   - Append mode for new records
   - Update mode for corrections
   - Preserve existing formatting

5. **Verify and report**:
   - Read back entered data to confirm
   - Report: X records added, Y skipped (duplicates), Z flagged (issues)

## Validation Rules (learn and expand)
- Email: must contain @
- Phone: strip non-digits, check length
- Date: normalize to YYYY-MM-DD
- Currency: strip symbols, ensure numeric
- Names: Title Case

## Learning Notes
- Build field mapping profiles per spreadsheet
- Track common data quality issues per source
- Remember user's preferred date/number formats

---
name: consolidate-data
displayName: Data Consolidator
description: Pull data from multiple sources (email, sheets, files) and merge into a single structured report or spreadsheet
whenToUse: When the user needs to combine, summarise, or reconcile data from more than one source
category: data-entry
allowedTools:
  - read_emails
  - read_spreadsheet
  - write_spreadsheet
  - read_file
  - organize_files
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember which source mappings and merge rules worked correctly"
  onFailure: "Note data mismatches, missing fields, or merge conflicts"
---

## Data Consolidation Workflow

1. **Identify sources** — ask the user (or infer from context) which sheets, files, or emails contain the data
2. **Read each source** and extract the relevant fields
3. **Normalise the data**:
   - Standardise date formats (YYYY-MM-DD)
   - Unify currency to a single format
   - Deduplicate rows by key field (e.g. invoice number, order ID)
   - Flag any rows with missing required fields
4. **Merge into a master structure**:
   - Append new rows to the master sheet
   - Update existing rows where the key field matches
   - Mark conflicts (same key, different values) for user review
5. **Validate totals**:
   - Cross-check sums against source totals
   - Flag discrepancies greater than 1%
6. **Write to destination** using `write_spreadsheet`
7. **Report**:
   - Rows added, updated, skipped
   - Conflicts needing manual review
   - Summary totals for key numeric fields

## Common Consolidation Tasks
- Weekly expense reports from multiple staff → one master expense sheet
- Sales data from email attachments → running pipeline tracker
- Inventory counts from multiple locations → unified stock sheet

## Learning Notes
- Remember field mapping per source (e.g. "Vendor Name" in source A = "Supplier" in source B)
- Track which sources are reliable vs. frequently inconsistent
- Store merge rules so repeat consolidations run automatically

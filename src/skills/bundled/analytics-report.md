---
name: analytics-report
displayName: Analytics Reporter
description: Generate a weekly performance report from spreadsheets and email data, with KPIs, trends, and recommendations
whenToUse: When the user asks for a performance summary, weekly report, KPI update, or business health check
category: general
allowedTools:
  - read_spreadsheet
  - write_spreadsheet
  - read_emails
  - draft_email
  - send_email
  - send_telegram_message
selfImproveHooks:
  learnFrom: true
  onSuccess: "Remember which metrics and formats the user finds most useful"
  onFailure: "Note missing data sources or metrics that were incorrect"
---

## Analytics Report Workflow

1. **Determine report scope** — weekly (default), monthly, or custom date range
2. **Pull data** from configured spreadsheets and email summaries
3. **Calculate KPIs**:
   - Revenue / volume this period vs. last period (% change)
   - Top performers or top items
   - Items below target (flag in red)
   - Running totals YTD
4. **Identify trends**:
   - 3-period moving average for key metrics
   - Any metric that changed more than 15% week-over-week
   - Patterns worth noting (consistent growth, seasonal dip, etc.)
5. **Write the report** in this structure:
   ```
   📊 WEEKLY REPORT — [Date Range]

   ✅ HIGHLIGHTS
   - [Best result this week]
   - [Notable achievement]

   📈 KEY METRICS
   | Metric | This Week | Last Week | Change |
   |--------|-----------|-----------|--------|
   | ...    | ...       | ...       | ...    |

   ⚠️ ATTENTION NEEDED
   - [Metric below target and why]

   🎯 RECOMMENDATIONS
   1. [Action based on data]
   2. [Action based on trend]
   ```
6. **Save report** to archive sheet (one row per period)
7. **Distribute**:
   - Send via Telegram for quick read
   - Send full version by email if requested

## Learning Notes
- Track which KPIs the user checks first (reorder to top)
- Remember distribution list for weekly reports
- Note which recommendations were acted on vs. ignored

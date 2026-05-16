---
name: Vouza Admin Agent Tool Audit
description: Backend quality audit (May 2026) of all 11 tool files in src/tools/ — error handling, missing operations, credential paths, partial stubs
type: project
---

Audit conducted against: email.ts, calendar.ts, fileManager.ts, spreadsheet.ts, messenger.ts, telegram.ts, whatsapp.ts, voice.ts, memory.ts, security.ts, setup.ts + loop.ts + router.ts

Key findings:

1. Email: sendEmailTool uses nodemailer+appPassword path; readEmailsTool/draftEmailTool use OAuth service-account path. Mixed auth — if only appPassword is configured, read/draft fail. Missing: delete_email, search_emails (standalone), get_email_thread, reply_email (inline). maxResults hardcoded default 10.

2. Calendar: No delete_event tool. updateEventTool cannot remove attendees (addAttendees only). findFreeSlots slices result to 10 hardcoded (line 231). Missing timezone awareness.

3. Files: Strong coverage. Missing: delete_file, copy_file, move_file (organize_files only does bulk rename/move). readFileTool does not call security scanner before parsing — user-supplied paths bypass scanFile().

4. Spreadsheet: Missing create_spreadsheet, delete_rows, format_cells, batch_update. write_spreadsheet values schema only accepts string[][] — no number/boolean passthrough.

5. Messaging (Slack): Missing read_thread_replies, add_reaction, upload_file_to_slack, delete_message.

6. Telegram: readTelegramUpdatesTool uses long-polling getUpdates — will conflict with any webhook setup. Missing send_document, send_photo, delete_message, pin_message.

7. WhatsApp: readViaWaha (line 188) returns raw data.messages without error-checking res.ok or data structure — silent failure risk. Missing: send_media, get_chats_list, mark_as_read.

8. Voice: Solid. No missing obvious ops. transcribeAndSummarizeTool returns reportInstructions for the LLM to execute rather than calling itself — design decision, not a bug.

9. Memory: forgetMemoryTool returns {success:false, data:{...}} on not-found instead of {success:false, error:...} (line 95) — inconsistent contract.

10. Security: Not wired into readFileTool or fileManager — scanFile() exists but is never called by the tool layer. Security is advisory only.

11. Setup: saveIntegrationCredentialsTool writes process.env at runtime (lines 705-815) — works for current process only, does not survive worker restarts. CONFIG_PATH is relative to process.cwd() which may differ in production.

Loop/Router: loop.ts slides conversation window at 40 messages (line 437) but does NOT persist the trimmed history to disk — full history lost on restart. Every turn writes a perf_log memory entry regardless of outcome (line 460) — pollutes memory store at scale.

**Why:** Recorded to inform future sprint planning and avoid re-auditing the same gaps.
**How to apply:** Reference when user asks to add new tool ops, fix credential bugs, or improve security gating.

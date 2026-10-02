
// ============================================================
// SVG Icons
// ============================================================
const ICONS = {
  gmail:    `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="#4285F4" stroke-width="1.5"/><path d="M2 6l10 7 10-7" stroke="#EA4335" stroke-width="1.5"/><path d="M2 20l7-5M22 20l-7-5" stroke="#34A853" stroke-width="1.2"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="#25D366"/><path d="M8.5 7.5c-.3 0-.7.1-.9.5-.3.4-1 1.1-1 2.7s1.1 3.1 1.2 3.3c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.4-.2-.8-.4s-1.8-.9-2.1-1c-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.3.2-.7 0s-1.3-.5-2.4-1.5c-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.7-1-2.4-.3-.5-.5-.5-.7-.5h-.6z" fill="white"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0088cc"/><path d="M6.5 11.5l2.5-1 8.5-4.5-1.5 5-3 5.5-2.5-2.5z" fill="white" opacity="0.9"/><path d="M9 10.5l5.5-3.5-3 5.5z" fill="#cce5ff" opacity="0.5"/></svg>`,
  slack:    `<svg viewBox="0 0 24 24"><path d="M6 15a2 2 0 01-2-2 2 2 0 012-2h2v2a2 2 0 01-2 2zm3-2a2 2 0 012-2 2 2 0 012 2v5a2 2 0 01-2 2 2 2 0 01-2-2v-5z" fill="#E01E5A"/><path d="M11 6a2 2 0 01-2-2 2 2 0 012-2 2 2 0 012 2v2h-2zm0 3a2 2 0 012 2 2 2 0 01-2 2H6a2 2 0 01-2-2 2 2 0 012-2h5z" fill="#36C5F0"/><path d="M18 11a2 2 0 012 2 2 2 0 01-2 2h-2v-2a2 2 0 012-2zm-3 2a2 2 0 01-2 2 2 2 0 01-2-2V8a2 2 0 012-2 2 2 0 012 2v5z" fill="#2EB67D"/><path d="M13 18a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2v-2h2zm0-3a2 2 0 01-2-2 2 2 0 012-2h5a2 2 0 012 2 2 2 0 01-2 2h-5z" fill="#ECB22E"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" stroke-width="1.5" fill="none"/><path d="M3 9h18" stroke="#4285F4" stroke-width="1.5"/><path d="M8 2v4M16 2v4" stroke="#4285F4" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="14" r="1.5" fill="#EA4335"/><circle cx="12" cy="14" r="1.5" fill="#34A853"/><circle cx="16" cy="14" r="1.5" fill="#FBBC05"/></svg>`,
  sheets:   `<svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="#34A853"/><path d="M8 8h8M8 12h8M8 16h5" stroke="white" stroke-width="1.2" stroke-linecap="round"/><path d="M12 6v14" stroke="white" stroke-width="0.8" opacity="0.5"/></svg>`,
  drive:    `<svg viewBox="0 0 24 24"><path d="M8 4l4 7H2l4-7z" fill="#4285F4"/><path d="M16 4l-4 7h10l-4-7z" fill="#FBBC05"/><path d="M6 20l4-9h8l-4 9z" fill="#34A853"/><path d="M10 11l4 9H6z" fill="#EA4335" opacity="0.7"/></svg>`,
  crm:      `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="#8b5cf6" stroke-width="1.5" fill="none"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7" stroke="#8b5cf6" stroke-width="1.5" fill="none"/></svg>`,
  google:   `<svg viewBox="0 0 24 24"><path d="M12 11v2.5h4.2c-.3 1.5-1.7 3-4.2 3-2.5 0-4.5-2-4.5-4.5S9.5 7.5 12 7.5c1.2 0 2.3.5 3.1 1.3l1.8-1.8C15.6 5.8 13.9 5 12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7c4 0 6.7-2.8 6.7-6.8 0-.4 0-.8-.1-1.2H12z" fill="#4285F4"/></svg>`,
  anthropic:`<svg viewBox="0 0 24 24"><path d="M12 3l8 18H4L12 3z" fill="#D97757" opacity="0.85"/><path d="M12 7l5 12H7L12 7z" fill="#D97757"/></svg>`,
  openai:   `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#10a37f" stroke-width="1.5" fill="none"/><path d="M8 12l3 3 5-6" stroke="#10a37f" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`,
  googleai: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#4285F4" stroke-width="1.5" fill="none"/><path d="M9 9l3 3-3 3M12 12h3" stroke="#4285F4" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`,
  xai:      `<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4" fill="#111"/><path d="M5 5l14 14M5 19L19 5" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  deepseek: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#4D6BFE" stroke-width="1.5" fill="none"/><path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#4D6BFE" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="1.5" fill="#4D6BFE"/></svg>`,
  alibaba:  `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="#6236FF" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="bold" fill="#6236FF">Q</text></svg>`,
  moonshot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#555" stroke-width="1.5" fill="none"/><path d="M9 8a6 6 0 000 8 4 4 0 010-8z" fill="#888"/></svg>`,
  openrouter:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#7c3aed" stroke-width="1.5"/><path d="M7 12h10M14 9l3 3-3 3" stroke="#a855f7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="12" r="1.5" fill="#7c3aed"/></svg>`,
  mic:      `<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="11" rx="3" stroke="#10b981" stroke-width="1.5"/><path d="M5 10a7 7 0 0014 0" stroke="#10b981" stroke-width="1.5" stroke-linecap="round"/><path d="M12 17v5M8 22h8" stroke="#10b981" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  groq:     `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#f97316" stroke-width="1.5"/><path d="M9 9c0-1.7 1.3-3 3-3s3 1.3 3 3v3a3 3 0 01-6 0V9z" fill="#f97316" opacity="0.8"/><path d="M12 15v4" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  agentmail: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" fill="#6366f1"/><path d="M2 6l10 7 10-7" stroke="white" stroke-width="1.5"/><circle cx="18" cy="16" r="3" fill="#22d3ee"/><path d="M16.5 16l1 1 1.5-2" stroke="white" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

const PROVIDER_COLORS = {
  anthropic:'#D97757', openai:'#10a37f', google:'#4285F4',
  xai:'#888', deepseek:'#4D6BFE', alibaba:'#6236FF', moonshot:'#888',
  openrouter:'#7c3aed',
};

// ============================================================
// Data Definitions
// ============================================================
const CHANNELS = [
  { id:'email',    name:'Email',    desc:'Read, send, and triage emails automatically.',           icon:'gmail',    badge:'popular',
    providers:[{v:'gmail',l:'Gmail'},{v:'outlook',l:'Outlook / Microsoft 365'},{v:'smtp',l:'Custom SMTP'},{v:'agentmail',l:'AgentMail (Dedicated Inbox)'}] },
  { id:'whatsapp', name:'WhatsApp', desc:'Send tasks, get results — straight from your WhatsApp. Your PC runs the AI, you chat from anywhere.',
    icon:'whatsapp', badge:'popular', mobile:true,
    howTo:[
      { text:'Select <strong>WhatsApp Web (Free)</strong> — uses the Baileys protocol (no extra software needed)' },
      { text:'Launch your agent, then click <strong>Connect WhatsApp</strong> — a QR code appears in the dashboard' },
      { text:'Open WhatsApp on your phone → <strong>Settings → Linked Devices → Link a Device</strong> → scan QR' },
      { text:'Once linked, message your own number — your AI will reply instantly!' },
    ],
    providers:[{v:'web',l:'WhatsApp Web (Free — scan QR)'},{v:'twilio',l:'Twilio'},{v:'meta',l:'Meta Cloud API'},{v:'waha',l:'WAHA (Self-hosted)'}] },
  { id:'telegram', name:'Telegram', desc:'Create a private Telegram bot — message it from your phone to control your AI from anywhere.',
    icon:'telegram', badge:'free', mobile:true,
    howTo:[
      { text:'Open Telegram → search <a href="https://t.me/BotFather" target="_blank"><strong>@BotFather</strong></a>' },
      { text:'Send <strong>/newbot</strong> → choose a name and a username' },
      { text:'Copy the <strong>Bot Token</strong> and paste it in the field below' },
      { text:'Message your bot from any device to control your AI' },
    ],
  },
  // Slack deferred — Bolt SDK + Socket Mode listener not yet implemented
];

const TOOLS = [
  { id:'calendar',    name:'Calendar',     desc:'Book meetings and manage your schedule.',   icon:'calendar', badge:'popular',
    providers:[{v:'google',l:'Google Calendar'},{v:'outlook',l:'Outlook Calendar'}] },
  { id:'spreadsheet', name:'Spreadsheets', desc:'Track data, invoices, and records.',       icon:'sheets',
    providers:[{v:'google',l:'Google Sheets'},{v:'excel',l:'Excel Online'},{v:'airtable',l:'Airtable'}] },
  { id:'fileStorage', name:'File Storage', desc:'Organise and manage your documents.',      icon:'drive',
    providers:[{v:'local',l:'Local Files (Free)'},{v:'gdrive',l:'Google Drive'},{v:'onedrive',l:'OneDrive'}] },
  { id:'crm',         name:'CRM',          desc:'Manage contacts and customer records.',    icon:'crm',
    providers:[{v:'hubspot',l:'HubSpot'},{v:'notion',l:'Notion'}] },
  { id:'voice', name:'Voice Transcription', desc:'Convert voice notes & audio files to text for reports, summaries, and meeting notes.', icon:'mic', badge:'free',
    providers:[{v:'groq',l:'Groq Whisper (Free & Fast)'},{v:'openai',l:'OpenAI Whisper'}] },
];

// Each skill declares the integrations it needs. Prereqs are shown in the UI
// as ✓ Ready (green) or ⚠️ Needs setup (amber). Missing prereqs don't block
// the user from enabling the skill — it just won't do anything until they
// connect the required app in Step 2.
const SKILLS = [
  // ── Communication ────────────────────────────────────────────────────────
  { id:'triage-email',     name:'Email Triage',        desc:'Sorts and prioritises your inbox automatically.',                icon:'📧',
    category:'communication', requires:{channels:['email']},
    schedules:[{v:'',l:'Manual only'},{v:'0 */2 * * 1-5',l:'Every 2 hours (weekdays)',sel:true},{v:'0 */1 * * 1-5',l:'Every hour'},{v:'0 9,13,17 * * 1-5',l:'3× daily'}] },
  { id:'draft-reply',      name:'Email Reply Writer',  desc:'Drafts professional replies in your tone — you approve before sending.', icon:'✏️',
    category:'communication', requires:{channels:['email']},
    schedules:[{v:'',l:'Manual only',sel:true}] },

  // ── Daily Workflow ───────────────────────────────────────────────────────
  { id:'daily-briefing',   name:'Morning Briefing',    desc:'A daily summary of your calendar, emails, and tasks.',          icon:'☀️',
    category:'workflow',  requires:{anyOf:{channels:['email'],tools:['calendar']}},
    schedules:[{v:'',l:'Manual only'},{v:'30 8 * * 1-5',l:'8:30 AM weekdays',sel:true},{v:'0 9 * * 1-5',l:'9:00 AM weekdays'},{v:'0 8 * * *',l:'8:00 AM daily'}] },
  { id:'schedule-meeting', name:'Meeting Scheduler',   desc:'Finds free slots and books meetings for you.',                   icon:'📅',
    category:'workflow',  requires:{tools:['calendar']},
    schedules:[{v:'',l:'Manual only',sel:true}] },

  // ── Documents & Data ─────────────────────────────────────────────────────
  { id:'process-invoice',  name:'Invoice Processor',   desc:'Extracts invoice data and logs it in your spreadsheets.',        icon:'📋',
    category:'documents', requires:{channels:['email'],tools:['spreadsheet']},
    schedules:[{v:'',l:'Manual only',sel:true},{v:'0 10 * * 1-5',l:'Daily 10 AM'},{v:'0 10 * * 1',l:'Weekly Monday'}] },
  { id:'data-entry',       name:'Data Entry Assistant',desc:'Pulls data from sources and enters it into your spreadsheets.', icon:'📝',
    category:'documents', requires:{anyOf:{tools:['spreadsheet','fileStorage']}},
    schedules:[{v:'',l:'Manual only',sel:true}] },
];

// Visual grouping for the skill list. Order here = display order on the page.
const SKILL_CATEGORIES = [
  { id:'communication', name:'Communication',   icon:'💬', desc:'Email triage, replies, and threads' },
  { id:'workflow',      name:'Daily Workflow',  icon:'📅', desc:'Morning briefings + meeting scheduling' },
  { id:'documents',     name:'Documents & Data',icon:'📂', desc:'Invoices, spreadsheets, data entry' },
];

// Three opinionated starting points. One click sets enabled skills + cadences
// + self-learning interval so users don't have to guess. Each preset stores
// a {skillId: cron} map — empty string means "manual only".
const SKILL_PRESETS = [
  { id:'beginner', name:'Beginner', icon:'🌱', tag:'Easy start',
    desc:'You stay in control. AI summarises and suggests — never sends without you.',
    bestFor:'New to AI assistants. Just want a daily summary.',
    skills:{
      'triage-email':    '0 9,13,17 * * 1-5',   // 3× daily check
      'daily-briefing':  '30 8 * * 1-5',         // morning summary
    },
    selfImproveHours: 168,                       // weekly — minimal change
  },
  { id:'intermediate', name:'Intermediate', icon:'⚖️', tag:'Recommended',
    desc:'Hands-off triage and reply drafts. You approve every send. Best balance.',
    bestFor:'Most people — comfortable with AI but want a human review on outbound messages.',
    skills:{
      'triage-email':    '0 */2 * * 1-5',       // every 2 hours
      'daily-briefing':  '30 8 * * 1-5',
      'schedule-meeting':'',                     // available when asked
      'draft-reply':     '',                     // drafts in inbox, you send
    },
    selfImproveHours: 24,
  },
  { id:'advanced', name:'Advanced', icon:'🚀', tag:'Max automation',
    desc:'Continuous automation across every connected tool. Best when you trust it.',
    bestFor:'Power users with all integrations connected and review processes in place.',
    skills:{
      'triage-email':    '0 */1 * * 1-5',       // hourly
      'daily-briefing':  '0 8 * * *',            // every day, not just weekdays
      'schedule-meeting':'',
      'draft-reply':     '',
      'process-invoice': '0 10 * * 1-5',         // weekday morning sweep
      'data-entry':      '',
    },
    selfImproveHours: 12,
  },
];

const CRED_CONFIGS = {
  whatsapp: {
    // Baileys built-in flow needs NO fields — the dashboard generates a QR
    // automatically. Earlier versions asked for a "Server URL" which confused
    // users (it was only used by the legacy external-server flow, not Baileys).
    // Customers typed http://localhost:3001 or even the public web.whatsapp.com
    // URL there, then wondered why connection hung. Removed entirely.
    web:    { title:'WhatsApp Web (Free — QR Scan)', icon:'whatsapp', testType:'whatsapp-web', fields:[], info:'No setup needed here. After saving, click the green <strong>Connect WhatsApp</strong> button below to generate a QR code and scan it from your phone (WhatsApp → Settings → Linked Devices → Link a Device).' },
    twilio: { title:'WhatsApp via Twilio', icon:'whatsapp', testType:'whatsapp', fields:[{id:'twilioSid',label:'Account SID',type:'text',placeholder:'ACxxx'},{id:'twilioToken',label:'Auth Token',type:'password',placeholder:'token'},{id:'twilioNum',label:'WhatsApp Number',type:'text',placeholder:'+1415...'}] },
    meta:   { title:'WhatsApp Cloud API', icon:'whatsapp', testType:'whatsapp-meta', fields:[{id:'metaToken',label:'Access Token',type:'password',placeholder:'EAAxx'},{id:'metaPhoneId',label:'Phone Number ID',type:'text',placeholder:'123456'}] },
    waha:   { title:'WAHA (Self-hosted)', icon:'whatsapp', testType:'waha', fields:[{id:'wahaUrl',label:'WAHA Server URL',type:'text',placeholder:'http://localhost:3000',hint:'URL where WAHA is running (default port 3000)'},{id:'wahaSession',label:'Session Name',type:'text',placeholder:'default',hint:'Session name from your WAHA dashboard (usually "default")'},{id:'wahaKey',label:'API Key (required)',type:'password',placeholder:'the WAHA_API_KEY you started WAHA with',hint:'Required — only WAHA with this key can send messages to your assistant'}] },
  },
  telegram: { default:{ title:'Telegram Bot', icon:'telegram', testType:'telegram', fields:[
    {id:'telegramToken',label:'Bot Token',type:'password',placeholder:'123456789:ABCdef...',hint:'Get from <a href="https://t.me/BotFather" target="_blank">@BotFather on Telegram →</a>'},
    {id:'telegramWebhookUrl',label:'Webhook URL (optional)',type:'text',placeholder:'https://your-server.com',hint:'<strong>Cloud deployments only.</strong> Leave blank for local installs — long-polling is used automatically. Set to your public HTTPS URL (e.g. Fly.io, Railway, Render) to let Telegram push updates instead of the agent polling. The agent appends <code>/api/telegram/webhook</code> to this URL.'},
  ] } },
  // slack: deferred — Bolt SDK + Socket Mode
  email: {
    gmail:   { title:'Gmail', icon:'gmail', testType:'gmail', fields:[
      {id:'gmailUser',label:'Gmail Address',type:'email',placeholder:'you@gmail.com'},
      {id:'gmailPass',label:'App Password',type:'password',placeholder:'xxxx xxxx xxxx xxxx',
        hint:'<strong>How to get your App Password:</strong> <a href="https://myaccount.google.com/security" target="_blank">Google Account → Security</a> → enable 2-Step Verification → scroll down to <strong>App passwords</strong> → create one for "Mail". Paste the 16-character code here. No spaces needed. <a href="https://myaccount.google.com/apppasswords" target="_blank">Go directly →</a>'}
    ] },
    outlook: { title:'Outlook / Microsoft 365', icon:'gmail', testType:'outlook', fields:[{id:'outlookClientId',label:'Azure App Client ID',type:'text',placeholder:'xxxxxxxx-xxxx'},{id:'outlookSecret',label:'Client Secret',type:'password',placeholder:'secret'},{id:'outlookTenant',label:'Tenant ID',type:'text',placeholder:'xxxxxxxx-xxxx'}] },
    agentmail: { title:'AgentMail — Dedicated Agent Inbox', icon:'agentmail', testType:'agentmail', fields:[
      {id:'agentmailKey', label:'AgentMail API Key', type:'password', placeholder:'am_...', hint:'Get your free key at <a href="https://agentmail.to" target="_blank">agentmail.to →</a> — your agent gets its own email address (e.g. my-agent@agentmail.to)'},
      {id:'agentmailUsername', label:'Inbox Username (optional)', type:'text', placeholder:'my-agent', hint:'Lowercase letters, numbers, hyphens only. Leave blank to auto-generate. Your address will be username@agentmail.to'},
    ]},
  },
  voice: {
    groq:   { title:'Groq Voice (Free & Fast)', icon:'groq', testType:'groq-whisper', fields:[{id:'groqApiKey',label:'Groq API Key',type:'password',placeholder:'gsk_...',hint:'Free at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys →</a> · Works for Anthropic &amp; OpenRouter users too'}] },
    openai: { title:'OpenAI Whisper', icon:'openai', testType:'openai-whisper', fields:[{id:'openaiVoiceKey',label:'OpenAI API Key (for Voice)',type:'password',placeholder:'sk-...',hint:'Get at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys →</a>'}] },
  },
};

// ============================================================
// App State
// ============================================================
const state = {
  step: 1, totalSteps: 4,
  selectedChannels: new Set(),
  selectedTools: new Set(),
  enabledSkills: new Set(['triage-email','daily-briefing','schedule-meeting','draft-reply']),
  activePresetId: 'intermediate',                 // default to Recommended preset
  connStatus: {},
  // Default model + OpenRouter tiers come from the server (/api/operator-defaults
  // → config/models.ts), so model IDs live in one place, not in the browser too.
  selectedModel: '',
  selectedProvider: 'anthropic',
  modelCatalog: [],
  orTiers: {},
  // Live model lists, loaded only when asked: provider → { loading, models, error, needsKey }
  liveModels: {},
  liveFilter: { q: '', toolsOnly: true, freeOnly: false },
  // Operator-supplied default key (set by Vouza, invisible to end-users)
  // null = loading, {} = no default key, {hasDefaultKey:true,...} = key available
  operatorDefaults: null,
};

const STEPS = [
  { num:1, label:'Create Your AI' },
  { num:2, label:'Connect Apps'   },
  { num:3, label:'Train Your AI'  },
  { num:4, label:'Go Live'        },
];

// ============================================================
// Resume Detection — runs on page load before user does anything
// ============================================================
let _savedConfig = null;
let _isResume    = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    _savedConfig = cfg;

    // Detect partial setup: credentials exist but setup not marked complete
    const hasApiKey  = Object.values(cfg.credentials || {}).some(v => v && String(v).length > 4);
    const hasChan    = Object.values(cfg.channels  || {}).some(ch => ch.enabled);
    const isPartial  = !cfg.setupCompleted && (hasApiKey || hasChan);
    const isReconfig = !!cfg.setupCompleted;

    if (isReconfig) {
      // Production Auto-Launch: skip the wizard if setup is already complete
      document.getElementById('welcomeScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      init();
      activateLiveMode();
      return;
    } else if (isPartial) {
      _isResume = true;
      document.getElementById('welcomeResumeBadge').style.display = 'flex';
      const btn = document.querySelector('.btn-welcome');
      if (btn) btn.textContent = 'Resume Setup →';
    }
  } catch { /* no config yet — fresh install, ignore */ }
});

// ============================================================
// Welcome → Main App
// ============================================================
function startSetup() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  init();
}

// ============================================================
// Init
// ============================================================
async function init() {
  renderProgressRail();
  renderChannelGrid();
  renderToolGrid();
  renderPresetGrid();
  renderSkillList();
  document.getElementById('googleIcon').innerHTML = ICONS.google;

  // Load model catalog and operator defaults in parallel
  const [modelsRes, opRes] = await Promise.allSettled([
    fetch('/api/models').then(r => r.json()),
    fetch('/api/operator-defaults').then(r => r.json()),
  ]);
  state.modelCatalog    = modelsRes.status === 'fulfilled' ? modelsRes.value : [];
  state.operatorDefaults = opRes.status   === 'fulfilled' ? opRes.value     : {};

  // Server-owned defaults (config/models.ts) — the browser keeps no model IDs.
  const op = state.operatorDefaults || {};
  if (op.openrouterTiers) state.orTiers = { ...op.openrouterTiers };
  if (!state.selectedModel && op.defaultModelForNewSetup) {
    state.selectedModel    = op.defaultModelForNewSetup;
    state.selectedProvider = op.defaultProviderForNewSetup || state.selectedProvider;
  }

  // If operator default key is available and no model catalog, default to openrouter
  if (state.operatorDefaults?.hasDefaultKey && !state.modelCatalog.length) {
    state.selectedProvider = state.operatorDefaults.defaultProvider || 'openrouter';
    state.selectedModel    = state.operatorDefaults.defaultModel    || state.orTiers.balanced;
  }

  renderModelSelector();

  // Pre-fill all fields when resuming a previous setup
  if (_isResume && _savedConfig) {
    prefillFromConfig(_savedConfig);
    document.getElementById('resumeWizardBanner').style.display = 'flex';
  }

  showStep(1);
  updateMemoryCount();
}

// ============================================================
// Pre-fill wizard fields from saved config.json
// ============================================================
function prefillFromConfig(cfg) {
  const agent    = cfg.agent    || {};
  const creds    = cfg.credentials || {};
  const channels = cfg.channels || {};
  const tools    = cfg.tools    || {};

  // ── Step 1: Identity ──────────────────────────────────────
  _setVal('agentName',    agent.name);
  _setVal('userName',     agent.userName);
  _setVal('userEmail',    agent.email);
  _setVal('userPhone',    agent.phone);
  _setSelectVal('agentTimezone', agent.timezone);
  _setSelectVal('agentLanguage', agent.language);

  // ── Step 2: AI Provider ───────────────────────────────────
  if (agent.provider) {
    state.selectedProvider = agent.provider;
    if (agent.model) state.selectedModel = agent.model;
    if (agent.openrouterTiers) Object.assign(state.orTiers, agent.openrouterTiers);
    renderModelSelector();

    // API key is masked in GET response — show a hint instead of the masked value
    const savedKey = creds[`${agent.provider}ApiKey`] || creds.openrouterApiKey || '';
    if (savedKey && savedKey.length > 4) {
      // Wait for the dynamic key section to render, then set placeholder
      setTimeout(() => {
        const keyEl = document.getElementById('aiProviderKey');
        if (keyEl) keyEl.placeholder = '✓ API key already saved — enter new key only to update it';
      }, 50);
    }
  }

  // ── Step 3: Channels — auto-select previously enabled ─────
  const enabledChannels = Object.entries(channels)
    .filter(([, ch]) => ch.enabled)
    .map(([id]) => id);

  if (enabledChannels.length > 0) {
    // Programmatically toggle the channel cards
    document.querySelectorAll('#channelGrid .sel-card').forEach(card => {
      const oc = card.getAttribute('onclick') || '';
      const m  = oc.match(/'([^']+)'\s*\)\s*$/);
      if (!m) return;
      const chId = m[1];
      if (enabledChannels.includes(chId) && !state.selectedChannels.has(chId)) {
        card.classList.add('selected');
        state.selectedChannels.add(chId);
      }
    });
    renderChannelCredentials();

    // Fill token fields with saved values (skip masked ones — set placeholder instead)
    for (const [chId, chData] of Object.entries(channels)) {
      if (!chData.enabled) continue;
      for (const [fieldId, fieldVal] of Object.entries(chData.config || {})) {
        const el = document.getElementById(fieldId);
        if (!el) continue;
        if (fieldVal && !String(fieldVal).includes('•')) {
          el.value = fieldVal;                          // plain text field (e.g. gmailUser)
        } else if (fieldVal && String(fieldVal).includes('•')) {
          el.placeholder = '✓ Previously saved — enter new value only to update'; // masked
        }
      }
    }
  }

  // ── Step 3: Tools — auto-select previously enabled ────────
  const enabledTools = Object.entries(tools)
    .filter(([, t]) => t.enabled)
    .map(([id]) => id);

  if (enabledTools.length > 0) {
    document.querySelectorAll('#toolGrid .sel-card').forEach(card => {
      const oc = card.getAttribute('onclick') || '';
      const m  = oc.match(/'([^']+)'\s*\)\s*$/);
      if (!m) return;
      const tId = m[1];
      if (enabledTools.includes(tId) && !state.selectedTools.has(tId)) {
        card.classList.add('selected');
        state.selectedTools.add(tId);
      }
    });
    renderToolCredentials?.();
    checkGoogleUnified();
  }

  // ── Build resume step chips ────────────────────────────────
  const chips  = [];
  const allCfg = cfg.credentials || {};
  const hasKey = Object.values(allCfg).some(v => v && String(v).length > 4);
  chips.push(`<span class="resume-step-chip done">✓ Step 1 — Identity</span>`);
  chips.push(`<span class="resume-step-chip ${hasKey ? 'done' : ''}">
    ${hasKey ? '✓' : '!'} Step 2 — AI Provider
  </span>`);
  chips.push(`<span class="resume-step-chip ${enabledChannels.length ? 'done' : ''}">
    ${enabledChannels.length ? '✓' : '!'} Step 3 — Channels
    ${enabledChannels.length ? `(${enabledChannels.join(', ')})` : ''}
  </span>`);
  document.getElementById('resumeStepChips').innerHTML = chips.join('');
}

// Small helpers used by prefillFromConfig
function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val) el.value = val;
}
function _setSelectVal(id, val) {
  const el = document.getElementById(id);
  if (el && val) el.value = val;
}

// ============================================================
// Advanced Toggle
// ============================================================
function toggleAdvanced() {
  const btn = document.getElementById('advToggle');
  const box = document.getElementById('advContent');
  btn.classList.toggle('open');
  box.classList.toggle('open');
}

// ============================================================
// Progress Rail
// ============================================================
function renderProgressRail() {
  const rail = document.getElementById('progressRail');
  const parts = [];
  STEPS.forEach((s, i) => {
    const cls = s.num === state.step ? 'active' : (s.num < state.step ? 'done' : '');
    const icon = s.num < state.step ? '✓' : s.num;
    parts.push(`<div class="prail-step ${cls}" onclick="tryGoStep(${s.num})">
      <div class="prail-dot">${icon}</div>
      <span class="prail-label">${s.label}</span>
    </div>`);
    if (i < STEPS.length - 1) {
      const done = s.num < state.step;
      parts.push(`<div style="flex:1;height:1px;background:${done?'var(--success)':'var(--border)'};max-width:40px;margin:0 2px;opacity:${done?'0.5':'1'}"></div>`);
    }
  });
  rail.innerHTML = parts.join('');
}

function tryGoStep(n) {
  if (n <= state.step + 1) showStep(n);
}

// ============================================================
// Navigation
// ============================================================
function showStep(n) {
  // Clear any inline display:none left by toggleSetupPanel / toggleHealthPanel
  // before adding the active class — inline styles beat CSS class rules.
  document.querySelectorAll('.step-view').forEach(el => {
    el.style.display = '';
    el.classList.remove('active');
  });
  const el = document.getElementById(`step-${n}`);
  if (el) el.classList.add('active');
  state.step = n;
  renderProgressRail();
  // Scroll only the wizard content column — NEVER the full page.
  // Scrolling document.documentElement was causing the guide panel to shift
  // and lose its scroll-to-bottom position on every step navigation click.
  const mainCol = document.querySelector('.main-col');
  if (mainCol) mainCol.scrollTop = 0;

  if (n === 2) { renderAIKeySection(); renderChannelCredentials(); checkGoogleUnified(); }
  if (n === 3) {
    // Re-render so prereq badges reflect the user's Step 2 selections.
    // E.g. if they just toggled Calendar OFF, "Meeting Scheduler" should now
    // show the amber "⚠️ Needs: Calendar" badge.
    renderPresetGrid();
    renderSkillList();
  }
  if (n === 4) { renderReview(); }

  // If user came from live mode (Settings flow), always offer a way back.
  // Runs after step rendering so the nav buttons exist when we inject.
  ensureBackToChatButton(n);

  guideForStep(n);
  updateTips();

  // Re-pin chat messages to the bottom after the step transition settles.
  // requestAnimationFrame waits for the layout to repaint before scrolling,
  // ensuring any dynamic content added by guideForStep() is already rendered.
  requestAnimationFrame(() => {
    const box = document.getElementById('guideMessages');
    if (box) box.scrollTop = box.scrollHeight;
  });
}

function goNext() {
  // ── Step 2 gate: AI API key is mandatory unless an operator default key is set ──
  // Operator key (VOUZA_API_KEY env var) powers the bot immediately without user setup.
  // If neither is configured, block and prompt the user.
  if (state.step === 2 && state.selectedProvider !== 'ollama') {
    const keyEl  = document.getElementById('aiProviderKey');
    const key    = keyEl?.value?.trim();
    const hasSaved     = (keyEl?.placeholder || '').includes('Already saved');
    const hasConnected = !!state.connStatus['ai-provider'] || !!state.connStatus['openrouter'];
    // Only a WORKING operator key counts — a revoked/expired one (status
    // 'invalid') must not let the user sail past Step 2 into a broken bot.
    const hasOperator  = !!state.operatorDefaults?.hasDefaultKey
                      && state.operatorDefaults?.defaultKeyStatus !== 'invalid';

    if (!key && !hasSaved && !hasConnected && !hasOperator) {
      toast('🔑 An AI API key is required — without it the bot cannot respond', 'error');
      if (keyEl) {
        keyEl.style.transition = 'border-color 0.2s';
        keyEl.style.borderColor = 'var(--error)';
        keyEl.scrollIntoView({ behavior:'smooth', block:'center' });
        keyEl.focus();
        let hint = keyEl.parentElement?.querySelector('.key-required-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'key-required-hint';
          hint.style.cssText = 'color:var(--error);font-size:12px;margin-top:6px;font-weight:600';
          hint.textContent = '⚠️ This field is required to activate your AI. Enter your API key above, then click 🔌 Test.';
          keyEl.parentElement?.appendChild(hint);
        }
        keyEl.addEventListener('input', () => {
          keyEl.style.borderColor = '';
          keyEl.parentElement?.querySelector('.key-required-hint')?.remove();
        }, { once:true });
      }
      return;
    }
  }
  if (state.step < state.totalSteps) showStep(state.step + 1);
}

function goPrev() {
  if (state.step > 1) showStep(state.step - 1);
}

// ============================================================
// Model Selector
// ============================================================
// Labels for the shortlist — plain words instead of tier jargon.
const PICK_LABELS = {
  recommended: { badge: '⭐ Best for most people', cls: 'pick-recommended' },
  budget:      { badge: '💰 Cheapest',             cls: 'pick-budget' },
  capable:     { badge: '🚀 Most capable',         cls: 'pick-capable' },
  premium:     { badge: '💎 Premium',              cls: 'pick-premium' },
};
const PICK_ORDER = ['recommended', 'budget', 'capable', 'premium'];

// OpenRouter first: one key works for every model, so it's the easy default.
const PROVIDER_ORDER = ['openrouter', 'anthropic', 'openai', 'google', 'xai', 'deepseek', 'alibaba', 'moonshot'];

function catalogModel(id) {
  for (const g of state.modelCatalog) {
    const m = g.models.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}

function modelLabel(id) {
  return catalogModel(id)?.displayName || liveInfo(id)?.name || id;
}

function priceLine(m) {
  if (!m?.pricing) return '';
  return fmtPrice(m.pricing);
}

function renderModelSelector() {
  const tabs = document.getElementById('providerTabs');
  const list = document.getElementById('modelList');

  if (!state.modelCatalog.length) {
    tabs.innerHTML = '';
    list.innerHTML = `<div class="glass-card" style="margin-bottom:0">
      <div class="form-group" style="margin-bottom:0">
        <label>AI Provider API Key</label>
        <input type="password" id="aiProviderKey" placeholder="sk-ant-api03-...">
        <div class="hint">Using Anthropic Claude (default). Get your key at <a href="https://console.anthropic.com/keys" target="_blank">console.anthropic.com →</a></div>
      </div>
    </div>`;
    return;
  }

  const ordered = [...state.modelCatalog].sort(
    (a, b) => (PROVIDER_ORDER.indexOf(a.provider.id) + 99) % 99 - (PROVIDER_ORDER.indexOf(b.provider.id) + 99) % 99,
  );
  tabs.innerHTML =
    `<div class="ptabs-hint">Which company is your AI key from? Not sure — use <strong>OpenRouter</strong>: one key, every model.</div>` +
    ordered.map(g => {
      const isActive = g.provider.id === state.selectedProvider;
      const name = g.provider.id === 'openrouter' ? 'OpenRouter (any model)' : g.provider.name;
      return `<button type="button" class="ptab ${isActive ? 'active' : ''}" aria-pressed="${isActive}" onclick="selectProvider('${g.provider.id}')">
        <span class="ptab-dot" style="background:${PROVIDER_COLORS[g.provider.id]||'#888'}"></span>
        ${escHtml(name)}
      </button>`;
    }).join('') +
    `<button type="button" class="ptab ${state.selectedProvider === 'ollama' ? 'active' : ''}" aria-pressed="${state.selectedProvider === 'ollama'}" onclick="selectProvider('ollama')">
      💻 Local AI (this computer, no key)
    </button>`;

  // ── Local AI (Ollama): runs on this computer — no company, no key ──
  if (state.selectedProvider === 'ollama') {
    list.innerHTML = `<div class="page-card" style="max-width:none;margin:0">
      <p class="page-hint" style="margin-top:0">Free and private: nothing is sent to an AI company. Slower than an online AI, and needs a computer with 8 GB+ memory.</p>
      <div id="wizLocalAi"></div>
    </div>`;
    renderLocalAiCard(document.getElementById('wizLocalAi'), {
      current: _savedConfig?.agent?.provider === 'ollama' ? _savedConfig.agent.model : null,
      onDone: (model) => {
        state.selectedModel = model;
        if (_savedConfig?.agent) Object.assign(_savedConfig.agent, { provider: 'ollama', model });
        renderModelSelector();
      },
    });
    return;
  }

  const group = state.modelCatalog.find(g => g.provider.id === state.selectedProvider);
  if (!group) return;

  // ── OpenRouter: smart routing, summarised; details folded away ──
  if (state.selectedProvider === 'openrouter') {
    const tiers = [
      { key: 'fast',     label: 'Simple questions',          desc: 'status checks, quick answers' },
      { key: 'balanced', label: 'Everyday office work',      desc: 'email drafting, scheduling, files' },
      { key: 'flagship', label: 'Hard or long tasks',        desc: 'analysis, reports, images, multi-step work' },
    ];
    const byTier = (tier) => group.models.filter(m => m.tier === tier);
    if (!state.orTiers) state.orTiers = {};
    tiers.forEach(t => {
      if (!state.orTiers[t.key]) {
        const def = byTier(t.key).find(m => m.recommended || m.pick) || byTier(t.key)[0];
        if (def) state.orTiers[t.key] = def.id;
      }
    });

    list.innerHTML = `
      <div class="routing-card">
        <div class="routing-title">🧠 Smart routing — the right model for each task</div>
        <div class="routing-sub">Cheap models answer simple things; a stronger one steps in for hard work. You only pay for what's used.</div>
        ${tiers.map(t => {
          const id = state.orTiers[t.key];
          const m = catalogModel(id) || liveInfo(id);
          return `<div class="routing-row">
            <span class="routing-task">${t.label}</span>
            <span class="routing-model">${escHtml(modelLabel(id))}${m && priceLine(m) ? ` <span class="routing-price">${escHtml(priceLine(m))}</span>` : ''}</span>
          </div>`;
        }).join('')}
      </div>
      <details class="more-models" ${state.orCustomiseOpen ? 'open' : ''} ontoggle="state.orCustomiseOpen=this.open">
        <summary>Change the models</summary>
        ${tiers.map(tier => `
          <div style="margin:12px 0 4px">
            <label class="or-tier-label" for="orTier-${tier.key}">${tier.label} <span>${tier.desc}</span></label>
            <input class="or-tier-input" id="orTier-${tier.key}" list="orModelList" value="${escHtml(state.orTiers[tier.key] || '')}"
                   onchange="setOrTier('${tier.key}', this.value)" spellcheck="false" autocomplete="off" placeholder="Type to search models">
            <div id="orInfo-${tier.key}" class="or-tier-info">${orModelInfoLine(state.orTiers[tier.key])}</div>
          </div>
        `).join('')}
        <datalist id="orModelList">${orDatalistOptions(byTier)}</datalist>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0">
          ${renderOrBrowse()}
          <button type="button" class="btn" style="font-size:12px;padding:6px 12px" onclick="useOneOrModelForAll()">Use one model for everything</button>
        </div>
        <div class="or-tier-info">💡 Type to search, or paste any model ID from <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a>.</div>
      </details>`;
    return;
  }

  // ── Other providers: a short, labelled shortlist; the rest folded away ──
  const shortlist = PICK_ORDER
    .map(p => group.models.find(m => m.pick === p))
    .filter(Boolean);
  list.innerHTML = shortlist.map(m => {
    const sel = m.id === state.selectedModel;
    const pick = PICK_LABELS[m.pick];
    return `<div class="model-opt ${sel ? 'selected' : ''}" role="radio" aria-checked="${sel}" tabindex="0"
                 data-id="${escHtml(m.id)}" data-p="${escHtml(m.provider)}"
                 onclick="selectModel(this.dataset.id, this.dataset.p)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectModel(this.dataset.id, this.dataset.p)}">
      <div class="model-radio"></div>
      <div class="model-info">
        <div class="model-name">
          ${escHtml(m.displayName)}
          <span class="pick-badge ${pick.cls}">${pick.badge}</span>
        </div>
        <div class="model-desc">${escHtml(m.description)}</div>
        <div class="model-meta">
          <span>${m.contextWindow >= 1_000_000 ? (m.contextWindow / 1_000_000).toFixed(m.contextWindow % 1_000_000 ? 1 : 0) + 'M' : Math.round(m.contextWindow / 1000) + 'K'} context</span>
          <span>${escHtml(priceLine(m))}</span>
          ${m.supportsVision ? '<span>Reads images</span>' : ''}
        </div>
      </div>
    </div>`;
  }).join('') + renderMoreModels(group);
}

function selectProvider(id) {
  if (id === 'ollama') {
    state.selectedProvider = 'ollama';
    renderModelSelector();
    renderAIKeySection();
    return;
  }
  // Switching tabs: a model from another provider can't carry over — start
  // from this provider's recommended model (a typed / live pick stays).
  if (id !== state.selectedProvider) {
    const g = state.modelCatalog.find((x) => x.provider.id === id);
    const known = g?.models.some((m) => m.id === state.selectedModel)
      || (state.liveModels[id]?.models || []).some((m) => m.id === state.selectedModel);
    if (g && !known) state.selectedModel = (g.models.find((m) => m.recommended) || g.models[0])?.id || '';
  }
  state.selectedProvider = id;
  renderModelSelector();
  renderAIKeySection();
}

function selectModel(id, provider) {
  state.selectedModel = id;
  state.selectedProvider = provider;
  renderModelSelector();
  renderAIKeySection();
}

// ── Every model a provider offers (loaded on request) ──────────────────────
// Our catalog is a short, tested list. These helpers add: the provider's full
// live list (OpenRouter's public catalog, or what your saved key can use) and
// a box to type any model ID. Text from providers is always escaped.

function liveInfo(id) {
  for (const entry of Object.values(state.liveModels)) {
    const m = entry?.models?.find((x) => x.id === id);
    if (m) return m;
  }
  return null;
}

function fmtPrice(p) {
  if (!p) return '';
  if (p.input === 0 && p.output === 0) return 'free';
  return `$${p.input}/$${p.output} per 1M`;
}

function modelFacts(m) {
  if (!m) return '';
  const bits = [];
  if (m.contextWindow) bits.push(`${Math.round(m.contextWindow / 1000)}K context`);
  if (m.pricing) bits.push(fmtPrice(m.pricing));
  if (m.vision) bits.push('vision');
  if (m.tools === false) bits.push("⚠ can't use tools");
  return bits.join(' · ');
}

function orModelInfoLine(id) {
  if (!id) return '';
  const live = liveInfo(id);
  if (!live) return '';
  const warn = live.tools === false ? " — it can chat but can't read email, files or calendar" : '';
  return escHtml(modelFacts(live) + warn);
}

function orVisibleModels() {
  const live = state.liveModels.openrouter?.models || [];
  return live.filter((m) => (!state.liveFilter.toolsOnly || m.tools !== false) && (!state.liveFilter.freeOnly || m.free));
}

function orDatalistOptions(byTier) {
  const list = state.liveModels.openrouter?.models
    ? orVisibleModels()
    : ['fast', 'balanced', 'flagship'].flatMap((t) => byTier(t)).map((m) => ({ id: m.id, name: m.displayName, pricing: m.pricing }));
  return list.map((m) => `<option value="${escHtml(m.id)}">${escHtml(m.name)}${m.pricing ? ' — ' + escHtml(fmtPrice(m.pricing)) : ''}</option>`).join('');
}

function renderOrBrowse() {
  const entry = state.liveModels.openrouter;
  if (!entry) {
    return `<button type="button" class="btn btn-primary" style="font-size:12px;padding:6px 12px" onclick="loadLiveModels('openrouter')">🔎 Load all OpenRouter models (300+)</button>`;
  }
  if (entry.loading) return `<div style="font-size:12px;color:var(--text-dim)">Loading the OpenRouter catalog…</div>`;
  if (entry.error) {
    return `<div style="font-size:12px;color:var(--error)">${escHtml(entry.error)} ` +
      `<button type="button" class="btn" style="font-size:11px;padding:3px 8px" onclick="loadLiveModels('openrouter', true)">Try again</button></div>`;
  }
  return `<div style="font-size:12px;color:var(--text-dim);display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <span>✓ ${orVisibleModels().length} of ${entry.models.length} models in the search boxes above</span>
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${state.liveFilter.toolsOnly ? 'checked' : ''} onchange="state.liveFilter.toolsOnly=this.checked;renderModelSelector()"> Only models that can use tools</label>
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" ${state.liveFilter.freeOnly ? 'checked' : ''} onchange="state.liveFilter.freeOnly=this.checked;renderModelSelector()"> Free only</label>
    </div>`;
}

function renderMoreModels(group) {
  const prov = group.provider.id;
  const entry = state.liveModels[prov];
  const inCatalog = group.models.some((m) => m.id === state.selectedModel);
  const current = (!inCatalog && state.selectedProvider === prov && state.selectedModel)
    ? `<div class="model-opt selected" style="margin-bottom:10px"><div class="model-radio"></div><div class="model-info">
         <div class="model-name">${escHtml(state.selectedModel)}</div>
         <div class="model-desc">${escHtml(modelFacts(liveInfo(state.selectedModel)) || 'Chosen from the full list or typed in')}</div></div></div>`
    : '';
  let body = '';
  if (!entry) {
    body = `<button type="button" class="btn" style="font-size:12px;padding:6px 12px" onclick="loadLiveModels('${prov}')">🔄 Show every ${escHtml(group.provider.name)} model</button>`;
  } else if (entry.loading) {
    body = `<div style="font-size:12px;color:var(--text-dim)">Asking ${escHtml(group.provider.name)} for its model list…</div>`;
  } else if (entry.error) {
    body = `<div style="font-size:12px;color:${entry.needsKey ? 'var(--text-dim)' : 'var(--error)'}">${escHtml(entry.error)}</div>`;
  } else {
    body = `<input type="search" placeholder="Search ${entry.models.length} models…" value="${escHtml(state.liveFilter.q)}"
              oninput="state.liveFilter.q=this.value;fillLiveList('${prov}')" aria-label="Search models"
              style="width:100%;padding:8px 12px;background:var(--bg-glass-card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;margin-bottom:8px">
            <div id="liveList-${prov}" style="max-height:260px;overflow:auto"></div>`;
  }
  setTimeout(() => fillLiveList(prov), 0);
  state.moreOpen = state.moreOpen || {};
  const open = state.moreOpen[prov] || !!current || !!entry;
  return `<details class="more-models" ${open ? 'open' : ''} ontoggle="state.moreOpen['${prov}']=this.open">
      <summary>More models — every ${escHtml(group.provider.name)} model, or type an ID</summary>
      <div style="padding-top:10px">${current}${body}
      <div style="display:flex;gap:8px;margin-top:10px">
        <input id="customModelId-${prov}" placeholder="Or type any model ID" spellcheck="false" autocomplete="off" aria-label="Model ID"
               style="flex:1;padding:8px 12px;background:var(--bg-glass-card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px">
        <button type="button" class="btn" style="font-size:12px;padding:6px 12px" onclick="useCustomModel('${prov}')">Use</button>
      </div>
      </div>
    </details>`;
}

function fillLiveList(prov) {
  const box = document.getElementById(`liveList-${prov}`);
  const models = state.liveModels[prov]?.models;
  if (!box || !models) return;
  const q = state.liveFilter.q.trim().toLowerCase();
  const hits = models.filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
  const rows = hits.slice(0, 200).map((m) => `
    <div class="model-opt ${m.id === state.selectedModel ? 'selected' : ''}" data-id="${escHtml(m.id)}" data-p="${escHtml(prov)}"
         onclick="selectModel(this.dataset.id, this.dataset.p)" style="padding:8px 12px">
      <div class="model-radio"></div>
      <div class="model-info"><div class="model-name" style="font-size:12px">${escHtml(m.name)}</div>
        <div class="model-meta"><span>${escHtml(m.id)}</span>${modelFacts(m) ? `<span>${escHtml(modelFacts(m))}</span>` : ''}</div></div>
    </div>`).join('');
  const more = hits.length > 200 ? `<div style="font-size:11px;color:var(--text-muted);padding:6px">${hits.length - 200} more — type to narrow down</div>` : '';
  const none = hits.length ? '' : '<div style="font-size:12px;color:var(--text-dim);padding:6px">No model matches.</div>';
  box.innerHTML = rows + more + none;
}

async function loadLiveModels(prov, retry = false) {
  if (state.liveModels[prov]?.loading) return;
  if (retry) delete state.liveModels[prov];
  state.liveModels[prov] = { loading: true };
  renderModelSelector();
  try {
    const r = await fetch(`/api/models/live?provider=${encodeURIComponent(prov)}`).then((x) => x.json());
    state.liveModels[prov] = r.ok
      ? { models: r.models }
      : { error: r.error || 'Could not load the list.', needsKey: !!r.needsKey };
  } catch (err) {
    state.liveModels[prov] = { error: 'Could not load the list: ' + err.message };
  }
  renderModelSelector();
}

const MODEL_ID_RE = /^~?[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;

function useCustomModel(prov) {
  const el = document.getElementById(`customModelId-${prov}`);
  const id = (el?.value || '').trim();
  if (!MODEL_ID_RE.test(id)) { toast("That doesn't look like a model ID", 'error'); return; }
  selectModel(id, prov);
  toast(`Using ${escHtml(id)}`);
}

function setOrTier(tier, value) {
  const id = String(value || '').trim();
  if (!MODEL_ID_RE.test(id)) { toast("That doesn't look like a model ID", 'error'); renderModelSelector(); return; }
  state.orTiers[tier] = id;
  const info = document.getElementById(`orInfo-${tier}`);
  if (info) info.innerHTML = orModelInfoLine(id);
}

function useOneOrModelForAll() {
  const id = state.orTiers.balanced;
  if (!id) return;
  state.orTiers.fast = id;
  state.orTiers.flagship = id;
  renderModelSelector();
  toast(`All three now use ${escHtml(id)}`);
}

// ============================================================
// Channel & Tool Grids
// ============================================================
function renderChannelGrid() {
  const g = document.getElementById('channelGrid');
  g.innerHTML = CHANNELS.map(ch => `
    <div class="sel-card" onclick="toggleChannel(this,'${ch.id}')" data-id="${ch.id}">
      <div class="sel-card-top">
        <div class="sel-card-icon">${ICONS[ch.icon]||''}</div>
        <div class="sel-check">✓</div>
      </div>
      ${ch.badge ? `<div class="sel-card-badge badge-${ch.badge}">${ch.badge==='popular'?'Popular':'Free'}</div>` : ''}
      <div class="sel-card-name">${ch.name}</div>
      ${ch.mobile ? `<div class="sel-card-mobile-tag">📱 Mobile access</div>` : ''}
      <div class="sel-card-desc">${ch.desc}</div>
      ${ch.howTo ? `<div class="sel-card-howto">
        <div class="howto-label">How to connect</div>
        <div class="howto-steps">
          ${ch.howTo.map((s,i)=>`<div class="howto-step">
            <div class="howto-num">${i+1}</div>
            <div>${s.text}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
      ${ch.providers ? `<div class="sel-card-extra" onclick="event.stopPropagation()">
        <label>Provider</label>
        <select id="${ch.id}Provider" onchange="renderChannelCredentials();checkGoogleUnified()">
          ${ch.providers.map(p=>`<option value="${p.v}">${p.l}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>`).join('');
}

function renderToolGrid() {
  const g = document.getElementById('toolGrid');
  g.innerHTML = TOOLS.map(t => `
    <div class="sel-card" onclick="toggleTool(this,'${t.id}')" data-id="${t.id}">
      <div class="sel-card-top">
        <div class="sel-card-icon">${ICONS[t.icon]||''}</div>
        <div class="sel-check">✓</div>
      </div>
      ${t.badge ? `<div class="sel-card-badge badge-${t.badge}">${t.badge==='popular'?'Popular':'Free'}</div>` : ''}
      <div class="sel-card-name">${t.name}</div>
      <div class="sel-card-desc">${t.desc}</div>
      ${t.providers ? `<div class="sel-card-extra" onclick="event.stopPropagation()">
        <label>Provider</label>
        <select id="${t.id}Provider" onchange="renderToolCredentials();checkGoogleUnified()">
          ${t.providers.map(p=>`<option value="${p.v}">${p.l}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>`).join('');
}

function toggleChannel(card, id) {
  card.classList.toggle('selected');
  if (card.classList.contains('selected')) state.selectedChannels.add(id);
  else state.selectedChannels.delete(id);
  renderChannelCredentials();
  checkGoogleUnified();
}

function toggleTool(card, id) {
  card.classList.toggle('selected');
  if (card.classList.contains('selected')) state.selectedTools.add(id);
  else state.selectedTools.delete(id);
  renderToolCredentials();
  checkGoogleUnified();
}

// ============================================================
// Tool Credentials (tools that need their own API keys)
// ============================================================
function renderToolCredentials() {
  const box = document.getElementById('toolCredentials');
  if (!box) return;
  let html = '';
  for (const t of state.selectedTools) {
    if (!CRED_CONFIGS[t]) continue;  // no credentials needed for this tool
    const provEl = document.getElementById(`${t}Provider`);
    const prov = provEl ? provEl.value : 'default';
    const conf = CRED_CONFIGS[t]?.[prov];
    if (conf) html += buildCredCard(t, conf);
  }
  box.innerHTML = html;
}

// ============================================================
// Skill List — with prereq detection + category grouping
// ============================================================

// Map channel/tool IDs to pretty display names (for prereq badges)
const PREREQ_DISPLAY = {
  email: 'Email', telegram: 'Telegram', whatsapp: 'WhatsApp',
  calendar: 'Calendar', spreadsheet: 'Spreadsheets', fileStorage: 'File Storage',
  crm: 'CRM', voice: 'Voice',
};

/**
 * Check whether a skill's prerequisites are satisfied by the user's current
 * channel + tool selections from Step 2.
 *
 * `requires` shapes supported:
 *   { channels:[...], tools:[...] }  → ALL listed must be selected (AND)
 *   { anyOf: { channels:[...], tools:[...] } } → at least ONE must be selected (OR)
 *
 * Returns { ok: boolean, missing: string[] } — `missing` is a list of pretty
 * names to show in the badge.
 */
function checkSkillPrereqs(sk) {
  const req = sk.requires || {};
  const haveCh   = (id) => state.selectedChannels?.has(id);
  const haveTool = (id) => state.selectedTools?.has(id);

  // anyOf branch — at least one of any listed item satisfies the prereq.
  if (req.anyOf) {
    const needed = [
      ...(req.anyOf.channels || []),
      ...(req.anyOf.tools    || []),
    ];
    const have = (req.anyOf.channels || []).some(haveCh)
              || (req.anyOf.tools    || []).some(haveTool);
    return have
      ? { ok: true,  missing: [] }
      : { ok: false, missing: [needed.map((n) => PREREQ_DISPLAY[n] || n).join(' or ')] };
  }

  // AND branch — every listed channel + tool required.
  const missing = [];
  for (const ch of (req.channels || [])) if (!haveCh(ch))   missing.push(PREREQ_DISPLAY[ch]   || ch);
  for (const tl of (req.tools    || [])) if (!haveTool(tl)) missing.push(PREREQ_DISPLAY[tl] || tl);
  return { ok: missing.length === 0, missing };
}

function renderSkillList() {
  const list = document.getElementById('skillList');
  // Group skills by category, preserving SKILL_CATEGORIES order.
  const byCategory = new Map(SKILL_CATEGORIES.map((c) => [c.id, []]));
  for (const sk of SKILLS) {
    if (!byCategory.has(sk.category)) byCategory.set(sk.category, []);
    byCategory.get(sk.category).push(sk);
  }

  let html = '';
  for (const cat of SKILL_CATEGORIES) {
    const skills = byCategory.get(cat.id) || [];
    if (skills.length === 0) continue;

    html += `
      <div class="skill-category">
        <span class="skill-category-icon">${cat.icon}</span>
        <span class="skill-category-name">${cat.name}</span>
        <span class="skill-category-desc">— ${cat.desc}</span>
      </div>
    `;

    for (const sk of skills) {
      const prereq  = checkSkillPrereqs(sk);
      const enabled = state.enabledSkills.has(sk.id);
      const badge   = prereq.ok
        ? `<span class="skill-prereq ok">✓ Ready</span>`
        : `<span class="skill-prereq missing" title="Connect this in Step 2">⚠️ Needs: ${prereq.missing.join(', ')}</span>`;

      html += `
        <div class="skill-card ${enabled?'enabled':''} ${prereq.ok?'':'dimmed'}" onclick="toggleSkill(this,'${sk.id}')">
          <div class="skill-icon">${sk.icon}</div>
          <div class="skill-body">
            <div class="skill-name">${sk.name}</div>
            <div class="skill-desc">${sk.desc}</div>
            ${badge}
          </div>
          <div class="skill-sched" onclick="event.stopPropagation()">
            <select data-sched="${sk.id}" onchange="onScheduleChanged()">
              ${sk.schedules.map(s=>`<option value="${s.v}" ${s.sel?'selected':''}>${s.l}</option>`).join('')}
            </select>
          </div>
          <div class="skill-toggle"></div>
        </div>`;
    }
  }
  list.innerHTML = html;
}

function toggleSkill(card, id) {
  card.classList.toggle('enabled');
  if (card.classList.contains('enabled')) state.enabledSkills.add(id);
  else state.enabledSkills.delete(id);
  // Manual edits drop the "matching preset" highlight
  state.activePresetId = null;
  renderPresetGrid();
}

function onScheduleChanged() {
  // User tweaked a cadence — they're no longer on a clean preset
  state.activePresetId = null;
  renderPresetGrid();
}

// ============================================================
// Skill Presets — one click sets everything sensibly
// ============================================================
function renderPresetGrid() {
  const grid = document.getElementById('presetGrid');
  if (!grid) return;
  const activeId = state.activePresetId;
  grid.innerHTML = SKILL_PRESETS.map((p) => {
    const isActive  = activeId === p.id;
    const isRecPref = p.id === 'intermediate';   // "Recommended" green styling
    return `
      <div class="preset-card ${isActive?'active':''} ${isRecPref?'recommended':''}" onclick="applyPreset('${p.id}')">
        <div class="preset-card-header">
          <span class="preset-icon">${p.icon}</span>
          <span class="preset-name">${p.name}</span>
          <span class="preset-tag">${p.tag}</span>
        </div>
        <div class="preset-desc">${p.desc}</div>
        <div class="preset-best-for"><strong>Best for:</strong> ${p.bestFor}</div>
      </div>`;
  }).join('');
}

/**
 * Apply a preset — enable its skills, set their cadences, and set the
 * self-learning interval. Skills NOT in the preset are turned OFF so the
 * user gets the clean opinionated profile they clicked.
 */
function applyPreset(presetId) {
  const preset = SKILL_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  state.activePresetId = presetId;

  // Reset all skills to OFF, then turn on the preset's skills.
  state.enabledSkills.clear();
  for (const skillId of Object.keys(preset.skills)) {
    state.enabledSkills.add(skillId);
  }

  // Re-render the skill list so toggle states + dimmed classes update.
  renderSkillList();
  renderPresetGrid();

  // Set the schedule select for each preset skill to the cadence cron value.
  // Has to happen AFTER renderSkillList() because the selects are recreated.
  for (const [skillId, cron] of Object.entries(preset.skills)) {
    const sel = document.querySelector(`select[data-sched="${skillId}"]`);
    if (sel) {
      // Find an option matching the cron value — fall back to first if absent
      const opt = Array.from(sel.options).find((o) => o.value === cron);
      sel.value = opt ? cron : sel.options[0].value;
    }
  }

  // Set the self-learning interval
  const interval = document.getElementById('selfImproveInterval');
  if (interval) interval.value = String(preset.selfImproveHours);

  // Subtle confirmation toast
  if (typeof toast === 'function') {
    const skillCount = Object.keys(preset.skills).length;
    toast(`${preset.icon} ${preset.name} profile applied — ${skillCount} skill${skillCount===1?'':'s'} configured`, 'success');
  }
}

// ============================================================
// AI Key Section (Step 2)
// ============================================================
function renderAIKeySection() {
  const box = document.getElementById('aiKeySection');
  if (state.selectedProvider === 'ollama') {
    if (box) box.innerHTML = `<div class="glass-card"><div class="glass-card-header" style="margin-bottom:0">
      <div class="glass-card-icon" style="font-size:22px">💻</div>
      <div style="flex:1"><div class="glass-card-title">Local AI — no key needed</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Runs on this computer with Ollama. Pick it under “Create Your AI”.</div></div>
    </div></div>`;
    return;
  }
  const group = state.modelCatalog.find(g => g.provider.id === state.selectedProvider);
  const p = group?.provider;
  const isOR = state.selectedProvider === 'openrouter';
  const iconKey = isOR ? 'openrouter' : (state.selectedProvider === 'google' ? 'googleai' : (state.selectedProvider || 'anthropic'));
  const icon = ICONS[iconKey] || ICONS.anthropic;
  const provName = p ? p.name : 'Anthropic';
  const placeholder = p ? p.apiKeyPlaceholder : 'sk-ant-api03-...';
  const hint = p ? p.apiKeyHint : 'https://console.anthropic.com/keys';
  const statusKey = 'ai-provider';
  const connected = state.connStatus[statusKey];
  const op = state.operatorDefaults || {};
  const hasOperatorKey = !!op.hasDefaultKey;
  // A present operator key is only USABLE if the provider didn't reject it.
  // 'valid' / 'unchecked' → treat as usable (don't block on transient network
  // failures); 'invalid' → confirmed bad (revoked/expired), do not rely on it.
  const operatorBroken = hasOperatorKey && op.defaultKeyStatus === 'invalid';
  const operatorUsable = hasOperatorKey && !operatorBroken;
  // User has their own saved key if the placeholder says "Already saved"
  const hasSavedKey = connected || (document.getElementById('aiProviderKey')?.placeholder || '').includes('Already saved');
  const usingOperator = operatorUsable && !connected && !hasSavedKey;
  const brandName = op.brandName || 'Vouza';

  let html = '';

  // ── Operator key banner — shown when no user key is set yet ───────────────
  if (usingOperator) {
    html += `
      <div class="glass-card" style="border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.06);margin-bottom:16px">
        <div class="glass-card-header" style="margin-bottom:0">
          <div class="glass-card-icon" style="font-size:22px;background:rgba(34,197,94,0.12);border-radius:10px;padding:6px">⚡</div>
          <div style="flex:1">
            <div class="glass-card-title" style="color:var(--success)">Powered by ${brandName}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px">Your AI is ready — no API key needed to get started</div>
          </div>
          <span class="glass-card-badge badge-connected">Ready</span>
        </div>
      </div>`;
  } else if (operatorBroken && !connected && !hasSavedKey) {
    // The shared key exists but the provider rejected it (revoked/expired).
    // Be honest: scripted guidance still works, but real AI needs a valid key.
    html += `
      <div class="glass-card" style="border:1px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.07);margin-bottom:16px">
        <div class="glass-card-header" style="margin-bottom:0">
          <div class="glass-card-icon" style="font-size:22px;background:rgba(245,158,11,0.14);border-radius:10px;padding:6px">⚠️</div>
          <div style="flex:1">
            <div class="glass-card-title" style="color:#f59e0b">${brandName} Guide Bot — limited mode</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:2px">${brandName} Guide Bot is available for basic chat. Additional AI features require a valid API key configuration.</div>
          </div>
          <span class="glass-card-badge badge-pending">Key needed</span>
        </div>
      </div>`;
  }

  // ── User's own API key — required unless a WORKING operator key exists ─────
  const isRequired = !operatorUsable;
  const requiredBadge = isRequired
    ? `<span style="color:var(--error);font-size:11px;font-weight:700;background:rgba(239,68,68,0.12);padding:2px 7px;border-radius:10px;margin-left:6px">Required</span>`
    : `<span style="color:var(--text-muted);font-size:11px;background:var(--bg-glass);border:1px solid var(--border);padding:2px 7px;border-radius:10px;margin-left:6px">Optional</span>`;
  const cardTitle = operatorUsable
    ? 'Use Your Own API Key'
    : `${provName} API Key`;

  html += `
    <div class="glass-card">
      <div class="glass-card-header">
        <div class="glass-card-icon">${icon}</div>
        <div class="glass-card-title">${cardTitle}</div>
        <span class="glass-card-badge ${connected?'badge-success':'badge-pending'}" id="status-${statusKey}">${connected?'✓ Connected':'Not Connected'}</span>
      </div>
      ${operatorUsable ? `
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;line-height:1.5">
          Bring your own key to use a different model, bypass shared usage limits, or keep full control of your AI spending.
        </div>
      ` : isOR ? `
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;padding:8px 12px;background:rgba(124,58,237,0.06);border-radius:8px;line-height:1.5">
          🧠 <strong style="color:var(--brand-light)">Smart Routing active</strong> — one key unlocks every model.
          Simple questions automatically use cheap models; complex tasks escalate to powerful ones.
        </div>
      ` : ''}
      <div class="form-group" style="margin-bottom:0">
        <label>${isOR ? 'OpenRouter' : provName} API Key ${requiredBadge}</label>
        <div class="input-group">
          <input type="password" id="aiProviderKey" placeholder="${placeholder}">
          <button class="btn btn-test" onclick="testAIProvider()">🔌 Test</button>
        </div>
        <div class="hint">Get your key at <a href="${hint}" target="_blank">${hint} →</a></div>
      </div>
    </div>`;

  box.innerHTML = html;
}

async function testAIProvider() {
  const key = document.getElementById('aiProviderKey')?.value?.trim();
  if (!key) { toast('Please enter an API key','error'); return; }
  let ok;
  if (state.selectedProvider === 'openrouter') {
    ok = await testConn('openrouter', { apiKey: key }, 'ai-provider');
  } else {
    ok = await testConn('ai-provider',{ apiKey:key, provider:state.selectedProvider, model:state.selectedModel });
  }
  if (ok) {
    // Auto-save the AI key immediately so it survives page reloads and isn't
    // lost if the user tests but never reaches the Go Live step.
    const credKey = state.selectedProvider === 'openrouter' ? 'openrouterApiKey' : `${state.selectedProvider}ApiKey`;
    const credPayload = { [credKey]: key };
    if (state.selectedProvider === 'openrouter') credPayload['openrouterApiKey'] = key; // double-write for compat
    fetch('/api/config/step/credentials', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(credPayload),
    }).catch(() => {});
    // Also persist the selected provider / model
    fetch('/api/config/step/agent', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ provider: state.selectedProvider, model: state.selectedModel }),
    }).catch(() => {});
  }
}

// ============================================================
// Channel Credentials
// ============================================================
function renderChannelCredentials() {
  const box = document.getElementById('channelCredentials');
  let html = '';
  for (const ch of state.selectedChannels) {
    // Gmail previously skipped here and redirected to the Google Service Account section.
    // Now shown inline with App Password — simpler for regular Gmail users.
    const provEl = document.getElementById(`${ch}Provider`);
    const prov = provEl ? provEl.value : 'default';
    const conf = CRED_CONFIGS[ch]?.[prov];
    if (conf) html += buildCredCard(ch, conf);
  }
  box.innerHTML = html;
}

function buildCredCard(id, conf) {
  const sc = state.connStatus[id];

  // Special card for WhatsApp Web (Baileys) — shows QR panel instead of fields
  if (id === 'whatsapp' && conf.testType === 'whatsapp-web') {
    return buildWhatsAppWebQRCard(sc);
  }

  return `
    <div class="glass-card">
      <div class="glass-card-header">
        <div class="glass-card-icon">${ICONS[conf.icon]||''}</div>
        <div class="glass-card-title">${conf.title}</div>
        <span class="glass-card-badge ${sc?'badge-connected':'badge-pending'}" id="status-${id}">${sc?'Connected':'Not Connected'}</span>
      </div>
      ${conf.fields.map(f=>`
        <div class="form-group">
          <label>${f.label}</label>
          <div class="input-group">
            <input type="${f.type}" id="${f.id}" placeholder="${f.placeholder}">
            ${f.type==='password'?`<button class="btn btn-icon btn-ghost" onclick="toggleVis('${f.id}')" title="Show/hide">👁</button>`:''}
          </div>
          ${f.hint?`<div class="hint">${f.hint}</div>`:''}
        </div>`).join('')}
      <button class="btn btn-test" onclick="testConnFor('${id}','${conf.testType}')">🔌 Test Connection</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// WhatsApp Web — Baileys QR scan card
// ---------------------------------------------------------------------------
let _waQREventSource  = null;
let _waCountdownTimer = null;  // setInterval handle
let _waSecsLeft       = 20;    // current countdown value
const WA_QR_TTL       = 20;    // WhatsApp QR code lifetime in seconds
let _waQRCyclesShown  = 0;     // # of QR refreshes within this connect attempt
const WA_RESET_HINT_AFTER = 2; // show "reset" hint after this many QR cycles without success

function buildWhatsAppWebQRCard(isConnected) {
  // Read existing allowlist for the textarea (comma/newline-separated phone numbers)
  const savedAllowlist = ((state?.config?.channels?.whatsapp?.config?.allowedSenders) || [])
    .map((s) => typeof s === 'string' ? s : '')
    .filter(Boolean)
    .join('\n');

  // ── SAFETY WARNING (always shown when this card renders) ─────────────────
  // Baileys links to the user's PERSONAL WhatsApp account. Without an
  // allowlist the agent would auto-reply to every friend — a disaster
  // that one of our beta testers (2026-05-26) hit in production.
  const safetyBlock = `
    <div style="margin:0 0 14px;padding:12px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:10px;font-size:13px;line-height:1.55;color:var(--text)">
      <div style="color:#ef4444;font-weight:700;margin-bottom:6px">⚠️ Important — WhatsApp links your PERSONAL account</div>
      <div style="color:var(--text-dim)">
        Unlike Telegram (which uses a separate bot), WhatsApp here is tied to your real WhatsApp number.
        <strong style="color:var(--text)">By default the agent only responds to YOU (your own number).</strong>
        Your friends' messages are ignored unless you explicitly add their numbers to the allowlist below.
      </div>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label style="font-size:12px">Allowed senders <span style="color:var(--text-dim);font-weight:400">(one phone number per line — e.g. <code>+6591234567</code>)</span></label>
      <textarea id="wa-allowlist" rows="3" placeholder="Leave empty so only YOU can talk to the agent.&#10;Add numbers (one per line) to permit specific friends/colleagues."
        style="width:100%;font-family:monospace;font-size:12px;padding:8px 10px;border-radius:8px;background:var(--bg-glass);border:1px solid var(--border);color:var(--text);resize:vertical">${escHtml(savedAllowlist)}</textarea>
      <div class="hint" style="margin-top:6px">
        Your own number is <strong>always</strong> allowed automatically — no need to add it.
        Save with the button below; changes take effect after the next agent restart.
      </div>
      <button class="btn btn-test" style="margin-top:8px;font-size:12px" onclick="saveWhatsAppAllowlist()">💾 Save allowlist</button>
    </div>
  `;

  return `
    <div class="glass-card" id="wa-qr-card">
      <div class="glass-card-header">
        <div class="glass-card-icon">${ICONS.whatsapp||''}</div>
        <div class="glass-card-title">WhatsApp Web (QR Scan)</div>
        <span class="glass-card-badge ${isConnected?'badge-connected':'badge-pending'}" id="status-whatsapp">
          ${isConnected?'✅ Connected':'Not Connected'}
        </span>
      </div>
      ${safetyBlock}
      <div id="wa-qr-area" style="text-align:center;padding:16px 0">
        ${isConnected
          ? `<div style="font-size:32px;margin-bottom:8px">✅</div>
             <div style="color:var(--success);font-weight:600">WhatsApp Connected</div>
             <div class="hint" style="margin-top:6px">Your phone is linked. The agent will only respond to YOU and any numbers on your allowlist above — your other contacts are ignored.</div>
             <button class="btn btn-ghost" style="margin-top:12px;font-size:12px" onclick="waQRLogout()">🔓 Unlink (scan new QR)</button>`
          : `<div class="hint" style="margin-bottom:14px">Click <strong>Connect</strong> to generate a QR code, then scan it with your phone.</div>
             <div id="wa-qr-img" style="display:none;margin:0 auto 4px">
               <img id="wa-qr-png" style="width:220px;height:220px;border-radius:12px;background:#fff;padding:8px;transition:opacity 0.25s" src="" alt="QR Code">
             </div>
             <div id="wa-qr-timer" style="display:none;margin:10px auto 8px;width:220px">
               <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
                 <span style="font-size:12px;color:var(--text-dim)">📷 Scan with WhatsApp</span>
                 <span id="wa-qr-secs" style="font-size:12px;font-weight:700;color:#25d366;min-width:28px;text-align:right">20s</span>
               </div>
               <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden">
                 <div id="wa-qr-bar" style="height:100%;width:100%;border-radius:4px;background:linear-gradient(90deg,#25d366,#128c7e);transition:width 1s linear,background 0.5s"></div>
               </div>
             </div>
             <div id="wa-qr-status" style="color:var(--text-dim);font-size:13px;margin-bottom:12px"></div>
             <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
               <button id="wa-connect-btn" class="btn btn-primary" onclick="waQRConnect()">📱 Connect WhatsApp</button>
               <button class="btn btn-ghost" style="font-size:12px" onclick="waQRReset()" title="Wipe stale credentials and start a fresh QR connection">🔄 Reset connection</button>
             </div>
             <div id="wa-reset-hint" style="display:none;margin-top:14px;padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:12px;color:var(--text-dim);text-align:left">
               <div style="color:#f59e0b;font-weight:600;margin-bottom:4px">⚠️ Getting "Invalid QR code" or "Check your connection"?</div>
               Possible causes:
               <ul style="margin:6px 0 0 18px;padding:0;line-height:1.7">
                 <li>Stale credentials — click <strong>Reset connection</strong> above</li>
                 <li>WhatsApp's <strong>4-linked-device limit</strong> reached (Settings → Linked Devices)</li>
                 <li>Firewall blocking Baileys WebSocket — temporarily disable antivirus</li>
                 <li>Phone has no internet — open a chat, try sending a message</li>
               </ul>
             </div>`
        }
      </div>
      <div class="hint">💡 Open WhatsApp on your phone → <strong>Settings → Linked Devices → Link a Device</strong> → scan the QR code above. Make sure your phone has internet and you haven't already linked 4 devices.</div>
    </div>`;
}

// ── Countdown helpers ────────────────────────────────────────────────────────

function _waStartCountdown() {
  _waStopCountdown();
  _waSecsLeft = WA_QR_TTL;
  _waTickCountdown();
  _waCountdownTimer = setInterval(_waTickCountdown, 1000);
}

function _waStopCountdown() {
  if (_waCountdownTimer) { clearInterval(_waCountdownTimer); _waCountdownTimer = null; }
}

function _waTickCountdown() {
  const secsEl  = document.getElementById('wa-qr-secs');
  const barEl   = document.getElementById('wa-qr-bar');
  const timerEl = document.getElementById('wa-qr-timer');
  const statusEl = document.getElementById('wa-qr-status');

  if (!secsEl) return; // card was removed — stop ticking

  if (timerEl) timerEl.style.display = 'block';

  // Colour shifts green → amber → red as time runs out
  const pct   = (_waSecsLeft / WA_QR_TTL) * 100;
  const color = _waSecsLeft > 10 ? '#25d366'
              : _waSecsLeft > 5  ? '#f59e0b'
              :                    '#ef4444';

  secsEl.textContent = _waSecsLeft > 0 ? `${_waSecsLeft}s` : '…';
  secsEl.style.color = color;

  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.style.background = _waSecsLeft > 10
      ? 'linear-gradient(90deg,#25d366,#128c7e)'
      : _waSecsLeft > 5
        ? 'linear-gradient(90deg,#f59e0b,#d97706)'
        : 'linear-gradient(90deg,#ef4444,#dc2626)';
  }

  if (_waSecsLeft <= 0) {
    // QR expired — show "refreshing" until Baileys emits the next QR
    if (statusEl) statusEl.textContent = '🔄 Refreshing QR…';
    _waStopCountdown();
    return;
  }
  _waSecsLeft--;
}

// ── Main connect flow ────────────────────────────────────────────────────────

async function waQRConnect() {
  const btn = document.getElementById('wa-connect-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Connecting…'; }
  const statusEl = document.getElementById('wa-qr-status');
  if (statusEl) statusEl.textContent = 'Launching agent connection…';

  // Close any previous SSE + countdown, and reset cycle counter / hide reset hint
  if (_waQREventSource) { _waQREventSource.close(); _waQREventSource = null; }
  _waStopCountdown();
  _waQRCyclesShown = 0;
  const hint = document.getElementById('wa-reset-hint');
  if (hint) hint.style.display = 'none';

  _waQREventSource = new EventSource('/api/whatsapp/qr-stream');

  _waQREventSource.addEventListener('qr', (e) => {
    const { dataUrl } = JSON.parse(e.data);
    const img = document.getElementById('wa-qr-png');
    const div = document.getElementById('wa-qr-img');

    if (img && div) {
      // Flash the old QR out, new one in
      img.style.opacity = '0.2';
      setTimeout(() => {
        img.src = dataUrl;
        img.style.opacity = '1';
      }, 120);
      div.style.display = 'block';
    }

    // Reset (or start) the 20-second countdown
    _waStartCountdown();
    if (statusEl) statusEl.textContent = '';
    if (btn) btn.textContent = '🔄 Waiting for scan…';

    // After N QR refreshes without connecting, surface a "Reset & try again"
    // hint — handles the stale-auth case that produces "Invalid QR code".
    _waQRCyclesShown++;
    if (_waQRCyclesShown >= WA_RESET_HINT_AFTER) {
      const hint = document.getElementById('wa-reset-hint');
      if (hint) hint.style.display = 'block';
    }
  });

  _waQREventSource.addEventListener('status', (e) => {
    const { status } = JSON.parse(e.data);
    if (status === 'connecting')   { if (statusEl) statusEl.textContent = '🔌 Connecting to WhatsApp…'; }
    if (status === 'qr_ready')     { /* countdown will show when qr event fires */ }
    if (status === 'connected')    { waQROnConnected(); }
    if (status === 'logged_out')   {
      _waStopCountdown();
      if (statusEl) statusEl.textContent = '❌ Logged out — click Connect again';
      if (btn) { btn.disabled = false; btn.textContent = '📱 Connect WhatsApp'; }
    }
    if (status === 'disconnected') { if (statusEl) statusEl.textContent = '⚠️ Disconnected — reconnecting…'; }
  });

  _waQREventSource.addEventListener('connected', () => waQROnConnected());

  _waQREventSource.addEventListener('error', (e) => {
    _waStopCountdown();
    try {
      const { message } = JSON.parse(e.data);
      if (statusEl) statusEl.textContent = '⚠️ ' + message;
    } catch {}
    if (btn) { btn.disabled = false; btn.textContent = '📱 Connect WhatsApp'; }
  });

  _waQREventSource.onerror = () => {
    _waStopCountdown();
    if (statusEl) statusEl.textContent = '⚠️ Connection lost — try again';
    if (btn) { btn.disabled = false; btn.textContent = '📱 Connect WhatsApp'; }
  };
}

function waQROnConnected() {
  if (_waQREventSource) { _waQREventSource.close(); _waQREventSource = null; }
  _waStopCountdown();
  _waQRCyclesShown = 0;            // reset for any future reconnect
  state.connStatus['whatsapp'] = true;
  const badge = document.getElementById('status-whatsapp');
  if (badge) { badge.className = 'glass-card-badge badge-connected'; badge.textContent = '✅ Connected'; }
  const area = document.getElementById('wa-qr-area');
  if (area) area.innerHTML = `
    <div style="font-size:32px;margin-bottom:8px">✅</div>
    <div style="color:var(--success);font-weight:600">WhatsApp Connected!</div>
    <div class="hint" style="margin-top:6px">Your phone is now linked. Send a message from WhatsApp to test.</div>
    <button class="btn btn-ghost" style="margin-top:12px;font-size:12px" onclick="waQRLogout()">🔓 Unlink (scan new QR)</button>
  `;
  updateTips();
  toast('✅ WhatsApp connected! Send a message from your phone to test.', 'success');
}

/**
 * Save the WhatsApp sender allowlist to the user's config.
 * The list is what controls who CAN talk to the agent via WhatsApp —
 * without this, the agent would auto-reply to every friend who texts
 * the linked account. The owner (the user themselves) is always
 * permitted automatically; the allowlist is for additional contacts.
 */
async function saveWhatsAppAllowlist() {
  const ta = document.getElementById('wa-allowlist');
  if (!ta) return;
  const lines = (ta.value || '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  try {
    // Merge into existing whatsapp channel config to avoid wiping QR-related fields
    const cur  = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
    const wa   = cur?.channels?.whatsapp || { enabled: true, provider: 'web', config: {} };
    const next = {
      ...wa,
      enabled:  true,
      provider: wa.provider || 'web',
      config:   { ...(wa.config || {}), allowedSenders: lines },
    };
    const r = await fetch('/api/config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ channels: { whatsapp: next } }),
    });
    if (!r.ok) {
      toast('Save failed — try again', 'error');
      return;
    }
    toast(
      lines.length === 0
        ? '✅ Allowlist cleared. Only YOU can talk to the agent now.'
        : `✅ Allowlist saved (${lines.length} number${lines.length === 1 ? '' : 's'}). Restart the agent to apply.`,
      'success'
    );
  } catch (e) {
    toast('Save failed: ' + String(e), 'error');
  }
}

async function waQRLogout() {
  await fetch('/api/whatsapp/logout', { method: 'POST' });
  state.connStatus['whatsapp'] = false;
  // Re-render the card in disconnected state
  const channelCreds = document.getElementById('channelCredentials');
  if (channelCreds) renderChannelCredentials?.();
  toast('WhatsApp unlinked. Scan QR again to reconnect.', 'info');
}

// Reset Baileys auth — wipes data/whatsapp-auth/ so the next QR is fresh.
// Used when the user keeps getting "Invalid QR code" because of stale
// credentials left over from a previously interrupted pairing.
async function waQRReset() {
  const hint = document.getElementById('wa-reset-hint');
  if (hint) hint.style.display = 'none';

  // Close current SSE stream
  if (_waQREventSource) { _waQREventSource.close(); _waQREventSource = null; }
  _waStopCountdown();

  const statusEl = document.getElementById('wa-qr-status');
  if (statusEl) statusEl.textContent = '🔄 Wiping cached credentials…';

  try {
    const r = await fetch('/api/whatsapp/reset', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) {
      if (statusEl) statusEl.textContent = '⚠️ Reset failed — ' + (d.error || r.statusText);
      return;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '⚠️ Reset failed — ' + String(e);
    return;
  }

  // Brief pause so the worker fully exits + auth dir is wiped
  if (statusEl) statusEl.textContent = '✅ Credentials cleared — starting fresh…';
  await new Promise((r) => setTimeout(r, 1500));

  // Now reconnect from scratch
  waQRConnect();
}

function checkGoogleUnified() {
  // Gmail is now handled inline with App Password — no service account needed.
  // The Google unified section only appears for Calendar / Sheets / Drive,
  // which use the Google API and require OAuth2 credentials.
  const needs =
    (state.selectedTools.has('calendar')    && document.getElementById('calendarProvider')?.value === 'google') ||
    (state.selectedTools.has('spreadsheet') && document.getElementById('spreadsheetProvider')?.value === 'google') ||
    (state.selectedTools.has('fileStorage') && document.getElementById('fileStorageProvider')?.value === 'gdrive');
  document.getElementById('googleUnifiedSection').style.display = needs ? 'block' : 'none';
}

// ============================================================
// Review Summary
// ============================================================
function renderReview() {
  const grid = document.getElementById('reviewGrid');
  const name  = document.getElementById('agentName')?.value || 'My AI';
  const user  = document.getElementById('userName')?.value  || '—';
  const email = document.getElementById('userEmail')?.value || '—';
  const phone = document.getElementById('userPhone')?.value || '—';
  const mg = state.modelCatalog.find(g => g.provider.id === state.selectedProvider);
  const mi = mg?.models.find(m => m.id === state.selectedModel);
  const modelDisplay = mi ? `${mi.displayName} (${mg.provider.name})`
    : state.selectedProvider === 'ollama' ? `${state.selectedModel} (local AI on this computer)` : state.selectedModel;

  const chans  = [...state.selectedChannels];
  const tools  = [...state.selectedTools];
  const skills = [...state.enabledSkills];

  grid.innerHTML = `
    <div class="review-card">
      <h3><img src="/images/vee-bot.png" alt="Vee" style="width:28px;height:28px;object-fit:contain;vertical-align:middle;margin-right:6px">Your AI</h3>
      <div class="review-row"><span>AI Name</span><span class="review-val">${name}</span></div>
      <div class="review-row"><span>Your Name</span><span class="review-val">${user}</span></div>
      <div class="review-row"><span>Email</span><span class="review-val" style="font-size:12px">${email}</span></div>
      <div class="review-row"><span>AI Model</span><span class="review-val" style="font-size:11px">${modelDisplay}</span></div>
    </div>
    <div class="review-card">
      <h3>🔗 Where It Works (${chans.length})</h3>
      ${chans.length ? chans.map(c=>{
        const ch = CHANNELS.find(x=>x.id===c);
        return `<div class="review-row"><span>${ch?.name||c}</span><span class="${state.connStatus[c]?'review-ok':'review-no'}">${state.connStatus[c]?'✓ Connected':'Pending'}</span></div>`;
      }).join('') : '<div style="color:var(--text-muted);font-size:13px">None connected</div>'}
    </div>
    <div class="review-card">
      <h3>🛠️ What It Can Access (${tools.length})</h3>
      ${tools.length ? tools.map(t=>{
        const tool = TOOLS.find(x=>x.id===t);
        return `<div class="review-row"><span>${tool?.name||t}</span><span class="review-ok">✓ Enabled</span></div>`;
      }).join('') : '<div style="color:var(--text-muted);font-size:13px">None selected</div>'}
    </div>
    <div class="review-card">
      <h3>⚡ What It Can Do (${skills.length})</h3>
      ${skills.map(s=>{
        const el = document.querySelector(`[data-sched="${s}"]`);
        const sched = el?.value || '';
        const sk = SKILLS.find(x=>x.id===s);
        return `<div class="review-row"><span>${sk?.name||s}</span><span class="review-val">${sched||'Manual'}</span></div>`;
      }).join('')}
    </div>`;

  document.getElementById('termSkillCount').textContent = skills.length;
  loadProactiveSchedules();
}

// ============================================================
// Proactive updates — opt-out scheduled briefings (Phase 2)
// ============================================================

async function loadProactiveSchedules() {
  try {
    const res = await fetch('/api/schedules');
    const data = await res.json();
    if (!data.success || !Array.isArray(data.schedules)) return;
    for (const s of data.schedules) {
      const card = document.getElementById(`proactive-${s.id}`);
      if (!card) continue;
      card.classList.toggle('enabled', !!s.enabled);
      const timeInput = card.querySelector('input[type="time"]');
      if (timeInput && s.time) timeInput.value = s.time;
    }
  } catch (e) { /* card keeps its defaults */ }
}

function proactiveStatusMsg(text, ok) {
  const box = document.getElementById('proactiveStatus');
  if (!box) return;
  box.style.display = 'block';
  box.style.background = ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
  box.style.color = ok ? 'var(--success)' : '#f87171';
  box.textContent = text;
  clearTimeout(box._hideTimer);
  box._hideTimer = setTimeout(() => { box.style.display = 'none'; }, 4000);
}

async function updateProactiveSchedule(id, patch) {
  try {
    const res  = await fetch(`/api/schedules/${id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    });
    const data = await res.json();
    if (!data.success) {
      proactiveStatusMsg(`⚠️ ${data.error || 'Could not save schedule'}`, false);
      loadProactiveSchedules(); // revert UI to server truth
      return;
    }
    const card = document.getElementById(`proactive-${id}`);
    if (card && data.record) {
      card.classList.toggle('enabled', !!data.record.enabled);
    }
    proactiveStatusMsg('✓ Saved — your AI will follow this schedule', true);
  } catch (e) {
    proactiveStatusMsg('⚠️ Could not reach the server', false);
  }
}

function toggleProactiveSchedule(id) {
  const card = document.getElementById(`proactive-${id}`);
  if (!card) return;
  const next = !card.classList.contains('enabled');
  card.classList.toggle('enabled', next); // optimistic
  updateProactiveSchedule(id, { enabled: next });
}

function revealGoLive() {
  document.getElementById('reviewActions').style.display = 'none';
  document.getElementById('goLiveCenter').style.display = 'block';
  window.scrollTo(0, document.body.scrollHeight);
  guideMsg('bot', "🚀 You're all set! Click **Go Live Now** to start your AI in this terminal, or **Save & Set Up Later** to come back whenever you're ready.");
}

// ============================================================
// Test Connection
// ============================================================
// badgeId — the card's tool/channel id (e.g. 'voice', 'telegram').
// When the testType differs from the card id (e.g. 'groq-whisper' vs 'voice'),
// the badge element is id="status-{badgeId}" not id="status-{testType}".
async function testConn(type, config, badgeId) {
  const statusId = badgeId || type;
  const el = document.getElementById(`status-${statusId}`)
           || document.getElementById(`status-${type}`)
           || document.getElementById('status-ai-provider');
  if (el) { el.className='glass-card-badge badge-pending'; el.textContent='Testing...'; }

  try {
    const res = await fetch('/api/test-connection',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({type, config}),
    });
    const d = await res.json();
    if (d.success) {
      if (el) { el.className='glass-card-badge badge-connected'; el.textContent='Connected'; }
      state.connStatus[statusId] = true;
      state.connStatus[type]     = true;
      toast(d.message, 'success');
      updateTips(); // refresh chips to reflect newly connected app
      // Auto-save credentials immediately on success so they survive page reloads
      // and aren't lost if the user never reaches the Go Live step.
      const nonEmpty = Object.fromEntries(
        Object.entries(config).filter(([, v]) => v && String(v).trim().length > 0)
      );
      if (Object.keys(nonEmpty).length) {
        fetch('/api/config/step/credentials', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(nonEmpty),
        }).catch(() => {});
      }
      return true;
    } else {
      if (el) { el.className='glass-card-badge badge-error'; el.textContent='Failed'; }
      toast(d.message || d.error, 'error');
      return false;
    }
  } catch(err) {
    if (el) { el.className='glass-card-badge badge-error'; el.textContent='Error'; }
    toast('Connection test failed: ' + err, 'error');
    return false;
  }
}

function testConnFor(id, testType) {
  const chCfg = CRED_CONFIGS[id];
  const provEl = document.getElementById(`${id}Provider`);
  const prov = provEl ? provEl.value : 'default';
  const conf = chCfg?.[prov];
  if (!conf) return;
  const vals = {};
  conf.fields.forEach(f => { const el = document.getElementById(f.id); if (el) vals[f.id]=el.value; });
  // Pass id so the card's own status badge is updated (not status-{testType} which may not exist)
  testConn(testType, vals, id);
}

function toggleVis(id) {
  const el = document.getElementById(id);
  el.type = el.type==='password' ? 'text' : 'password';
}

// ============================================================
// Start Fresh — wipe config and reload for a clean new-user experience
// ============================================================
async function startFresh() {
  const ok = confirm(
    'This will clear all saved settings and restart the wizard from scratch.\n\n' +
    'Use this when setting up a new user or testing the fresh-install experience.\n\n' +
    'Continue?'
  );
  if (!ok) return;
  try {
    const res = await fetch('/api/reset-config', { method:'POST' });
    const d = await res.json();
    if (d.success) {
      toast('Settings cleared — reloading…', 'success');
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast('Reset failed: ' + (d.error || 'unknown error'), 'error');
    }
  } catch(err) {
    toast('Reset failed: ' + err, 'error');
  }
}

// ============================================================
// Save & Launch
// ============================================================
async function saveFinalConfig() {
  const cfg = collectConfig();
  try {
    await fetch('/api/config',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(cfg),
    });
    // Successful commit — discard any draft so the restore banner doesn't
    // show on the next page load
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    toast('Configuration saved!', 'success');
  } catch(err) { toast('Save failed: '+err, 'error'); }
}

async function startAgentNow() {
  await saveFinalConfig();
  const box = document.getElementById('agentStatusBox');
  box.classList.add('show');
  box.innerHTML = '<div style="color:var(--brand-light)">Starting your AI...</div>';
  try {
    const res = await fetch('/api/agent/launch',{method:'POST'});
    const d = await res.json();
    if (d.success) {
      box.innerHTML = `<div style="color:var(--success);font-size:15px;font-weight:600">✅ ${d.name} is now live!</div>
        <div style="font-size:13px;color:var(--text-dim);margin-top:6px">Model: ${d.model} · ${d.toolCount} tools · ${d.skillCount} skills</div>`;
      document.getElementById('goLiveSub').textContent = `${d.name} is running and ready to work.`;
      toast('Your AI is live! 🚀','success');
      // Activate conversation sidebar (live mode layout)
      activateLiveMode();
      // Show the "how to keep running" guide
      const guide = document.getElementById('keepRunningGuide');
      if (guide) guide.style.display = 'block';
      // Auto-trigger guided onboarding — show the user exactly what's working
      // and walk them through connecting anything that's missing
      const onboardMsg = "My AI assistant is now live. Please check my setup status and guide me step by step through connecting any integrations that are not yet configured — start with the most important one (email or calendar).";
      appendUserMsg(onboardMsg, null);
      convTrackUser(onboardMsg);   // track for history
      callLiveAgent(onboardMsg, null);
      // Create desktop shortcut if user ticked the checkbox
      if (document.getElementById('createShortcut')?.checked) {
        const statEl = document.getElementById('shortcutStatus');
        try {
          const sr = await fetch('/api/create-shortcut', { method: 'POST' });
          const sd = await sr.json();
          if (statEl) {
            statEl.style.display = 'block';
            if (sd.success) {
              statEl.textContent = '✅ Desktop shortcut created — look for Vouza Admin Agent on your Desktop!';
              statEl.style.background = 'rgba(16,185,129,0.08)';
              statEl.style.color = 'var(--success)';
            } else {
              statEl.textContent = `⚠️ Shortcut skipped: ${sd.error}`;
              statEl.style.background = 'rgba(251,191,36,0.08)';
              statEl.style.color = 'var(--warning)';
            }
          }
        } catch(e) {
          if (statEl) {
            statEl.style.display = 'block';
            statEl.textContent = `⚠️ Could not create shortcut: ${e}`;
            statEl.style.background = 'rgba(251,191,36,0.08)';
            statEl.style.color = 'var(--warning)';
          }
        }
      }
    } else {
      box.innerHTML = `<div style="color:var(--error)">Failed to start: ${d.error}</div>`;
      toast('Failed: '+d.error,'error');
    }
  } catch(err) {
    box.innerHTML = `<div style="color:var(--error)">Error: ${err}</div>`;
    toast('Error: '+err,'error');
  }
}

function collectConfig() {
  return {
    agent: {
      name:     document.getElementById('agentName')?.value || 'AdminAgent',
      userName: document.getElementById('userName')?.value  || '',
      email:    document.getElementById('userEmail')?.value || '',
      phone:    document.getElementById('userPhone')?.value || '',
      model:    state.selectedProvider === 'openrouter' ? state.orTiers.balanced : state.selectedModel,
      provider: state.selectedProvider,
      timezone: document.getElementById('agentTimezone')?.value || 'Asia/Singapore',
      language: document.getElementById('agentLanguage')?.value || 'en',
      ...(state.selectedProvider === 'openrouter' ? { openrouterTiers: { ...state.orTiers } } : {}),
    },
    channels: Object.fromEntries([...state.selectedChannels].map(ch => {
      const p = document.getElementById(`${ch}Provider`);
      const prov = p ? p.value : 'default';
      const provCfg = CRED_CONFIGS[ch]?.[prov];
      const config = {};
      if (provCfg?.fields) {
        provCfg.fields.forEach(f => {
          const el = document.getElementById(f.id);
          if (el && el.value) config[f.id] = el.value;
        });
      }
      return [ch, {enabled:true, provider:prov, config}];
    })),
    tools: Object.fromEntries([...state.selectedTools].map(t => {
      const p = document.getElementById(`${t}Provider`);
      const prov = p ? p.value : 'default';
      const provCfg = CRED_CONFIGS[t]?.[prov];
      const config = {};
      if (provCfg?.fields) {
        provCfg.fields.forEach(f => {
          const el = document.getElementById(f.id);
          if (el && el.value) config[f.id] = el.value;
        });
      }
      return [t, {enabled:true, provider:prov, config}];
    })),
    credentials: (() => {
      const creds = {};
      // ── Critical: only include a credential if the user ACTUALLY typed a new value.
      // If the field is blank (showing the "✓ Already saved" placeholder), we omit it
      // entirely so deepMerge on the server preserves the existing saved key.
      // This prevents the config from being silently corrupted on every Go Live click.
      const newApiKey = document.getElementById('aiProviderKey')?.value?.trim();
      if (newApiKey) {
        creds[`${state.selectedProvider}ApiKey`] = newApiKey;
        if (state.selectedProvider === 'openrouter') creds['openrouterApiKey'] = newApiKey;
      }
      const googleSaKey = document.getElementById('googleSaKey')?.value?.trim();
      if (googleSaKey) creds['googleSaKey'] = googleSaKey;
      // Merge voice tool API keys into flat credentials so loader auto-detect works
      if (state.selectedTools.has('voice')) {
        const vProvEl = document.getElementById('voiceProvider');
        const vProv = vProvEl ? vProvEl.value : 'groq';
        if (vProv === 'groq') {
          const k = document.getElementById('groqApiKey')?.value?.trim();
          if (k) creds['groqApiKey'] = k;
        } else {
          const k = document.getElementById('openaiVoiceKey')?.value?.trim();
          if (k) creds['openaiApiKey'] = k;
        }
      }
      return creds;
    })(),
    skills: {
      enabled: [...state.enabledSkills],
      schedules: Object.fromEntries([...state.enabledSkills].map(s => {
        const el = document.querySelector(`[data-sched="${s}"]`);
        return [s, el?el.value:''];
      })),
    },
    selfImproveIntervalHours: parseInt(document.getElementById('selfImproveInterval')?.value||'24'),
    setupCompleted: true,
    setupCompletedAt: new Date().toISOString(),
  };
}

// ============================================================
// Toast
// ============================================================
function toast(msg, type='success') {
  const box = document.getElementById('toastBox');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `${type==='success'?'✅':'❌'} ${msg}`;
  box.appendChild(t);
  setTimeout(()=>t.remove(), 4000);
}
// Older call sites use showToast(msg, 'ok' | 'warn' | 'error' | 'success').
function showToast(msg, type = 'success') {
  toast(msg, type === 'warn' || type === 'error' ? 'error' : 'success');
}

// ============================================================
// AI Guide — Live Streaming Agent
// ============================================================

// Stable session ID for this browser tab
const CHAT_SESSION_ID = 'sess-' + Math.random().toString(36).slice(2, 10);

// State for the chat panel
const chat = {
  busy: false,
  pendingImage: null,     // { base64: string, mimeType: string, preview: string }
  pendingTextFile: null,  // { name: string, content: string }
};

// Step-specific opening messages (displayed before the user types anything)
/** Return name-personalised scripted messages for a given step */
function getGuideScripts(step) {
  const name = document.getElementById('userName')?.value?.trim();
  const hi   = name ? `Hi **${name}**! ` : '';
  return {
    1: [
      "👋 Hi! I'm **Vee**, your Vouza AI assistant. I'm here to help you set up — and handle any office task once you're live.",
      "Just fill in your name and email above, then click Continue. I'll take care of the technical bits for you.",
      "Once you complete setup I can send emails, read documents, book meetings, transcribe voice notes, and more!",
    ],
    2: [
      `${hi}Now let's connect your apps.`,
      "Pick the apps you use most — **Email** and **Telegram** are the most popular. Telegram lets you chat with me from your phone, which is a game-changer.",
      "Once anything is connected, type a message below and I'll respond as a real AI assistant — not just a script.",
    ],
    3: [
      `${hi}Great progress! ⚡ Now choose which tasks you want me to handle automatically.`,
      "**Email Triage** and **Daily Briefing** are the most popular — they save people 30–60 minutes a day.",
      "Everything can be changed later, so just toggle what feels right for now.",
    ],
    4: [
      `${hi}You're almost there! 🚀 Review your full configuration below.`,
      "Click **Go Live** and I'll be available 24/7 — emails, meetings, messages, voice notes, and more.",
    ],
  }[step] || [];
}

/** Return connection-aware tip chips for the current wizard step */
function getDynamicTips(step) {
  const cs = state.connStatus || {};
  const hasEmail    = cs.email || cs.gmail || cs['email-gmail'] || cs['email-smtp'] || cs['email-outlook'] || cs.agentmail;
  const hasTelegram = cs.telegram;
  const hasCalendar = cs.calendar || cs['calendar-google'] || cs['calendar-outlook'];
  const hasKey      = !!(document.getElementById('aiProviderKey')?.value?.trim() ||
                         (document.getElementById('aiProviderKey')?.placeholder || '').includes('saved') ||
                         (state.operatorDefaults?.hasDefaultKey &&
                          state.operatorDefaults?.defaultKeyStatus !== 'invalid'));

  switch (step) {
    case 1:
      return ['What can you do once I\'m set up?', 'How long does setup take?', 'Is my data kept private?'];
    case 2: {
      const tips = [];
      if (!hasKey)      tips.push('Walk me through getting started →');
      if (!hasEmail)    tips.push('Help me connect Gmail →');
      if (!hasTelegram) tips.push('Set up my Telegram bot →');
      if (!hasCalendar) tips.push('Connect Google Calendar →');
      // Pad with general tips if everything is connected
      const fallbacks = ['Check my setup status', 'Read my latest emails', 'What skills should I enable?'];
      for (const f of fallbacks) { if (tips.length < 3) tips.push(f); }
      return tips.slice(0, 3);
    }
    case 3:
      return ['What does Email Triage do?', 'How does the Daily Briefing work?', 'Can I change skills later?'];
    case 4:
      return ['Check my setup status', 'What happens when I go live?', 'Can I add more apps later?'];
    default:
      return ['What can you do?', 'Show my setup status', 'How do I add more apps?'];
  }
}

// ── Scripted step messages (no API key needed) ──────────────────────────────

let _hasAutoProbed = false; // prevent repeat probes on step-revisits

function guideForStep(n) {
  // Wizard-only: the live dashboard has its own start screen, and must not
  // contact the AI before the user asks (init() runs just before live mode).
  if (isLiveMode()) return;
  const msgs = getGuideScripts(n);
  if (!msgs.length) return;
  const delay = n === 1 ? 900 : 400;
  let t = delay;
  for (const m of msgs) {
    setTimeout(() => { if (!isLiveMode()) guideBotScripted(m); }, t);
    t += m.length * 14 + 700;
  }
  setTimeout(() => { if (!isLiveMode()) updateTips(); }, t);

  // ── Proactive setup probe: only on first visit to step 1 ─────────────────
  // After scripted intro settles, the live AI quietly calls get_setup_status
  // and delivers a personalised welcome — no user action required.
  if (n === 1 && !_hasAutoProbed && !_isResume) {
    _hasAutoProbed = true;
    setTimeout(() => {
      if (isLiveMode()) return;
      const box      = document.getElementById('guideMessages');
      const userMsgs = box?.querySelectorAll('.guide-msg.user');
      if (!userMsgs?.length && !chat.busy) {
        // Hidden probe — no user bubble shown; agent responds naturally
        callLiveAgent(
          'Please call get_setup_status now and give me a brief, friendly 2-sentence personalised welcome. ' +
          'Tell me what is already connected (if anything) and what the single most important next step is. ' +
          'Do NOT repeat the scripted intro — this is your first LIVE response.',
          null
        );
      }
    }, t + 1500);
  }
}

// guideMsg(role, text) — called from revealGoLive() and launchAgent()
// 'bot' → scripted bot bubble with typing indicator
// 'user' → plain user bubble (rare, kept for symmetry)
function guideMsg(role, text) {
  if (role === 'bot') guideBotScripted(text);
  else appendUserMsg(text, null);
}

function guideBotScripted(text) {
  const typingEl = document.getElementById('guideTyping');
  typingEl.classList.add('visible');
  setTimeout(() => {
    typingEl.classList.remove('visible');
    appendMsg('bot', `<div class="msg-bubble">${renderMd(text)}</div><div class="msg-time">${timeNow()}</div>`);
  }, Math.min(text.length * 10, 1000));
}

// ─────────────────────────────────────────────────────────────────────────
// appendMsg — single helper for every chat insertion.
// INVARIANT: typing indicator always lives at the END of the message list.
// We always appendChild() the new message, then move typingEl to the bottom.
// This eliminates the bug where bot replies showed up ABOVE user messages
// (beta-tester screenshot, 2026-05-27).
// ─────────────────────────────────────────────────────────────────────────
function appendMsg(role, innerHTML, opts) {
  const box      = document.getElementById('guideMessages');
  if (!box) return null;
  const typingEl = document.getElementById('guideTyping');
  const el = document.createElement('div');
  el.className = 'guide-msg ' + role + ((opts && opts.history) ? ' history' : '');
  el.innerHTML = innerHTML;
  box.appendChild(el);
  if (typingEl) box.appendChild(typingEl); // keep typing indicator last
  pinChatToBottom();
  return el;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSATION HISTORY — persistent chat threads (ChatGPT-style sidebar)
// ══════════════════════════════════════════════════════════════════════════════

const convState = {
  currentId:   null,   // active conversation ID
  messages:    [],     // [{role, content, timestamp}]
  allConvs:    [],     // metadata list from server
  searchQuery: '',
};

function generateConvId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
}

// Tracks whether the user opened the wizard FROM live mode (Settings flow),
// so we know to show "Back to Chat" instead of forcing them through Go Live.
let _inSettingsMode = false;

// Switch dashboard out of "live" mode to allow reconfiguring
function openSettings() {
  _inSettingsMode = true;
  closePages();
  document.getElementById('mainApp').classList.remove('live-mode');
  // Ensure wizard forms are pre-filled from saved config
  _isResume = true;
  if (_savedConfig) prefillFromConfig(_savedConfig);
  showStep(1);
  // Back-to-Chat button is now injected by showStep() on every step
}

/**
 * Add a "← Back to Chat" button to the current step's nav group so the user
 * can exit the settings flow from ANY step (Step 2 if they were just adding
 * a credential, Step 3 if they were tweaking skills, etc.). Previously this
 * only worked from Step 1.
 *
 * Idempotent — re-running doesn't duplicate the button.
 */
function ensureBackToChatButton(stepNum) {
  if (!_inSettingsMode) return;
  const navGroup = document.querySelector(`#step-${stepNum} .btn-nav-group`);
  if (!navGroup) return;
  // Remove any stale instances from other steps (only the current step should have one)
  document.querySelectorAll('.back-to-chat-btn').forEach((el) => el.remove());
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary back-to-chat-btn';
  backBtn.textContent = '← Back to Chat';
  backBtn.onclick = () => {
    document.querySelectorAll('.back-to-chat-btn').forEach((el) => el.remove());
    _inSettingsMode = false;
    _isResume = false;
    activateLiveMode();
  };
  navGroup.insertBefore(backBtn, navGroup.firstChild);
}

// Switch dashboard to "live" mode — shows conversation sidebar, hides wizard
function activateLiveMode() {
  document.getElementById('mainApp').classList.add('live-mode');
  // Sync agent name — check input, then saved config, then fallback
  const name = document.getElementById('agentName')?.value?.trim()
    || _savedConfig?.agent?.name
    || state?.agentName
    || 'Admin Agent';
  const nameEl = document.getElementById('convSidebarAgentName');
  if (nameEl) nameEl.textContent = name;
  // Only start a fresh conversation if none is active (prevents losing mid-session thread on Settings → Back)
  if (!convState.currentId) newConversation();
  // Load existing conversations
  loadConversations();
  // Render the Setup Status panel — shows what's still not connected so the
  // user can complete onboarding without leaving live mode
  renderSetupStatusPanel();
  // Auto-refresh every 30s so badges reflect live probe results from
  // /api/integrations/snapshot without requiring manual reloads
  startSetupStatusAutoRefresh();
  // Check agent is actually running — warn if auto-launch failed
  checkAgentHealth();
  // Start the live-status dot polling (small dot next to agent name)
  startLiveStatusPolling();
  // Land on the chat page; show which AI answers under the message box
  openPage('chat');
  refreshChatModelLine();
  updateChatEmptyState();
}

/**
 * Render the Setup Status panel in the live-mode sidebar.
 * Shows ✓ Connected vs ⚠️ Missing for every essential integration, with
 * one-click "Set up via Guide Bot" that pre-sends a request to the Guide
 * Bot to walk the user through the remaining setup step by step.
 */
// Maps the Setup Status item ID to the corresponding Integration registry ID.
// Lets us layer LIVE probe results from /api/integrations/snapshot on top
// of the configured-vs-not status read from /api/config. So the dot reflects
// real liveness, not just field presence.
const SETUP_ITEM_TO_INTEGRATION = {
  ai:        'ai-provider',
  email:     'email',
  telegram:  'telegram',
  whatsapp:  'whatsapp',
  voice:     'voice',
  // calendar + spreadsheet adapters come in a later commit
};

async function renderSetupStatusPanel() {
  const panel = document.getElementById('setupStatusPanel');
  if (!panel) return;

  // Fetch config + operator defaults + integration snapshot in parallel.
  // Snapshot may not be available on older agents — fall back to config-only.
  const [cfg, op, snap] = await Promise.all([
    fetch('/api/config').then((r) => r.json()).catch(() => null),
    fetch('/api/operator-defaults').then((r) => r.json()).catch(() => ({})),
    fetch('/api/integrations/snapshot').then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (!cfg) return;

  // Integration registry snapshot: maps integration-id → { status, lastProbe, ... }
  // Status enum: disabled | unconfigured | connecting | connected | degraded | failed | cooldown
  const liveStatuses = snap?.snapshot || {};

  // AI-key detection must match loader.ts field names exactly
  const creds = cfg.credentials || {};
  const hasAnyUserAiKey =
    !!creds.openaiApiKey || !!creds.anthropicApiKey ||
    !!creds.googleApiKey || !!creds.googleAiApiKey || !!creds.openrouterApiKey ||
    !!creds.xaiApiKey || !!creds.deepseekApiKey || !!creds.moonshotApiKey ||
    !!creds.alibabaApiKey || !!creds.dashscopeApiKey;
  const hasOperatorKey = !!op.hasDefaultKey && op.defaultKeyStatus !== 'invalid';

  const ITEMS = [
    { id:'ai',          name:'AI Model',            icon:'🤖', test: () => hasAnyUserAiKey || hasOperatorKey, ask: 'I want to add or change my AI API key. Please walk me through it.' },
    { id:'email',       name:'Email',               icon:'📧', test: () => cfg.channels?.email?.enabled,    ask: 'I want to connect my email. Walk me through it step by step.' },
    { id:'telegram',    name:'Telegram',            icon:'💬', test: () => cfg.channels?.telegram?.enabled, ask: 'Help me set up Telegram so I can chat with the AI from my phone.' },
    { id:'whatsapp',    name:'WhatsApp',            icon:'📱', test: () => cfg.channels?.whatsapp?.enabled, ask: 'Help me connect WhatsApp. I want to scan the QR code.' },
    { id:'calendar',    name:'Calendar',            icon:'📅', test: () => cfg.tools?.calendar?.enabled,    ask: 'Help me connect Google Calendar so the AI can schedule meetings.' },
    { id:'spreadsheet', name:'Spreadsheets',        icon:'📊', test: () => cfg.tools?.spreadsheet?.enabled, ask: 'Help me connect Google Sheets for invoice and data tracking.' },
    { id:'voice',       name:'Voice Transcription', icon:'🎙️', test: () => !!creds.groqApiKey || !!creds.openaiVoiceKey, ask: 'Help me set up voice transcription (Groq Whisper — it\'s free).' },
  ];

  // For each item, layer:
  //   1. configured?  (from /api/config — is the credential present)
  //   2. liveStatus?  (from /api/integrations/snapshot — is it actually working)
  // If both available, dot color reflects the live probe; if not, fall back to configured.
  const results = ITEMS.map((it) => {
    const configured = !!it.test();
    const integrationId = SETUP_ITEM_TO_INTEGRATION[it.id];
    const live = integrationId ? liveStatuses[integrationId] : undefined;
    let dotClass = configured ? 'ok' : '';
    let tooltip  = configured ? 'Configured' : 'Not configured';
    let action   = configured ? '✓' : '+ Add';

    if (live?.status) {
      switch (live.status) {
        case 'connected':
          dotClass = 'ok';
          tooltip = live.status.message || 'Connected and live';
          break;
        case 'connecting':
          dotClass = 'warn';
          tooltip = (live.status.message || 'Connecting') + ' …';
          action = '…';
          break;
        case 'degraded':
          dotClass = 'warn';
          tooltip = `Degraded: ${live.status.message || 'recent probe failed'}`;
          action = '⚠';
          break;
        case 'failed':
          dotClass = 'bad';
          tooltip = `Failed: ${live.status.message || 'check key'}`;
          action = '⚠ Fix';
          break;
        case 'unconfigured':
        case 'disabled':
          dotClass = '';
          break;
      }
    }
    return { ...it, configured, dotClass, tooltip, action };
  });

  const connected = results.filter((r) => r.configured).length;
  const total     = results.length;
  const pct       = Math.round((connected / total) * 100);
  const allDone   = connected === total;

  panel.innerHTML = `
    <div class="setup-status-header">
      <span>Setup Status</span>
      <span class="setup-status-pct ${allDone?'complete':''}">${connected}/${total}</span>
    </div>
    <div class="setup-progress-bar ${allDone?'setup-status-complete':''}">
      <div class="setup-progress-fill" style="width:${pct}%"></div>
    </div>
    <div class="setup-status-items">
      ${results.map((r) => `
        <div class="setup-status-item ${r.configured?'connected':'missing'}" data-channel-id="${r.id}"
             onclick="${r.configured?`onSetupItemClick('${r.id}', true)`:`onSetupItemClick('${r.id}', false, ${JSON.stringify(r.ask).replace(/"/g, '&quot;')})`}">
          ${r.dotClass ? `<span class="live-dot ${r.dotClass}" title="${escHtml(r.tooltip)}" aria-label="${escHtml(r.tooltip)}"></span>` : ''}
          <span class="icon">${r.icon}</span>
          <span class="name">${r.name}</span>
          <span class="action">${r.action}</span>
        </div>
      `).join('')}
    </div>
    <button class="setup-status-add-btn" onclick="openSettings()">⚙️ Manage all integrations</button>
  `;
}

// Auto-refresh the Setup Status panel every 30s so live probes are reflected
// without the user clicking around. Started on live-mode entry; stopped when
// leaving. Defensive: clears any prior timer to avoid leaks on hot reload.
let _setupStatusAutoRefreshTimer = null;
function startSetupStatusAutoRefresh() {
  if (_setupStatusAutoRefreshTimer) clearInterval(_setupStatusAutoRefreshTimer);
  _setupStatusAutoRefreshTimer = setInterval(() => {
    if (!document.getElementById('mainApp')?.classList.contains('live-mode')) return;
    renderSetupStatusPanel().catch(() => {});
  }, 30_000);
  if (_setupStatusAutoRefreshTimer.unref) _setupStatusAutoRefreshTimer.unref();
}

/**
 * Handle click on a Setup Status item.
 * - connected item: opens the Settings flow on that section (advanced edit)
 * - missing item: sends a pre-canned message into the Guide Bot chat so the
 *   bot walks the user through setup conversationally
 */
function onSetupItemClick(itemId, connected, askPrompt) {
  if (connected) {
    // Already connected — open settings so user can modify if they want
    openSettings();
    return;
  }
  // The AI has its own page (online key or local AI on this computer)
  if (itemId === 'ai' && isLiveMode()) { openPage('ai'); return; }
  if (askPrompt) {
    // Send the request to the chat — the assistant walks the user through it.
    const input = document.getElementById('guideInput');
    if (input) {
      if (isLiveMode()) openPage('chat');
      input.value = askPrompt;
      sendGuideMsg();
    }
  }
}

// Verify agent is up; show a gentle warning banner if not
async function checkAgentHealth() {
  try {
    const status = await fetch('/api/agent/status').then(r => r.json());
    if (!status.running) {
      const box = document.getElementById('agentStatusBox');
      if (box) {
        box.classList.add('show');
        box.innerHTML = `<div style="color:var(--error);font-size:13px">
          ⚠️ Agent is not running yet.
          <button onclick="retryLaunch()" style="margin-left:10px;background:var(--brand);color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px">▶ Launch Now</button>
        </div>`;
      }
    }
  } catch { /* server might still be starting — ignore */ }
}

// Manual launch retry from the live-mode warning banner
async function retryLaunch() {
  const box = document.getElementById('agentStatusBox');
  if (box) box.innerHTML = '<div style="color:var(--brand-light);font-size:13px">Starting agent…</div>';
  try {
    const res  = await fetch('/api/agent/launch', { method:'POST' });
    const data = await res.json();
    if (data.success) {
      if (box) box.innerHTML = `<div style="color:var(--success);font-size:13px">✅ ${data.name ?? 'Agent'} is now live!</div>`;
      setTimeout(() => { if (box) box.classList.remove('show'); }, 3000);
    } else {
      if (box) box.innerHTML = `<div style="color:var(--error);font-size:13px">⚠️ Launch failed: ${data.error}</div>`;
    }
  } catch(e) {
    if (box) box.innerHTML = `<div style="color:var(--error);font-size:13px">⚠️ ${e}</div>`;
  }
}

// Create a brand-new conversation thread
function newConversation() {
  convState.currentId = generateConvId();
  convState.messages  = [];
  // Clear chat panel but keep the typing indicator
  const box = document.getElementById('guideMessages');
  if (box) {
    const typing = box.querySelector('#guideTyping');
    Array.from(box.children).forEach(el => { if (el.id !== 'guideTyping') el.remove(); });
    if (!typing) {
      box.insertAdjacentHTML('afterbegin',
        '<div class="guide-typing" id="guideTyping"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>');
    }
  }
  // De-select all sidebar items
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
}

// Load conversation list from server and render sidebar
async function loadConversations() {
  try {
    const convs = await fetch('/api/conversations').then(r => r.json());
    convState.allConvs = Array.isArray(convs) ? convs : [];
    renderConvList(convState.searchQuery
      ? convState.allConvs.filter(c => c.title.toLowerCase().includes(convState.searchQuery))
      : convState.allConvs);
  } catch(e) { console.warn('Conv list fetch failed:', e); }
}

// Filter sidebar list by search query
function filterConvs(query) {
  convState.searchQuery = (query || '').toLowerCase();
  const filtered = convState.searchQuery
    ? convState.allConvs.filter(c => c.title.toLowerCase().includes(convState.searchQuery))
    : convState.allConvs;
  renderConvList(filtered);
}

// Render the grouped conversation list
function renderConvList(convs) {
  const list = document.getElementById('convList');
  if (!list) return;
  if (!convs || !convs.length) {
    list.innerHTML = `<div class="conv-empty">
      <div class="conv-empty-icon">💬</div>
      <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:6px">No conversations yet</div>
      <div style="font-size:12px;color:var(--text-dim);line-height:1.6">
        Start chatting in the panel on the right — every thread is saved here automatically so you can resume anytime.
      </div>
    </div>`;
    return;
  }
  const now       = Date.now();
  const todayMs   = new Date().setHours(0,0,0,0);
  const yesterMs  = todayMs - 86400000;
  const weekMs    = todayMs - 6 * 86400000;
  const groups    = [
    { label:'Today',       items:[] },
    { label:'Yesterday',   items:[] },
    { label:'Last 7 days', items:[] },
    { label:'Older',       items:[] },
  ];
  convs.forEach(c => {
    const t = new Date(c.updatedAt).getTime();
    if      (t >= todayMs)  groups[0].items.push(c);
    else if (t >= yesterMs) groups[1].items.push(c);
    else if (t >= weekMs)   groups[2].items.push(c);
    else                    groups[3].items.push(c);
  });
  let html = '';
  groups.forEach(g => {
    if (!g.items.length) return;
    html += `<div class="conv-group-label">${g.label}</div>`;
    g.items.forEach(c => {
      const active  = c.id === convState.currentId ? 'active' : '';
      // highlightHits visually marks the matched search substring (no-op when no query)
      const query   = convState.searchQuery || '';
      const title   = highlightHits(c.title, query);
      const preview = c.preview ? highlightHits(c.preview.slice(0,60), query) : '';
      html += `
        <div class="conv-item ${active}" onclick="openConversation('${c.id}')" data-id="${c.id}">
          <div class="conv-item-title">${title}</div>
          <div class="conv-item-meta">${preview}</div>
          <button class="conv-item-del" onclick="deleteConv(event,'${c.id}')" title="Delete">×</button>
        </div>`;
    });
  });
  list.innerHTML = html;
}

// Open and display a past conversation
async function openConversation(id) {
  if (convState.currentId === id) return;
  try {
    const data = await fetch(`/api/conversations/${id}`).then(r => r.json());
    convState.currentId = id;
    convState.messages  = data.messages || [];
    // Re-render chat panel
    const box    = document.getElementById('guideMessages');
    const typing = box?.querySelector('#guideTyping');
    if (box) Array.from(box.children).forEach(el => { if (el.id !== 'guideTyping') el.remove(); });
    convState.messages.forEach(m => {
      if (m.role === 'user')      appendHistoryMsg(m.content, 'user');
      else                        appendHistoryMsg(m.content, 'bot');
    });
    pinChatToBottom();
    // Highlight active item
    document.querySelectorAll('.conv-item').forEach(el =>
      el.classList.toggle('active', el.dataset.id === id));
  } catch(e) {
    toast('Could not load conversation', 'error');
  }
}

// Render a historical message (no timestamp, slightly dimmed)
function appendHistoryMsg(content, role) {
  const inner = (role === 'user')
    ? `<div class="msg-bubble"><span>${escHtml(content)}</span></div>`
    : `<div class="msg-bubble">${renderMd(content)}</div>`;
  appendMsg(role, inner, { history: true });
}

// Called after user sends a message — records it
function convTrackUser(text) {
  if (!text) return;
  if (!convState.currentId) convState.currentId = generateConvId();
  convState.messages.push({ role:'user', content:text, timestamp: new Date().toISOString() });
  // Don't save yet — wait for the bot reply so both land together
}

// Called after bot finishes streaming — records reply and persists
function convTrackBot(text) {
  if (!text) return;
  if (!convState.currentId) convState.currentId = generateConvId();
  convState.messages.push({ role:'assistant', content:text, timestamp: new Date().toISOString() });
  saveConversation();
}

// Persist the current conversation to the server
async function saveConversation() {
  if (!convState.currentId || !convState.messages.length) return;
  const firstUser = convState.messages.find(m => m.role === 'user');
  const title     = (firstUser?.content || 'New conversation').slice(0,70).replace(/\s+/g,' ').trim();
  const last      = convState.messages[convState.messages.length - 1];
  const preview   = (last?.content || '').slice(0,100).replace(/\s+/g,' ').trim();
  const conv      = {
    id: convState.currentId,
    title,
    preview,
    createdAt:    convState.messages[0].timestamp,
    updatedAt:    new Date().toISOString(),
    messageCount: convState.messages.length,
    messages:     convState.messages,
  };
  try {
    await fetch(`/api/conversations/${convState.currentId}`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json' },
      body:    JSON.stringify(conv),
    });
    loadConversations(); // refresh sidebar list
  } catch(e) { console.warn('Conv save failed:', e); }
}

// Delete a conversation
async function deleteConv(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this conversation?\nThis cannot be undone.')) return;
  try {
    await fetch(`/api/conversations/${id}`, { method:'DELETE' });
    if (convState.currentId === id) newConversation();
    await loadConversations();
    toast('Conversation deleted', 'success');
  } catch(e) { toast('Failed to delete', 'error'); }
}

// ── User sends a message ────────────────────────────────────────────────────

function sendGuideMsg() {
  const inp  = document.getElementById('guideInput');
  const text = inp.value.trim();
  if (!text && !chat.pendingImage && !chat.pendingTextFile) return;
  if (chat.busy) { toast('Please wait — I\'m still responding…', 'error'); return; }

  inp.value = '';
  autoGrowGuideInput();

  // Show user message in chat
  appendUserMsg(text, chat.pendingImage, chat.pendingTextFile);

  // Track for conversation history (text only — images/files tracked separately if needed)
  if (text) convTrackUser(text);

  // Snapshot attachments before clearing so callLiveAgent uses the right payload
  const snapImage    = chat.pendingImage;
  const snapTextFile = chat.pendingTextFile;

  // Clear attachments BEFORE the async call so a quick second send doesn't re-attach
  chat.pendingImage    = null;
  chat.pendingTextFile = null;
  clearImagePreview();
  clearTextFilePreview();

  // Call the live agent
  callLiveAgent(text, snapImage, snapTextFile);
}

// ── Chat scroll helper ──────────────────────────────────────────────────────
// Reliably pin the chat panel to the bottom across desktop and mobile browsers.
// requestAnimationFrame waits for the next paint so the container's scrollHeight
// reflects the actual rendered content (matters on mobile where the keyboard
// or new content can shift layout between insert and scroll).
// Double-rAF protects against the rare case where a layout pass happens between
// the first frame and the next text_delta arriving.
function pinChatToBottom() {
  const box = document.getElementById('guideMessages');
  if (!box) return;
  requestAnimationFrame(() => {
    box.scrollTop = box.scrollHeight;
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  });
}

function appendUserMsg(text, image, textFile) {
  let content = '';
  if (image) {
    content += `<img src="${image.preview}" style="max-width:180px;border-radius:8px;margin-bottom:6px;display:block">`;
  }
  if (textFile) {
    const kb = (textFile.content.length / 1024).toFixed(1);
    content += `<div style="display:inline-block;padding:4px 10px;border-radius:10px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);font-size:11px;margin-bottom:6px;">📎 ${escHtml(textFile.name)} (${kb} KB)</div><br>`;
  }
  if (text) content += `<span>${escHtml(text)}</span>`;

  appendMsg('user', `<div class="msg-bubble">${content}</div><div class="msg-time">${timeNow()}</div>`);
}

// ── Live agent call with SSE streaming ─────────────────────────────────────

async function callLiveAgent(text, image, textFile) {
  chat.busy = true;
  setInputEnabled(false);

  const box      = document.getElementById('guideMessages');
  const typingEl = document.getElementById('guideTyping');

  // Show typing indicator
  typingEl.classList.add('visible');

  // Get the API key from the form (if entered during setup wizard)
  const apiKey = document.getElementById('aiProviderKey')?.value?.trim() || '';

  try {
    // Security: only transmit the API key from the browser if the user is actively
    // testing a NEW key that hasn't been saved to config.json yet.
    // For established users the key lives in config.json server-side — the browser
    // should never re-send it on every chat request to avoid unnecessary exposure.
    // Detection: if the key field placeholder says "saved", a key is already stored.
    const keyEl         = document.getElementById('aiProviderKey');
    const typedKey      = keyEl?.value?.trim() || '';
    const isKeySaved    = (keyEl?.placeholder || '').toLowerCase().includes('saved');
    const apiKeyToSend  = (typedKey && !isKeySaved) ? typedKey : undefined;

    const fallbackMsg = text
      || (textFile ? `(attached file: ${textFile.name})` : '')
      || (image ? '(image attached)' : '');
    const body = {
      message:             fallbackMsg,
      sessionId:           CHAT_SESSION_ID,
      apiKey:              apiKeyToSend,         // undefined for established users
      imageBase64:         image?.base64        || undefined,
      imageMimeType:       image?.mimeType      || undefined,
      attachedFileContent: textFile?.content    || undefined,
      attachedFileName:    textFile?.name       || undefined,
      wizardStep:          state.step           || undefined,
      userName:            document.getElementById('userName')?.value?.trim() || undefined,
    };

    const resp = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || resp.statusText);
    }

    // Create the streaming bot bubble — use appendMsg so the typing indicator
    // always stays at the end (prevents the beta-tester-reported "bot reply above user msg" bug)
    typingEl.classList.remove('visible');
    const botEl = appendMsg('bot',
      `<div class="msg-bubble streaming-bubble" id="stream-bubble"></div>` +
      `<div class="msg-time">${timeNow()}</div>`
    );

    const bubble    = botEl ? botEl.querySelector('#stream-bubble') : document.getElementById('stream-bubble');
    // Helper: every time we mutate the streaming bubble, re-pin the typing
    // indicator to the end of the message list (invariant).
    const keepTypingLast = () => { if (typingEl && box) box.appendChild(typingEl); };
    let   fullText  = '';
    let   toolCards = '';

    // Read SSE stream
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        switch (event.type) {
          case 'text_delta':
            fullText += event.text;
            bubble.innerHTML = toolCards + renderMd(fullText) + '<span class="t-blink">▌</span>';
            keepTypingLast();
            pinChatToBottom();
            break;

          case 'tool_start':
            toolCards += buildToolCard(event.toolName, 'running', event.input);
            bubble.innerHTML = toolCards + (fullText ? renderMd(fullText) : '') + '<span class="t-blink">▌</span>';
            keepTypingLast();
            pinChatToBottom();
            break;

          case 'tool_result': {
            const ok   = event.result?.success !== false;
            const last = toolCards.lastIndexOf('tool-card running');
            if (last !== -1) {
              toolCards = toolCards.slice(0, last) + toolCards.slice(last).replace('tool-card running', `tool-card ${ok ? 'done' : 'fail'}`);
            }
            bubble.innerHTML = toolCards + (fullText ? renderMd(fullText) : '') + '<span class="t-blink">▌</span>';
            keepTypingLast();
            pinChatToBottom();
            break;
          }

          case 'turn_complete':
          case 'done':
            // If the bot bubble ended up with no content (no text, no tool cards),
            // remove it entirely so we don't leave a phantom empty bubble that
            // creates the huge vertical gap a beta tester saw.
            if (!fullText && !toolCards) {
              if (botEl && botEl.parentNode) botEl.parentNode.removeChild(botEl);
            } else {
              // Remove blinking cursor
              bubble.innerHTML = toolCards + (fullText ? renderMd(fullText) : '(Done)');
            }
            keepTypingLast();
            pinChatToBottom();
            // Persist bot reply to conversation history
            if (fullText) convTrackBot(fullText);
            break;

          case 'error':
            bubble.innerHTML = toolCards + `<span style="color:var(--error)">⚠️ ${escHtml(event.error)}</span>`;
            keepTypingLast();
            break;

          case 'confirm_needed':
            // A send / going online / memory save is waiting for the person's
            // answer. The server decides; these buttons just type "yes"/"no".
            if (botEl) botEl.appendChild(buildConfirmRow(event.kind));
            keepTypingLast();
            pinChatToBottom();
            break;

          case 'credential_saved':
            // Wizard card badge live-update: when the agent saves credentials,
            // flip the relevant card badge to "✓ Connected" without a page reload.
            markWizardCardConnected(event.slug, event.integration);
            break;
        }
      }
    }

  } catch (err) {
    typingEl.classList.remove('visible');
    // Show a helpful fallback when no API key yet
    const msg = String(err);
    const isAuthErr = msg.includes('401') || msg.includes('API key') || msg.includes('authentication');
    const fallback = isAuthErr
      ? "🔑 I need an API key to respond. Enter it in **Step 2 → AI Account Access**, then I'll be fully live!"
      : `⚠️ ${msg}`;
    guideBotScripted(fallback);
  } finally {
    chat.busy = false;
    setInputEnabled(true);
  }
}

// ── YES / NO buttons for actions waiting on the person ─────────────────────
const CONFIRM_LABELS = {
  send:   ['✅ Yes, send it', '❌ Cancel'],
  online: ['🌐 Yes, go online', '🏠 Stay offline'],
  memory: ['✅ Yes, save it', "❌ Don't save"],
};

function buildConfirmRow(kind) {
  const [yes, no] = CONFIRM_LABELS[kind] || CONFIRM_LABELS.send;
  const row = document.createElement('div');
  row.className = 'confirm-row';
  row.style.cssText = 'display:flex;gap:8px;margin:8px 0 4px;flex-wrap:wrap';
  row.innerHTML =
    `<button type="button" class="btn btn-primary" style="font-size:13px;padding:6px 14px" onclick="answerConfirm(this,'yes')">${escHtml(yes)}</button>` +
    `<button type="button" class="btn" style="font-size:13px;padding:6px 14px" onclick="answerConfirm(this,'no')">${escHtml(no)}</button>`;
  return row;
}

function answerConfirm(btn, answer) {
  if (chat.busy) { toast("Please wait — I'm still responding…", 'error'); return; }
  btn.closest('.confirm-row')?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  appendUserMsg(answer);
  convTrackUser(answer);
  callLiveAgent(answer);
}

// ── Tool call card UI ───────────────────────────────────────────────────────

const TOOL_LABELS = {
  read_emails:          '📧 Reading emails',
  send_email:           '📤 Sending email',
  draft_email:          '✏️ Drafting email',
  triage_emails:        '🗂️ Triaging inbox',
  list_events:          '📅 Checking calendar',
  create_event:         '📅 Creating event',
  update_event:         '📅 Updating event',
  find_free_slots:      '🕐 Finding free time',
  read_spreadsheet:     '📊 Reading spreadsheet',
  write_spreadsheet:    '📊 Writing spreadsheet',
  search_spreadsheet:   '🔍 Searching spreadsheet',
  list_files:           '📁 Listing files',
  read_file:            '📄 Reading file',
  write_file:           '💾 Saving file',
  organize_files:       '🗂️ Organising files',
  read_excel_file:      '📊 Reading spreadsheet',
  transcribe_audio:         '🎙️ Transcribing audio',
  transcribe_and_summarize: '🎙️ Transcribing & summarising',
  // Slack tools removed — deferred to future Bolt SDK build
  send_telegram_message:'✈️ Sending Telegram',
  read_telegram_updates:'✈️ Reading Telegram',
  send_whatsapp_message:'📱 Sending WhatsApp',
  read_whatsapp_messages:'📱 Reading WhatsApp',
  get_setup_status:'🔍 Checking setup status',
  save_integration_credentials:'💾 Saving credentials',
};

// ── Wizard card live badge update ────────────────────────────────────────────
// Called when the agent emits a `credential_saved` SSE event.
// Flips the integration's badge from "Not Connected" → "✓ Connected"
// without requiring a page reload or polling.

const INTEGRATION_BADGE_MAP = {
  telegram:        'telegram',
  gmail:           'email',
  outlook:         'email',
  smtp:            'email',
  google_calendar: 'google',
  google_sa:       'google',
  slack:           'slack',
  whatsapp_waha:   'whatsapp',
  whatsapp_twilio: 'whatsapp',
  voice_groq:      'voice-groq',
  voice_openai:    'voice-openai',
  // ai_provider → derived from provider name in the event
};

function markWizardCardConnected(slug, integrationName) {
  // Determine badge element ID
  let badgeId = INTEGRATION_BADGE_MAP[slug] || slug;

  const badge = document.getElementById(`status-${badgeId}`);
  if (badge) {
    badge.className = 'glass-card-badge badge-connected';
    badge.textContent = '✓ Connected';
  }

  // Also update in-memory state so re-renders preserve the connected status
  if (state && state.connStatus) {
    state.connStatus[slug] = true;
    // Map compound keys
    if (slug === 'gmail' || slug === 'outlook' || slug === 'smtp') state.connStatus['email'] = true;
    if (slug === 'whatsapp_waha' || slug === 'whatsapp_twilio')     state.connStatus['whatsapp'] = true;
    if (slug === 'google_calendar' || slug === 'google_sa')         state.connStatus['google'] = true;
  }

  // Show a brief toast so the user notices the update even if they're scrolled
  const name = integrationName || slug;
  toast(`✅ ${name} connected!`, 'success');

  // Re-render the live-mode Setup Status panel so the badge flips immediately
  if (typeof renderSetupStatusPanel === 'function') {
    renderSetupStatusPanel().catch(() => {});
  }
}

function buildToolCard(toolName, status, input) {
  const label = TOOL_LABELS[toolName] || `⚙️ ${toolName.replace(/_/g,' ')}`;
  const dot = status === 'running' ? '🔄' : (status === 'done' ? '✅' : '❌');
  const inputSnippet = input ? JSON.stringify(input).slice(0, 80) + (JSON.stringify(input).length > 80 ? '…' : '') : '';
  return `<div class="tool-card ${status}">
    <span class="tool-dot">${dot}</span>
    <span class="tool-label">${label}</span>
    ${inputSnippet ? `<div class="tool-input">${escHtml(inputSnippet)}</div>` : ''}
  </div>`;
}

// ── Image / File Upload ─────────────────────────────────────────────────────

function openAttachment() {
  document.getElementById('fileUpload').click();
}

function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = ''; // reset so same file can be reselected
  ingestSelectedFile(file);
}

/**
 * Route a File into the right preview lane:
 *  - audio   → voice transcription
 *  - .json / .txt / text/plain / application/json → text-attachment chip
 *  - everything else (images/docs) → image preview path
 */
function ingestSelectedFile(file) {
  const AUDIO_TYPES = /^audio\//;
  const AUDIO_EXTS  = /\.(mp3|mp4|m4a|wav|webm|ogg|flac)$/i;
  if (AUDIO_TYPES.test(file.type) || AUDIO_EXTS.test(file.name)) {
    transcribeAudioFile(file);
    return;
  }

  const isTextFile =
    /\.(json|txt)$/i.test(file.name) ||
    file.type === 'application/json' ||
    file.type === 'text/plain';

  if (isTextFile) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target.result || '');
      chat.pendingTextFile = { name: file.name, content };
      showTextFileChip(file.name, content.length);
    };
    reader.onerror = () => toast('Could not read file', 'error');
    reader.readAsText(file);
    return;
  }

  // Images and other binary docs → existing image-preview/chat flow
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl  = ev.target.result;
    const mimeType = file.type || 'image/jpeg';
    const base64   = dataUrl.replace(/^data:[^;]+;base64,/, '');

    chat.pendingImage = { base64, mimeType, preview: dataUrl };
    showImagePreview(dataUrl, file.name);
  };
  reader.readAsDataURL(file);
}

// ── Text/JSON attachment chip ──────────────────────────────────────────────
function showTextFileChip(name, byteLen) {
  const prev = document.getElementById('textFilePreview');
  if (!prev) return;
  const kb = (byteLen / 1024).toFixed(1);
  prev.style.display = 'block';
  prev.innerHTML =
    '<div class="textfile-chip">' +
    '<span>📎 ' + escHtml(name) + ' (' + kb + ' KB)</span>' +
    '<button onclick="clearTextFilePreview()" title="Remove">✕</button>' +
    '</div>';
}

function clearTextFilePreview() {
  chat.pendingTextFile = null;
  const prev = document.getElementById('textFilePreview');
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
}

function showImagePreview(src, name) {
  const prev = document.getElementById('imagePreview');
  prev.style.display = 'block';
  prev.innerHTML = `<div class="img-preview-inner">
    <img src="${escHtml(src)}" alt="preview">
    <span>${escHtml(name)}</span>
    <button onclick="clearAttachment()" title="Remove">✕</button>
  </div>`;
}

function clearImagePreview() {
  chat.pendingImage = null;
  const prev = document.getElementById('imagePreview');
  if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
}

/** Alias for the ✕ button in the image preview bar */
function clearAttachment() { clearImagePreview(); }

// ── Voice Recording & Transcription ────────────────────────────────────────

const voice = {
  recorder:   null,   // MediaRecorder instance
  chunks:     [],     // audio chunks collected during recording
  mimeType:   '',     // chosen MIME type (webm or ogg or mp4)
  timerID:    null,   // setInterval for the recording timer
  startedAt:  0,      // Date.now() when recording started
  transcript: '',     // last successful transcript
};

/** Toggle recording on/off. */
async function toggleVoiceRecording() {
  if (voice.recorder && voice.recorder.state === 'recording') {
    stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick best supported MIME type
    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    voice.mimeType = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    voice.chunks  = [];
    voice.recorder = new MediaRecorder(stream, voice.mimeType ? { mimeType: voice.mimeType } : {});

    voice.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) voice.chunks.push(e.data);
    };

    voice.recorder.onstop = async () => {
      // Stop all mic tracks so the browser releases the mic
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(voice.chunks, { type: voice.mimeType || 'audio/webm' });
      await transcribeBlob(blob, voice.mimeType || 'audio/webm');
    };

    voice.recorder.start(250); // collect in 250 ms chunks
    voice.startedAt = Date.now();

    // Update UI
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('micBtn').title = 'Recording... click to stop';
    document.getElementById('recTimer').style.display = '';
    updateRecTimer();
    voice.timerID = setInterval(updateRecTimer, 1000);

    // Show voice preview in "recording" state
    showVoicePreview('recording', null);

  } catch (err) {
    showToast('Microphone access denied. Please allow mic access in browser settings.', 'error');
  }
}

function stopVoiceRecording() {
  if (voice.recorder && voice.recorder.state !== 'inactive') {
    voice.recorder.stop();
  }
  clearInterval(voice.timerID);

  // Reset mic button
  const btn = document.getElementById('micBtn');
  btn.classList.remove('recording');
  btn.title = 'Record voice message';
  document.getElementById('recTimer').style.display = 'none';

  // Show transcribing state
  showVoicePreview('transcribing', null);
}

function updateRecTimer() {
  const elapsed = Math.floor((Date.now() - voice.startedAt) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById('recTimer').textContent = `⏺ ${m}:${String(s).padStart(2,'0')}`;
}

/** Transcribe a Blob via the /api/transcribe endpoint. */
async function transcribeBlob(blob, mimeType) {
  try {
    // Convert blob → base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const ext = mimeType.split('/')[1]?.split(';')[0] || 'webm';

    const res  = await fetch('/api/transcribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        audioBase64: base64,
        mimeType,
        filename: `recording.${ext}`,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      showVoicePreview('error', data.error || 'Transcription failed');
      return;
    }

    voice.transcript = data.transcript || '';
    if (!voice.transcript) {
      showVoicePreview('error', 'No speech detected in the recording.');
      return;
    }

    // Fill transcript into input and show action chips
    document.getElementById('guideInput').value = voice.transcript;
    showVoicePreview('ready', voice.transcript);

  } catch (err) {
    showVoicePreview('error', `Network error: ${err}`);
  }
}

/** Handle audio files selected via the file picker (📎 button). */
async function transcribeAudioFile(file) {
  showVoicePreview('transcribing', null);

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  try {
    const res  = await fetch('/api/transcribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        audioBase64: base64,
        mimeType:    file.type || 'audio/mpeg',
        filename:    file.name,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      showVoicePreview('error', data.error || 'Transcription failed');
      return;
    }

    voice.transcript = data.transcript || '';
    if (!voice.transcript) {
      showVoicePreview('error', 'No speech detected in the audio file.');
      return;
    }

    document.getElementById('guideInput').value = voice.transcript;
    showVoicePreview('ready', voice.transcript);

  } catch (err) {
    showVoicePreview('error', `Network error: ${err}`);
  }
}

/**
 * Render the voice preview bar in different states.
 * state: 'recording' | 'transcribing' | 'ready' | 'error'
 */
function showVoicePreview(state, payload) {
  const el = document.getElementById('voicePreview');
  el.style.display = 'block';

  const states = {
    recording:    `<div class="voice-preview-inner">
                    <span class="voice-status">⏺ Recording... speak now</span>
                    <button class="voice-dismiss" onclick="stopVoiceRecording()">⏹ Stop</button>
                  </div>`,
    transcribing: `<div class="voice-preview-inner">
                    <span class="voice-status">🔄 Transcribing audio...</span>
                  </div>`,
    ready:        `<div class="voice-preview-inner">
                    <span class="voice-status">🎙️ Transcribed — send or transform:</span>
                    <button class="voice-action-chip" onclick="sendVoiceAs('raw')"     title="Send the plain transcript">💬 Send as-is</button>
                    <button class="voice-action-chip" onclick="sendVoiceAs('meeting')" title="Format as meeting notes with action items">📋 Meeting Report</button>
                    <button class="voice-action-chip" onclick="sendVoiceAs('summary')" title="Extract key bullet points">📝 Key Points</button>
                    <button class="voice-action-chip" onclick="sendVoiceAs('actions')" title="Pull out all tasks and deadlines">✅ Action Items</button>
                    <button class="voice-action-chip" onclick="sendVoiceAs('call')"    title="Format as call summary">📞 Call Summary</button>
                    <button class="voice-dismiss" onclick="clearVoicePreview()" title="Dismiss">✕</button>
                  </div>`,
    error:        `<div class="voice-preview-inner" style="border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.06)">
                    <span class="voice-status" style="color:#f87171">⚠️ ${escHtml(payload || 'Transcription failed')}</span>
                    <button class="voice-dismiss" onclick="clearVoicePreview()">✕</button>
                  </div>`,
  };

  el.innerHTML = states[state] || '';
}

function clearVoicePreview() {
  const el = document.getElementById('voicePreview');
  el.style.display = 'none';
  el.innerHTML = '';
  voice.transcript = '';
}

/**
 * Send the transcript with an optional transformation prefix.
 * The agent will see the instruction + transcript and produce the report.
 */
function sendVoiceAs(mode) {
  const transcript = voice.transcript || document.getElementById('guideInput').value;
  if (!transcript) return;

  const prefixes = {
    raw:     '',
    meeting: 'Please format the following transcript as structured meeting notes. ' +
             'Include: attendees mentioned, topics discussed, key decisions made, ' +
             'action items (with owners and deadlines if mentioned), and next steps.\n\n📝 Transcript:\n',
    summary: 'Please summarise the following transcript in clear bullet points. ' +
             'Include the main ideas, key takeaways, and any tasks or commitments mentioned.\n\n📝 Transcript:\n',
    actions: 'Please extract all action items, tasks, and commitments from the following transcript. ' +
             'For each item, note the owner and deadline if mentioned. Format as a checklist.\n\n📝 Transcript:\n',
    call:    'Please format the following transcript as a call summary. ' +
             'Include: participants, purpose of the call, topics covered, agreements reached, ' +
             'and follow-up actions required.\n\n📝 Transcript:\n',
  };

  const msg = (prefixes[mode] || '') + transcript;

  // Put in input, clear voice UI, then send
  document.getElementById('guideInput').value = msg;
  clearVoicePreview();
  sendGuideMsg();
}

// ── Clear conversation ──────────────────────────────────────────────────────

async function clearConversation() {
  await fetch(`/api/chat/session/${CHAT_SESSION_ID}`, { method: 'DELETE' });
  // Start a fresh history thread and clear the chat panel
  newConversation();
  guideBotScripted('New conversation started. How can I help you?');
}

// ── Input enable/disable ────────────────────────────────────────────────────

function setInputEnabled(on) {
  const inp  = document.getElementById('guideInput');
  const send = document.querySelector('.btn-send');
  if (inp)  inp.disabled  = !on;
  if (send) send.disabled = !on;
  if (send) send.style.opacity = on ? '1' : '0.4';
}

// ── Textarea auto-grow ─────────────────────────────────────────────────────
function autoGrowGuideInput() {
  const inp = document.getElementById('guideInput');
  if (!inp) return;
  inp.style.height = 'auto';
  const next = Math.min(inp.scrollHeight, 160);
  inp.style.height = next + 'px';
}

// ── Chat input wiring: keybindings, paste, drag-and-drop ──────────────────
// Idempotent — DOMContentLoaded fires once but guard anyway.
let _chatInputWired = false;
function initChatInputBehaviours() {
  if (_chatInputWired) return;
  const inp = document.getElementById('guideInput');
  const col = document.getElementById('guideCol');
  if (!inp || !col) return;
  _chatInputWired = true;

  // Enter sends, Shift+Enter inserts newline
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendGuideMsg();
    }
  });
  inp.addEventListener('input', autoGrowGuideInput);

  // Large-JSON paste → collapse to chip instead of dumping into textarea
  inp.addEventListener('paste', (e) => {
    const pasted = e.clipboardData?.getData('text');
    if (!pasted || pasted.length <= 200) return;
    const trimmed = pasted.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
    try {
      JSON.parse(trimmed);
    } catch {
      return;
    }
    // Looks like real JSON — capture as attached file, prevent textarea dump
    e.preventDefault();
    chat.pendingTextFile = { name: 'pasted.json', content: pasted };
    showTextFileChip('pasted.json', pasted.length);
  });

  // Drag-and-drop overlay on the chat panel
  let dragCounter = 0;
  col.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    dragCounter++;
    col.classList.add('dragging');
  });
  col.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  col.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; col.classList.remove('dragging'); }
  });
  col.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dragCounter = 0;
    col.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    ingestSelectedFile(file);
  });
}

document.addEventListener('DOMContentLoaded', initChatInputBehaviours);

// ── Tips chips ──────────────────────────────────────────────────────────────

function updateTips() {
  const tips = document.getElementById('guideTips');
  const arr  = getDynamicTips(state.step);
  tips.innerHTML = arr.map(t => {
    const safe = t.replace(/'/g, "\\'");
    return `<div class="tip-chip" onclick="document.getElementById('guideInput').value='${safe}';sendGuideMsg()">${t}</div>`;
  }).join('');
}

// ── Utilities ───────────────────────────────────────────────────────────────

function renderMd(t) {
  // HTML-escape a raw string. Quotes too: replies can be steered by text the
  // agent read (an email, a web page), and an unescaped " inside a link would
  // let that text add its own attributes (onfocus=…) to the dashboard page.
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  t = String(t ?? '').replace(/\u0000/g, '');

  // Apply all inline formatting to an already-escaped string. Every piece of
  // generated HTML is parked in a placeholder so later steps never rewrite it.
  const inline = s => {
    const parked = [];
    const park = (html) => { parked.push(html); return `\u0000${parked.length - 1}\u0000`; };
    const link = (url, label) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="md-link">${label} ↗</a>`;
    // A URL ends at whitespace, angle brackets, an escaped quote or a parked
    // piece of HTML (never let a placeholder end up inside an href).
    const URL_CHARS = String.raw`(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<>"'\u0000])`;

    // STEP 0 — `code` stays literal (no links or emphasis inside it)
    s = s.replace(/`([^`]+)`/g, (_m, code) => park(`<code class="md-code">${code}</code>`));

    // STEP 1 — Markdown links [text](url), before auto-linking so an explicit
    // link wins.
    s = s.replace(new RegExp(String.raw`\[([^\]]+)\]\((https?:\/\/${URL_CHARS}+?)\)`, 'g'),
      (_m, text, url) => park(link(url, text)));

    // STEP 2 — Auto-link bare URLs (beta tester, 2026-05-27: URLs the bot
    // mentions must be one tap). Trailing punctuation stays outside the link.
    s = s.replace(new RegExp(String.raw`(https?:\/\/${URL_CHARS}+?)([.,;:!?)\]]*)(?=\s|$|&quot;|&#39;|&lt;|&gt;)`, 'g'),
      (_m, url, trailing) => park(link(url, url)) + trailing);

    // STEP 3 — bold, italic
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
         .replace(/\*(.*?)\*/g,     '<em>$1</em>');

    // STEP 4 — put the parked HTML back (nested placeholders included)
    for (let i = 0; i < 3 && s.includes('\u0000'); i++) {
      s = s.replace(/\u0000(\d+)\u0000/g, (_m, i2) => parked[Number(i2)] ?? '');
    }
    return s;
  };

  // Process line by line so lists render properly
  const lines = t.split('\n');
  const out   = [];
  let listTag = null; // 'ul' | 'ol' | null — tracks an open list block

  const closeList = () => { if (listTag) { out.push(`</${listTag}>`); listTag = null; } };

  for (const raw of lines) {
    const line = esc(raw);

    // ── Block-level: bullet list  (- item  or  * item) ──────────────────────
    const ulM = line.match(/^[ \t]*[-*] (.+)/);
    if (ulM) {
      if (listTag !== 'ul') { closeList(); out.push('<ul style="margin:6px 0 6px 4px;padding-left:18px;list-style:disc">'); listTag = 'ul'; }
      out.push(`<li style="margin:3px 0">${inline(ulM[1])}</li>`);
      continue;
    }

    // ── Block-level: numbered list  (1. item) ───────────────────────────────
    const olM = line.match(/^[ \t]*\d+\. (.+)/);
    if (olM) {
      if (listTag !== 'ol') { closeList(); out.push('<ol style="margin:6px 0 6px 4px;padding-left:20px">'); listTag = 'ol'; }
      out.push(`<li style="margin:3px 0">${inline(olM[1])}</li>`);
      continue;
    }

    // ── Any non-list line closes an open list ────────────────────────────────
    closeList();

    // ── Block-level: headings (### → strong, treated as bold label in chat) ─
    const hM = line.match(/^(#{1,3}) (.+)/);
    if (hM) {
      out.push(`<strong style="display:block;margin:8px 0 3px;font-size:${hM[1].length===1?'15px':'13px'}">${inline(hM[2])}</strong>`);
      continue;
    }

    // ── Normal text or blank line ────────────────────────────────────────────
    out.push(line.trim() ? inline(line) + '<br>' : '<br>');
  }

  closeList();
  return out.join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

// ============================================================
// Start
// ============================================================

// ============================================================
// Memory Panel
// ============================================================
const MEMORY_TYPE_COLORS = {
  contact: '#10b981', process: '#f59e0b', preference: '#8b5cf6',
  feedback: '#ef4444', learned_skill: '#06b6d4', pattern: '#6366f1',
};

let memoryPanelOpen = false;
let memorySavedStep = 1;

async function toggleMemoryPanel() {
  if (isLiveMode()) return openPage(_currentPage === 'memory' ? 'chat' : 'memory');
  memoryPanelOpen = !memoryPanelOpen;
  if (memoryPanelOpen) {
    memorySavedStep = state.currentStep;
    // Hide all step views, show memory panel
    document.querySelectorAll('.step-view').forEach(el => el.style.display = 'none');
    const panel = document.getElementById('memory-panel');
    panel.style.display = 'block';
    await loadMemoryPanel();
  } else {
    document.getElementById('memory-panel').style.display = 'none';
    showStep(memorySavedStep);
  }
}

// ============================================================
// System Health Panel — live view of budget + provider failover + agent uptime
// ============================================================
// All three endpoints already exist server-side (built during the audit pass).
// This panel just makes that data visible to non-technical users so they can
// see at a glance whether their agent is healthy, what they've spent today,
// and which providers are in cooldown.

let _healthPanelOpen = false;
let _healthSavedStep = 1;
let _healthRefreshTimer = null;
// Tracks where the user CAME FROM when opening the Health panel, so back/close
// returns them to that exact context. The earlier bug: we reused _inSettingsMode
// which mixed signals from the Settings flow with the Health flow → back went
// to a wizard step the user never visited → blank screen.
let _healthOpenedFromLiveMode = false;

// ═══════════════════════════════════════════════════════════════════════════
// M3 — Setup wizard panel
// Per-integration cards with Configure/Test/Reconnect/Disconnect. Test runs
// the M2 self-healing pipeline via SSE and shows step-by-step progress.
// ═══════════════════════════════════════════════════════════════════════════
const SETUP_INTEGRATIONS = [
  { id: 'gmail',           name: 'Gmail',           icon: 'gmail',
    fields: [{ key: 'serviceAccountKey', label: 'Service account JSON key', kind: 'json',
      hint: 'Paste the full JSON from Google Cloud → IAM → Service Accounts → Keys' }] },
  { id: 'google_calendar', name: 'Google Calendar', icon: 'calendar',
    fields: [{ key: 'serviceAccountKey', label: 'Service account JSON key', kind: 'json',
      hint: 'Same key shape as Gmail — Domain-Wide Delegation must be enabled' }] },
  { id: 'telegram',        name: 'Telegram',        icon: 'telegram',
    fields: [{ key: 'botToken', label: 'Bot token', kind: 'text',
      hint: 'From @BotFather — looks like 1234567890:ABCdef…' }] },
  { id: 'whatsapp',        name: 'WhatsApp',        icon: 'whatsapp',
    fields: [{ key: 'provider', label: 'Provider (web | waha | twilio)', kind: 'text',
      hint: 'Most users: "web" (free, scan QR). Self-hosted: "waha". Business: "twilio"' }] },
];

let _setupPanelOpen = false;
let _setupSavedStep = 1;
let _setupOpenedFromLiveMode = false;
let _setupActiveIntegrationId = null;
let _setupModalForm = {};

async function toggleSetupPanel() {
  if (isLiveMode()) return openPage(_currentPage === 'connections' ? 'chat' : 'connections');
  if (!_setupPanelOpen) {
    const liveMode = document.getElementById('mainApp')?.classList.contains('live-mode');
    _setupOpenedFromLiveMode = !!liveMode;
    if (liveMode) document.getElementById('mainApp').classList.remove('live-mode');
    else _setupSavedStep = state.step || 1;
    _setupPanelOpen = true;
    document.querySelectorAll('.step-view').forEach((el) => (el.style.display = 'none'));
    document.getElementById('setup-panel').style.display = 'block';
    await renderSetupPanel();
    return;
  }
  _setupPanelOpen = false;
  document.getElementById('setup-panel').style.display = 'none';
  if (_setupOpenedFromLiveMode) activateLiveMode();
  else showStep(_setupSavedStep || 1);
  _setupOpenedFromLiveMode = false;
}

async function renderSetupPanel() {
  const el = document.getElementById('setupPanelContent');
  if (!el) return;
  // Pull integration snapshot + detailed health in parallel
  const [snapR, healthR] = await Promise.allSettled([
    fetch('/api/integrations/snapshot').then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch('/api/health/detailed').then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);
  const snap = snapR.status === 'fulfilled' ? snapR.value : null;
  const detailed = healthR.status === 'fulfilled' ? healthR.value : null;
  const snapshot = snap?.snapshot || {};
  const detailedById = {};
  for (const row of (detailed?.integrations || [])) detailedById[row.id] = row;

  const cards = SETUP_INTEGRATIONS.map((cfg) => {
    const live = snapshot[cfg.id]?.status?.status;
    const det  = detailedById[cfg.id];
    let badge = 'not_configured';
    if (live === 'connected')   badge = 'connected';
    else if (live === 'failed' || live === 'cooldown') badge = 'error';
    else if (live && live !== 'disabled' && live !== 'unconfigured') badge = 'configured';
    const errLine = det?.lastErrorMessage
      ? `<div style="font-size:11px;color:#ef4444;margin-top:4px">⚠ ${escHtml(det.lastErrorMessage)}</div>`
      : '';
    const successLine = det?.lastSuccessTs
      ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px">Last OK: ${escHtml(new Date(det.lastSuccessTs).toLocaleTimeString())}</div>`
      : '';
    return `
      <div class="setup-card" data-integration="${cfg.id}">
        <div class="setup-card-head">
          <div class="setup-card-icon">${ICONS[cfg.icon] || ''}</div>
          <div class="setup-card-name">${escHtml(cfg.name)}</div>
          <span class="setup-status-badge ${badge}">${badge.replace('_', ' ')}</span>
        </div>
        ${errLine}${successLine}
        <div class="setup-card-actions">
          <button class="btn" onclick="openSetupConfigModal('${cfg.id}')">Configure</button>
          <button class="btn btn-primary" onclick="runSetupPipelineUI('${cfg.id}')">Test</button>
          <button class="btn" onclick="reconnectIntegration('${cfg.id}')">Reconnect</button>
        </div>
        <div class="setup-step-list" id="setup-steps-${cfg.id}" style="display:none"></div>
      </div>
    `;
  }).join('');
  el.innerHTML = `<div class="setup-card-grid">${cards}</div>` + folderAccessCardHTML();
  refreshFolderGrants();
  loadFolderSuggestions();
}

// ─── Folder Access (Phase 1 — opt-in grants outside the workspace) ──────────
// The agent can only see folders the USER grants here. Grant/revoke happens
// only through these local-origin endpoints — the agent has no tool for it.

let _folderGrants = [];

function folderAccessCardHTML() {
  return `
    <div class="setup-card" id="folderAccessCard" style="margin-top:16px">
      <div class="setup-card-head">
        <div class="setup-card-icon" style="font-size:20px">📂</div>
        <div class="setup-card-name">Folder Access</div>
      </div>
      <p style="font-size:12px;color:var(--text-dim);margin:10px 0 12px;line-height:1.5">
        The agent can only see folders you grant. <strong>Deletion is never allowed outside the workspace.</strong>
        Read-only grants allow listing, reading, and searching; read &amp; write also allows creating and renaming files.
      </p>
      <div id="folderGrantList" style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-dim)">Loading…</div>
      </div>
      <div id="folderQuickAdd" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="folderGrantPath" type="text" placeholder="C:\\Users\\you\\Downloads"
               style="flex:1;min-width:220px;padding:8px 10px;background:var(--bg-glass);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
        <select id="folderGrantMode"
                style="padding:8px 10px;background:var(--bg-glass);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
          <option value="read">Read-only</option>
          <option value="readwrite">Read &amp; write</option>
        </select>
        <button class="btn btn-primary" onclick="addFolderGrant()">Grant access</button>
      </div>
      <div id="folderGrantError" style="display:none;font-size:12px;color:#ef4444;margin-top:8px"></div>
    </div>
  `;
}

async function refreshFolderGrants() {
  const list = document.getElementById('folderGrantList');
  if (!list) return;
  try {
    const r = await fetch('/api/folder-grants');
    const data = r.ok ? await r.json() : { grants: [] };
    _folderGrants = data.grants || [];
  } catch { _folderGrants = []; }

  if (_folderGrants.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-dim)">No folders granted yet — the agent only sees its workspace folder.</div>';
    return;
  }
  list.innerHTML = _folderGrants.map((g, i) => {
    const badge = g.mode === 'readwrite'
      ? '<span class="setup-status-badge connected">read &amp; write</span>'
      : '<span class="setup-status-badge configured">read-only</span>';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--bg-glass)">
        <span style="flex:1;font-size:12px;color:var(--text);word-break:break-all">${escHtml(g.path)}</span>
        ${badge}
        <button class="btn" style="min-width:0;padding:4px 10px;font-size:12px" onclick="removeFolderGrant(${i})">Remove</button>
      </div>
    `;
  }).join('');
}

async function loadFolderSuggestions() {
  const box = document.getElementById('folderQuickAdd');
  if (!box) return;
  try {
    const r = await fetch('/api/folder-grants/suggestions');
    if (!r.ok) return;
    const data = await r.json();
    window._folderSuggestions = data.suggestions || [];
    box.innerHTML = window._folderSuggestions.map((s, i) =>
      `<button class="btn" style="min-width:0;padding:5px 12px;font-size:12px" onclick="quickFillFolder(${i})">+ ${escHtml(s.label)}</button>`
    ).join('');
  } catch { /* suggestions are optional */ }
}

function quickFillFolder(i) {
  const s = (window._folderSuggestions || [])[i];
  if (!s) return;
  const input = document.getElementById('folderGrantPath');
  if (input) { input.value = s.path; input.focus(); }
}

async function addFolderGrant() {
  const input = document.getElementById('folderGrantPath');
  const mode  = document.getElementById('folderGrantMode')?.value === 'readwrite' ? 'readwrite' : 'read';
  const errEl = document.getElementById('folderGrantError');
  const path  = (input?.value || '').trim();
  if (errEl) errEl.style.display = 'none';
  if (!path) { showToast('Enter a folder path first.', 'warn'); return; }
  try {
    const r = await fetch('/api/folder-grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, mode }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (errEl) { errEl.textContent = data.error || 'Could not grant access to that folder.'; errEl.style.display = 'block'; }
      return;
    }
    if (input) input.value = '';
    showToast('Folder access granted ✓', 'success');
    refreshFolderGrants();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Request failed: ' + e; errEl.style.display = 'block'; }
  }
}

async function removeFolderGrant(i) {
  const g = _folderGrants[i];
  if (!g) return;
  try {
    await fetch('/api/folder-grants', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: g.path }),
    });
    showToast('Folder access removed', 'success');
  } catch { /* refresh shows truth either way */ }
  refreshFolderGrants();
}

function openSetupConfigModal(integrationId) {
  const cfg = SETUP_INTEGRATIONS.find((c) => c.id === integrationId);
  if (!cfg) return;
  _setupActiveIntegrationId = integrationId;
  _setupModalForm = {};
  document.getElementById('setupModalTitle').textContent = 'Configure ' + cfg.name;
  const body = document.getElementById('setupModalBody');
  body.innerHTML = cfg.fields.map((f) => {
    const id = 'setup-field-' + f.key;
    if (f.kind === 'json') {
      return `
        <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">${escHtml(f.label)}</label>
        <textarea id="${id}" placeholder="Paste JSON here…" oninput="setupAutoGrow(this); _setupModalForm['${f.key}']=this.value"></textarea>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escHtml(f.hint || '')}</div>
        <div class="setup-modal-drop" id="${id}-drop"
             ondragover="event.preventDefault();this.classList.add('dragover')"
             ondragleave="this.classList.remove('dragover')"
             ondrop="setupHandleDrop(event,'${f.key}')">
          📎 Drag a .json or .txt file here, or click to pick
          <input type="file" accept=".json,.txt,application/json,text/plain" style="display:none"
                 onchange="setupHandleFilePick(event,'${f.key}')">
        </div>
      `;
    }
    return `
      <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px;margin-top:10px">${escHtml(f.label)}</label>
      <input id="${id}" type="text" oninput="_setupModalForm['${f.key}']=this.value"
             style="width:100%;padding:8px 10px;background:var(--bg-glass);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escHtml(f.hint || '')}</div>
    `;
  }).join('');
  // Wire up drop-zone click → file picker
  cfg.fields.forEach((f) => {
    if (f.kind === 'json') {
      const drop = document.getElementById('setup-field-' + f.key + '-drop');
      if (drop) drop.addEventListener('click', () => drop.querySelector('input[type=file]')?.click());
    }
  });
  document.getElementById('setupConfigModal').style.display = 'flex';
}

function closeSetupConfigModal() {
  document.getElementById('setupConfigModal').style.display = 'none';
  _setupActiveIntegrationId = null;
  _setupModalForm = {};
}

function setupAutoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 400) + 'px';
}

// Rule 61: split .json/.txt files from images before routing
function setupHandleDrop(event, key) {
  event.preventDefault();
  const drop = event.currentTarget;
  drop.classList.remove('dragover');
  const files = Array.from(event.dataTransfer?.files || []);
  for (const file of files) {
    const isTextLike = file.type === 'application/json' || file.type === 'text/plain'
                    || /\.(json|txt)$/i.test(file.name);
    if (!isTextLike) {
      showToast('Only .json or .txt files are accepted here.', 'warn');
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const ta = document.getElementById('setup-field-' + key);
      if (ta) { ta.value = value; setupAutoGrow(ta); }
      _setupModalForm[key] = value;
    };
    reader.readAsText(file);
  }
}

function setupHandleFilePick(event, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  // Reuse drop handler logic by faking a dataTransfer payload
  setupHandleDrop({ preventDefault: () => {}, currentTarget: event.target.closest('.setup-modal-drop'), dataTransfer: { files: [file] } }, key);
}

async function runSetupPipelineFromModal() {
  if (!_setupActiveIntegrationId) return;
  const id = _setupActiveIntegrationId;
  const input = { ..._setupModalForm };
  closeSetupConfigModal();
  await runSetupPipelineUI(id, input);
}

async function runSetupPipelineUI(integrationId, input) {
  const stepsEl = document.getElementById('setup-steps-' + integrationId);
  if (stepsEl) {
    stepsEl.style.display = 'block';
    stepsEl.innerHTML = '<div style="color:var(--text-dim)">Starting pipeline…</div>';
  }
  const stepState = {};  // step name → { status, ms }
  const renderSteps = () => {
    if (!stepsEl) return;
    stepsEl.innerHTML = Object.entries(stepState).map(([name, s]) => {
      const icon = s.status === 'running' ? '⟳' : s.status === 'ok' ? '✓' : '✗';
      const ms = s.ms != null ? ` <span style="color:var(--text-muted)">(${s.ms}ms)</span>` : '';
      return `<div class="setup-step-line"><span class="${s.status}">${icon} ${escHtml(name)}</span>${ms}</div>`;
    }).join('');
  };

  try {
    const res = await fetch('/api/setup/pipeline/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: integrationId, input: input || {} }),
    });
    if (!res.ok || !res.body) {
      if (stepsEl) stepsEl.innerHTML = `<div style="color:#ef4444">⚠️ HTTP ${res.status}</div>`;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE framing: events separated by \n\n
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
        const dataLine  = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!eventLine || !dataLine) continue;
        const evt = eventLine.slice(6).trim();
        let payload = {};
        try { payload = JSON.parse(dataLine.slice(5).trim()); } catch {}
        if (evt === 'step') {
          stepState[payload.step] = { status: payload.status, ms: payload.ms };
          renderSteps();
        } else if (evt === 'done') {
          renderSteps();
          if (stepsEl) {
            const tail = payload.success
              ? `<div style="color:#10b981;margin-top:6px">✅ Pipeline succeeded (${payload.totalMs}ms)</div>`
              : `<div style="color:#ef4444;margin-top:6px">❌ Pipeline failed at step "${escHtml(payload.stepReached || '?')}"<br>${escHtml(payload.error || '')}${payload.suggestedFix ? '<br><em style="color:var(--text-dim)">' + escHtml(payload.suggestedFix) + '</em>' : ''}</div>`;
            stepsEl.innerHTML += tail;
          }
          // Refresh badges after pipeline completes
          renderSetupPanel().catch(() => {});
        } else if (evt === 'error') {
          if (stepsEl) stepsEl.innerHTML += `<div style="color:#ef4444">⚠️ ${escHtml(payload.error || 'error')}</div>`;
        }
      }
    }
  } catch (err) {
    if (stepsEl) stepsEl.innerHTML = `<div style="color:#ef4444">⚠️ ${escHtml(String(err))}</div>`;
  }
}

async function reconnectIntegration(integrationId) {
  try {
    const r = await fetch('/api/integrations/' + encodeURIComponent(integrationId) + '/reset', { method: 'POST' });
    const data = await r.json();
    showToast(data.ok ? ('✓ ' + (data.message || 'Reconnected')) : ('⚠ ' + (data.message || 'Reset failed')),
              data.ok ? 'ok' : 'warn');
    renderSetupPanel().catch(() => {});
  } catch (e) {
    showToast('Reconnect failed: ' + e, 'warn');
  }
}

async function toggleHealthPanel() {
  if (isLiveMode()) return openPage(_currentPage === 'health' ? 'chat' : 'health');
  // Opening flow ----------------------------------------------------------
  if (!_healthPanelOpen) {
    const liveMode = document.getElementById('mainApp')?.classList.contains('live-mode');
    _healthOpenedFromLiveMode = !!liveMode;
    if (liveMode) {
      // Take the user out of live mode so the wizard column can show the panel.
      // Crucially, do NOT set _inSettingsMode — that's a separate flag for the
      // Settings wizard flow.
      document.getElementById('mainApp').classList.remove('live-mode');
    } else {
      _healthSavedStep = state.step || 1;
    }
    _healthPanelOpen = true;
    document.querySelectorAll('.step-view').forEach((el) => (el.style.display = 'none'));
    const panel = document.getElementById('health-panel');
    panel.style.display = 'block';
    await loadHealthPanel();
    if (_healthRefreshTimer) clearInterval(_healthRefreshTimer);
    _healthRefreshTimer = setInterval(loadHealthPanel, 15000);
    return;
  }

  // Closing flow ----------------------------------------------------------
  _healthPanelOpen = false;
  document.getElementById('health-panel').style.display = 'none';
  if (_healthRefreshTimer) { clearInterval(_healthRefreshTimer); _healthRefreshTimer = null; }

  if (_healthOpenedFromLiveMode) {
    // User clicked Health from the live dashboard → return them to live mode
    activateLiveMode();
  } else {
    // User clicked Health from inside the wizard → return to that step
    showStep(_healthSavedStep || 1);
  }
  _healthOpenedFromLiveMode = false;
}

async function loadHealthPanel() {
  const el = document.getElementById('healthPanelContent');
  if (!el) return;
  // Parallel fetch all three endpoints. Failures are individually handled so
  // a single broken endpoint doesn't blank the entire page.
  const [budgetR, healthR, statusR] = await Promise.allSettled([
    fetch('/api/budget-status').then((r) => r.json()).catch(() => null),
    fetch('/api/provider-health').then((r) => r.json()).catch(() => null),
    fetch('/api/agent/status').then((r) => r.json()).catch(() => null),
  ]);
  const budget = budgetR.status === 'fulfilled' ? budgetR.value : null;
  const health = healthR.status === 'fulfilled' ? healthR.value : null;
  const agent  = statusR.status === 'fulfilled' ? statusR.value : null;

  el.innerHTML = renderHealthPanel({ budget, health, agent });
}

function renderHealthPanel({ budget, health, agent }) {
  // ── Stat cards ────────────────────────────────────────────────────────
  const statCards = [];

  // 1. Agent uptime
  if (agent) {
    if (agent.running) {
      const uptime = formatUptime(agent.uptimeMs || agent.uptime || 0);
      statCards.push(`
        <div class="health-stat-card good">
          <div class="label">Agent Status</div>
          <div class="value">🟢 Live</div>
          <div class="sub">${escHtml(uptime)} uptime</div>
        </div>
      `);
    } else {
      statCards.push(`
        <div class="health-stat-card bad">
          <div class="label">Agent Status</div>
          <div class="value">⚠️ Stopped</div>
          <div class="sub"><button class="btn btn-primary" style="font-size:11px;padding:4px 10px;margin-top:6px" onclick="retryLaunch()">Restart</button></div>
        </div>
      `);
    }
  }

  // 2. Today's spend (only meaningful when on Vouza fallback key)
  if (budget) {
    const pct = budget.pctUsed || 0;
    const tone = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'good';
    const barClass = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : '';
    statCards.push(`
      <div class="health-stat-card ${tone}">
        <div class="label">Today's Spend (Vouza Key)</div>
        <div class="value">$${(budget.spentUsd || 0).toFixed(2)}</div>
        <div class="sub">of $${(budget.capUsd || 10).toFixed(2)} daily cap · ${pct}% used</div>
        <div class="health-bar">
          <div class="health-bar-fill ${barClass}" style="width:${Math.min(pct,100)}%"></div>
        </div>
      </div>
    `);
  }

  // 3. Provider health summary
  if (health) {
    const providers = Object.keys(health);
    const openCount = providers.filter((p) => health[p].circuitOpen).length;
    if (providers.length === 0) {
      statCards.push(`
        <div class="health-stat-card good">
          <div class="label">Provider Failover</div>
          <div class="value">✓ All clear</div>
          <div class="sub">No provider failures recorded</div>
        </div>
      `);
    } else {
      const tone = openCount > 0 ? 'warn' : 'good';
      statCards.push(`
        <div class="health-stat-card ${tone}">
          <div class="label">Provider Failover</div>
          <div class="value">${openCount === 0 ? '✓ Healthy' : `⚠️ ${openCount} in cooldown`}</div>
          <div class="sub">${providers.length} provider${providers.length === 1 ? '' : 's'} tracked</div>
        </div>
      `);
    }
  }

  // ── Per-provider detail rows ──────────────────────────────────────────
  let providerRows = '';
  if (health && Object.keys(health).length > 0) {
    providerRows = `
      <div class="health-section">
        <h3>🤖 Per-provider failure status</h3>
        ${Object.entries(health).map(([provider, info]) => {
          const isOpen = info.circuitOpen;
          const tone = isOpen ? 'bad' : (info.failuresInWindow > 0 ? 'warn' : 'healthy');
          const cooldownMin = Math.ceil((info.cooldownRemaining || 0) / 60000);
          const status = isOpen
            ? `Circuit OPEN — auto-retries in ${cooldownMin} min`
            : (info.failuresInWindow > 0 ? `${info.failuresInWindow} recent failure${info.failuresInWindow === 1 ? '' : 's'}` : 'Healthy');
          return `
            <div class="provider-health-row ${tone}">
              <span class="status-dot"></span>
              <span class="pname">${escHtml(provider)}</span>
              <span class="pmeta">${escHtml(status)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ── Spend per provider breakdown ──────────────────────────────────────
  let spendRows = '';
  if (budget && budget.byProvider && Object.keys(budget.byProvider).length > 0) {
    spendRows = `
      <div class="health-section">
        <h3>💵 Spend by provider (today)</h3>
        ${Object.entries(budget.byProvider).map(([p, usd]) => `
          <div class="provider-health-row healthy">
            <span class="status-dot"></span>
            <span class="pname">${escHtml(p)}</span>
            <span class="pmeta">$${Number(usd).toFixed(4)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Hints + log file pointer ──────────────────────────────────────────
  const hints = `
    <div class="health-section">
      <h3>💡 Operations tips</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.65;padding:0 4px">
        • Structured logs: <code style="background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px">data/logs/admin-agent.log</code> (JSON lines, grep-friendly)<br>
        • Chat history audit: <code style="background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px">data/chat-history/&lt;sessionId&gt;.jsonl</code><br>
        • Shell command audit: <code style="background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px">data/shell-audit.log</code><br>
        • Spend tracker is only enforced when running on Vouza's fallback API key. If you've configured your own key, this dashboard shows $0 — your platform's billing applies instead.<br>
        • Provider failover auto-recovers after 5 minutes. If a circuit stays open, check your API key + account credit at that provider.
      </div>
    </div>
  `;

  // ── Backup / migration actions ────────────────────────────────────────
  const backup = `
    <div class="health-section">
      <h3>💾 Backup &amp; migration</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;padding:0 4px;margin-bottom:8px">
        Save a full snapshot of your agent — config, credentials, memories, and recent conversation list — as a single JSON file. Useful for migrating to a new machine or as a personal backup.
      </div>
      <div style="font-size:12px;color:#f59e0b;line-height:1.5;padding:8px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:10px">
        🔒 The backup includes your keys and passwords, so it is locked with a password you choose. Without that password it can't be restored — keep it somewhere safe.
      </div>
      <div class="health-action-row">
        <button class="health-action-btn primary" onclick="downloadBackup()" aria-label="Download full configuration backup">📥 Download backup</button>
        <button class="health-action-btn" onclick="triggerRestorePicker()" aria-label="Restore from a previously-downloaded backup file">♻️ Restore from backup…</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:8px;opacity:0.7">
        Restore is non-destructive — your current config is auto-saved as <code>data/config.json.before-restore-*.bak</code> in case you need to roll back manually.
      </div>
    </div>

    <div class="health-section">
      <h3>🆘 Report an issue</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;padding:0 4px;margin-bottom:8px">
        Something not working? Download a diagnostic bundle and send it to support. We'll know exactly what your agent's state was when the issue happened.
      </div>
      <div style="font-size:12px;color:#10b981;line-height:1.5;padding:8px 12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;margin-bottom:10px">
        ✅ All credentials are <strong>masked</strong> in the diagnostic bundle. Safe to share.
      </div>
      <div class="health-action-row">
        <button class="health-action-btn primary" onclick="downloadDiagnostic()" aria-label="Download diagnostic bundle for support">🆘 Download diagnostic bundle</button>
        <a class="health-action-btn" href="https://github.com/geechun80/vouza-admin-agent/issues/new" target="_blank" rel="noopener" aria-label="Open GitHub issue tracker in a new tab">📝 Open issue tracker →</a>
      </div>
    </div>
  `;

  // ── Live Connection Diagnostics block (placeholder — populated async) ──
  const diagnostics = `
    <div class="health-section">
      <h3>🔧 Connection Diagnostics</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;padding:0 4px;margin-bottom:8px">
        Runs a live API call against every configured integration and shows
        the exact result + which key was used. Use this when something looks
        connected in the UI but the bot isn't actually replying.
      </div>
      <div class="health-action-row">
        <button class="health-action-btn primary" onclick="runConnectionTest()" aria-label="Run live connection test">🔬 Run live test now</button>
      </div>
      <div id="connectionTestResults" style="margin-top:14px"></div>
    </div>

    <div class="health-section">
      <h3>📜 Live log tail (last 50 entries)</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;padding:0 4px;margin-bottom:8px">
        Latest entries from <code style="background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px">data/logs/admin-agent.log</code>. Refreshes when you click below.
      </div>
      <div class="health-action-row">
        <button class="health-action-btn" onclick="refreshLogTail()" aria-label="Refresh live log tail">🔄 Refresh logs</button>
      </div>
      <div id="logTailContainer" style="margin-top:14px"></div>
    </div>
  `;

  // ── M3 detailed-health placeholder — populated async by loadDetailedHealth
  const detailedHealthSection = `
    <div class="health-section">
      <h3>🔌 Per-integration health (last 1h)</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;padding:0 4px;margin-bottom:8px">
        Latency percentiles, retry counts, and last error per integration. Sourced from the rolling 1000-event window.
      </div>
      <div id="detailedIntegrationTable">
        <div style="color:var(--text-dim);font-size:12px;padding:6px 4px">Loading…</div>
      </div>
    </div>
    <div class="health-section">
      <h3>📥 Recent webhooks (last 24h, capped at 50)</h3>
      <div id="detailedWebhookLog">
        <div style="color:var(--text-dim);font-size:12px;padding:6px 4px">Loading…</div>
      </div>
    </div>
    <div class="health-section">
      <h3>❌ Recent failed actions (last 24h, capped at 20)</h3>
      <div id="detailedFailuresLog">
        <div style="color:var(--text-dim);font-size:12px;padding:6px 4px">Loading…</div>
      </div>
    </div>
  `;

  // ── Privacy & network — what leaves this computer, and why ────────────
  const privacySection = `
    <div class="health-section">
      <h3>🔒 Privacy &amp; network</h3>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.6;padding:0 4px;margin-bottom:10px">
        Your files and memories stay on this computer. The agent only contacts the services you connected
        (your AI model, email, WhatsApp/Telegram). It goes online to search or open websites <strong>only when you ask</strong>
        — otherwise it asks you first. Every outside connection is listed below.
      </div>
      <div id="privacySettings"><div style="color:var(--text-dim);font-size:12px;padding:6px 4px">Loading…</div></div>
      <div id="networkActivity" style="margin-top:12px"><div style="color:var(--text-dim);font-size:12px;padding:6px 4px">Loading…</div></div>
    </div>
  `;

  // Kick off the async fetch — the placeholders above hydrate when it returns.
  setTimeout(loadDetailedHealth, 0);
  setTimeout(loadPrivacyAndNetwork, 0);

  return `
    <div class="health-grid">${statCards.join('')}</div>
    ${privacySection}
    ${providerRows}
    ${spendRows}
    ${detailedHealthSection}
    ${diagnostics}
    ${hints}
    ${backup}
  `;
}

const NET_CATEGORY_ICON = {
  'AI model': '🤖', 'Email': '✉️', 'Google account': '📅', 'Microsoft account': '📅',
  'Messaging': '💬', 'Web search': '🔎', 'Website': '🌐', 'This computer': '💻', 'Other': '❔',
};

function timeAgo(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

async function loadPrivacyAndNetwork() {
  const [settings, net] = await Promise.all([
    fetch('/api/privacy-settings').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/network-activity').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const setEl = document.getElementById('privacySettings');
  if (setEl && settings) {
    setEl.innerHTML = `
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5;padding:8px 4px;cursor:pointer">
        <input type="checkbox" id="learnToggle" ${settings.learnFromConversations ? 'checked' : ''}
               onchange="setLearnFromConversations(this.checked)" style="margin-top:3px">
        <span><strong>Learn from conversations</strong><br>
          <span style="color:var(--text-dim)">After a chat, the agent asks the AI to reflect and save reusable skills.
          This sends the conversation to your AI model again. Turn off to keep that from happening.</span></span>
      </label>
      <div style="font-size:12px;color:var(--text-dim);padding:2px 4px">
        ${settings.aiRunsLocally
          ? '💻 Your AI runs on this computer (local AI) — conversations are not sent to an AI company.'
          : '☁️ Your AI runs in the cloud — each message you send goes to your AI provider to be answered.'}
        · Connection health checks every ${escHtml(String(settings.healthCheckMinutes))} min.
      </div>
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5;padding:8px 4px;cursor:pointer">
        <input type="checkbox" id="autoUpdateToggle" ${settings.autoUpdateCheck ? 'checked' : ''}
               onchange="setAutoUpdateCheck(this.checked)" style="margin-top:3px">
        <span><strong>Tell me when a new version is out</strong><br>
          <span style="color:var(--text-dim)">Once a day the dashboard asks GitHub for the latest version number (nothing about you is sent) and shows a banner if you should update.</span></span>
      </label>`;
  }

  const netEl = document.getElementById('networkActivity');
  if (!netEl) return;
  if (!net) { netEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px">Network log unavailable.</div>'; return; }
  if (!net.hosts.length) {
    netEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:6px 4px">No outside connections since the dashboard started.</div>';
    return;
  }
  const rows = net.hosts.map((h) => `
    <div class="provider-health-row healthy" title="Last reason: ${escHtml(h.lastTrigger)}">
      <span>${NET_CATEGORY_ICON[h.category] || '❔'}</span>
      <span class="pname">${escHtml(h.host)}</span>
      <span class="pmeta">${escHtml(h.category)} · ${h.count}× · ${escHtml(timeAgo(h.lastAt))} · ${escHtml(h.lastTrigger)}</span>
    </div>`).join('');
  const recent = net.recent.slice(0, 25).map((e) => `
    <div style="font-size:12px;padding:3px 4px;color:var(--text-dim)">
      ${escHtml(new Date(e.at).toLocaleTimeString())} — ${NET_CATEGORY_ICON[e.category] || '❔'} ${escHtml(e.host)}
      (${escHtml(e.what)}) · <em>${escHtml(e.trigger)}</em>${e.ok === false ? ' · ⚠️ failed' : ''}
    </div>`).join('');
  netEl.innerHTML = `
    <div style="font-size:12px;font-weight:600;padding:4px">Services contacted since ${escHtml(new Date(net.since).toLocaleString())}</div>
    ${rows}
    <details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;padding:4px">Latest 25 connections</summary>${recent}</details>`;
}

async function setAutoUpdateCheck(on) {
  try {
    const d = await fetch('/api/privacy-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoUpdateCheck: !!on }),
    }).then((r) => r.json());
    if (!d.success) throw new Error(d.error || 'Could not save');
    toast(on ? 'You will be told when a new version is out' : 'Automatic update check is off');
  } catch (err) {
    toast('Could not save: ' + escHtml(err.message), 'error');
    const box = document.getElementById('autoUpdateToggle');
    if (box) box.checked = !on;
  }
}

async function setLearnFromConversations(on) {
  try {
    const r = await fetch('/api/privacy-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learnFromConversations: !!on }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Could not save');
    toast(on ? 'Learning from conversations is on' : 'Learning from conversations is off');
  } catch (err) {
    toast('Could not save: ' + err.message, 'error');
    const box = document.getElementById('learnToggle');
    if (box) box.checked = !on;
  }
}

async function loadDetailedHealth() {
  let data = null;
  try {
    const r = await fetch('/api/health/detailed');
    if (r.ok) data = await r.json();
  } catch { /* fallthrough */ }

  const tableEl = document.getElementById('detailedIntegrationTable');
  if (tableEl) {
    const rows = (data?.integrations || []);
    if (!rows.length) {
      tableEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:6px 4px">No integration activity recorded yet.</div>';
    } else {
      tableEl.innerHTML = `
        <div style="overflow-x:auto">
          <table class="detailed-health-table">
            <thead><tr>
              <th>Integration</th><th>Status</th><th>Last OK</th><th>p50</th><th>p95</th>
              <th>Calls 1h</th><th>Retries 24h</th><th>Last error</th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => {
                const lastOk = r.lastSuccessTs ? new Date(r.lastSuccessTs).toLocaleTimeString() : '—';
                const err = r.lastErrorMessage
                  ? `<span style="color:#ef4444" title="${escHtml(r.lastErrorMessage)}">${escHtml(String(r.lastErrorMessage).slice(0, 60))}${r.lastErrorMessage.length > 60 ? '…' : ''}</span>`
                  : '<span style="color:var(--text-muted)">—</span>';
                return `<tr>
                  <td><strong>${escHtml(r.displayName)}</strong></td>
                  <td>${escHtml(r.status?.status || 'unknown')}</td>
                  <td>${escHtml(lastOk)}</td>
                  <td>${r.p50LatencyMs}ms</td>
                  <td>${r.p95LatencyMs}ms</td>
                  <td>${r.callCount1h}</td>
                  <td>${r.retryCount24h}</td>
                  <td>${err}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  const whEl = document.getElementById('detailedWebhookLog');
  if (whEl) {
    const log = data?.webhookLog || [];
    if (!log.length) {
      whEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:6px 4px">No webhook activity recorded.</div>';
    } else {
      whEl.innerHTML = `
        <div style="overflow-x:auto">
          <table class="detailed-health-table">
            <thead><tr><th>Time</th><th>Integration</th><th>Source</th><th>Verified</th><th>Result</th></tr></thead>
            <tbody>
              ${log.map((w) => `
                <tr>
                  <td>${escHtml(new Date(w.ts).toLocaleTimeString())}</td>
                  <td>${escHtml(w.integration)}</td>
                  <td>${escHtml(w.source)}</td>
                  <td>${w.verified ? '<span style="color:#10b981">✓ verified</span>' : '<span style="color:#ef4444">✗ rejected</span>'}</td>
                  <td>${w.ok ? '<span style="color:#10b981">ok</span>' : '<span style="color:#ef4444">fail</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  const failEl = document.getElementById('detailedFailuresLog');
  if (failEl) {
    const failures = data?.failures || [];
    if (!failures.length) {
      failEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:6px 4px">No failed actions recorded.</div>';
    } else {
      failEl.innerHTML = `
        <div style="overflow-x:auto">
          <table class="detailed-health-table">
            <thead><tr><th>Time</th><th>Integration</th><th>Source</th><th>Error</th><th></th></tr></thead>
            <tbody>
              ${failures.map((f, i) => `
                <tr>
                  <td>${escHtml(new Date(f.ts).toLocaleTimeString())}</td>
                  <td>${escHtml(f.integration)}</td>
                  <td>${escHtml(f.source)}</td>
                  <td style="color:#ef4444">${escHtml(String(f.error).slice(0, 120))}${f.error.length > 120 ? '…' : ''}</td>
                  <td><button class="btn" style="font-size:11px;padding:3px 8px" onclick="retryFailedAction('${escHtml(f.integration)}', ${i})">Retry</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }
}

async function retryFailedAction(integrationId, _idx) {
  // The "retry" surface re-runs the integration's pipeline test (M2 self-heal)
  // — the same code path used by Setup → Test. That's the closest thing to a
  // structured retry given that the original action payload isn't replayable
  // from the rolled-up event log alone.
  try {
    showToast('Re-running integration pipeline for ' + integrationId + '…', 'ok');
    const res = await fetch('/api/setup/pipeline/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: integrationId, input: {} }),
    });
    // Consume the SSE stream so the server's listeners fire correctly
    if (res.body) { try { await res.body.getReader().read(); } catch {} }
    loadDetailedHealth();
  } catch (e) {
    showToast('Retry failed: ' + e, 'warn');
  }
}

// ── Live connection diagnostics — hits each integration's real endpoint ──
async function runConnectionTest() {
  const out = document.getElementById('connectionTestResults');
  if (!out) return;
  out.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:10px 4px">⏳ Testing all integrations live (up to ~10s)…</div>';
  try {
    const r = await fetch('/api/connection-test');
    if (!r.ok) { out.innerHTML = `<div style="color:#ef4444;padding:10px 4px">⚠️ Test request failed: HTTP ${r.status}</div>`; return; }
    const data = await r.json();

    const summary = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
        <span style="padding:4px 10px;border-radius:10px;background:rgba(16,185,129,0.12);color:#10b981;font-weight:600">${data.summary.passed} passed</span>
        ${data.summary.failed > 0 ? `<span style="padding:4px 10px;border-radius:10px;background:rgba(239,68,68,0.12);color:#ef4444;font-weight:600">${data.summary.failed} failed</span>` : ''}
        ${data.summary.skipped > 0 ? `<span style="padding:4px 10px;border-radius:10px;background:rgba(148,163,184,0.10);color:var(--text-dim);font-weight:600">${data.summary.skipped} skipped</span>` : ''}
        <span style="padding:4px 10px;border-radius:10px;background:rgba(124,58,237,0.12);color:var(--brand-light);font-weight:600">Active AI: ${escHtml(data.activeProvider || 'unknown')}</span>
        <span style="padding:4px 10px;border-radius:10px;background:rgba(124,58,237,0.08);color:var(--text-dim);font-weight:500;font-size:11px">Key source: ${escHtml(data.activeKeySource || 'unknown')}</span>
      </div>
    `;

    const rows = data.results.map((r) => {
      const tone = r.skipped ? 'warn' : (r.ok ? 'healthy' : 'bad');
      const status = r.skipped
        ? '⏭ Skipped'
        : (r.ok ? `✓ Pass (${r.latencyMs}ms)` : '✗ Fail');
      const detail = r.error
        ? `<div style="font-size:11px;color:#ef4444;margin-top:3px;line-height:1.5;word-break:break-word">${escHtml(r.error)}</div>`
        : r.detail
          ? `<div style="font-size:11px;color:var(--text-dim);margin-top:3px">${escHtml(r.detail)}</div>`
          : '';
      const keyInfo = r.keyPreview ? `<div style="font-size:10px;color:var(--text-dim);opacity:0.7;margin-top:2px;font-family:monospace">${escHtml(r.keyPreview)}</div>` : '';
      return `
        <div class="provider-health-row ${tone}" style="align-items:flex-start;padding:12px 14px">
          <span class="status-dot" style="margin-top:5px"></span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;gap:8px"><span class="pname">${escHtml(r.name)}</span><span class="pmeta">${escHtml(status)}</span></div>
            ${detail}
            ${keyInfo}
          </div>
        </div>
      `;
    }).join('');

    out.innerHTML = summary + rows;
  } catch (e) {
    out.innerHTML = `<div style="color:#ef4444;padding:10px 4px">⚠️ ${escHtml(String(e))}</div>`;
  }
}

// ── Live log tail viewer ────────────────────────────────────────────────
async function refreshLogTail() {
  const out = document.getElementById('logTailContainer');
  if (!out) return;
  out.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:6px 4px">Loading…</div>';
  try {
    const r = await fetch('/api/recent-logs?limit=50');
    if (!r.ok) { out.innerHTML = `<div style="color:#ef4444;padding:6px 4px">⚠️ Failed to load logs</div>`; return; }
    const { entries } = await r.json();
    if (!entries?.length) {
      out.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:6px 4px">No log entries yet — the log file will populate as the agent runs.</div>';
      return;
    }
    // Render as compact monospace block, newest at top
    const rows = entries.reverse().map((e) => {
      const level = e.level === 50 ? '🔴' : e.level === 40 ? '🟡' : e.level === 30 ? '🔵' : e.level === 20 ? '⚪' : '·';
      const ts = e.time ? new Date(e.time).toLocaleTimeString() : '';
      const msg = e.msg || e.raw || '';
      const extras = Object.entries(e).filter(([k]) => !['level','time','msg','service','pid','raw','v','hostname'].includes(k));
      const extraStr = extras.length ? ' · ' + extras.map(([k,v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ').slice(0, 200) : '';
      return `<div style="padding:5px 8px;border-bottom:1px solid var(--border);font-size:11px;font-family:'SF Mono','Cascadia Code',Menlo,monospace;line-height:1.55">
        <span style="opacity:0.5">${level} ${ts}</span> ${escHtml(String(msg))}<span style="color:var(--text-dim);opacity:0.7">${escHtml(extraStr)}</span>
      </div>`;
    }).join('');
    out.innerHTML = `<div style="max-height:340px;overflow-y:auto;background:var(--bg-glass-card);border:1px solid var(--border);border-radius:8px">${rows}</div>`;
  } catch (e) {
    out.innerHTML = `<div style="color:#ef4444;padding:6px 4px">⚠️ ${escHtml(String(e))}</div>`;
  }
}

// Programmatically open the hidden file picker — separated so the button's
// onclick handler stays simple.
function triggerRestorePicker() {
  document.getElementById('restoreFilePicker')?.click();
}

/**
 * Read a user-selected backup JSON file, validate it client-side, show a
 * confirmation modal, then POST to /api/import-config. The server runs its
 * own validation + auto-backup before applying — we double-check here so
 * the user never sees a "I clicked restore and weird things happened" path.
 */
async function handleRestoreFile(event) {
  const file = event?.target?.files?.[0];
  // Reset the input so re-selecting the same file fires onchange again
  if (event?.target) event.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toast('Backup file is too large (>10 MB). This doesn\'t look like a Vouza backup.', 'error');
    return;
  }

  let bundle;
  try {
    const text = await file.text();
    bundle = JSON.parse(text);
  } catch (e) {
    toast('Could not parse the file — make sure it\'s the original JSON export.', 'error');
    return;
  }

  // Client-side envelope check matches the server's
  const locked = bundle?.format === 'vouza-admin-agent-backup-locked';
  if (!bundle || (!locked && bundle.format !== 'vouza-admin-agent-backup')) {
    toast('This file isn\'t a Vouza backup (wrong format envelope).', 'error');
    return;
  }

  // Build a confirmation summary so the user knows what they're about to restore
  const summary = locked
    ? `🔒 Locked backup from <strong>${escHtml((bundle.exportedAt || '').slice(0, 10) || 'unknown date')}</strong>`
    : [
      `From: <strong>${escHtml(bundle.agentName || 'Unknown agent')}</strong>`,
      `Date: <strong>${escHtml((bundle.exportedAt || '').slice(0, 10) || 'unknown')}</strong>`,
      `Memories: <strong>${(bundle.memories || []).length}</strong>`,
      `Conversations summary: <strong>${(bundle.conversations || []).length}</strong>`,
    ].join('<br>');

  let password = '';
  let error = '';
  for (;;) {
    if (locked) {
      password = await backupPasswordDialog({
        title:   '♻️ Restore from backup',
        intro:   'This <strong>replaces your current settings</strong> with the backup. Your current settings are saved to a <code>.bak</code> file first, so you can roll back.',
        summaryHtml: summary,
        okLabel: 'Restore',
        error,
      });
      if (password === null) return;
    } else {
      if (!(await showRestoreConfirm(summary))) return;
    }

    toast('Restoring backup…', 'info');
    try {
      const r = await fetch('/api/import-config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(locked ? { ...bundle, password } : bundle),
      });
      const data = await r.json();
      if (data.wrongPassword) { error = data.error; continue; }   // ask again
      if (!r.ok || !data.ok) {
        toast('Restore failed: ' + escHtml(data.error || r.statusText), 'error');
        return;
      }
      toast(escHtml(data.message || '✅ Restored! Restart the agent to apply.'), 'success');
      // Refresh the Health panel so the user sees the new state
      setTimeout(() => loadHealthPanel(), 800);
    } catch (e) {
      toast('Restore failed: ' + escHtml(String(e)), 'error');
    }
    return;
  }
}

/**
 * Password box for locked backups. Resolves the password, or null on Cancel.
 * confirm: ask twice (choosing a new password). error: shown above the box.
 */
function backupPasswordDialog({ title, intro, summaryHtml = '', confirm = false, okLabel = 'OK', error = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'pw-dialog-backdrop';
    overlay.innerHTML = `
      <form class="pw-dialog" role="dialog" aria-modal="true" aria-labelledby="pwDialogTitle" novalidate>
        <div class="pw-dialog-title" id="pwDialogTitle">${title}</div>
        <p class="page-hint" style="margin:0 0 12px">${intro}</p>
        ${summaryHtml ? `<div class="pw-dialog-summary">${summaryHtml}</div>` : ''}
        <label for="pwDialogPw">${confirm ? 'Choose a backup password (8+ characters)' : 'Backup password'}</label>
        <input type="password" id="pwDialogPw" autocomplete="${confirm ? 'new-password' : 'current-password'}" required>
        ${confirm ? `<label for="pwDialogPw2">Type it again</label>
        <input type="password" id="pwDialogPw2" autocomplete="new-password" required>` : ''}
        <div class="page-msg error" data-pw-msg role="alert">${escHtml(error)}</div>
        <div class="pw-dialog-actions">
          <button type="button" class="btn" data-act="cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${okLabel}</button>
        </div>
      </form>`;
    const form = overlay.querySelector('form');
    const msg = overlay.querySelector('[data-pw-msg]');
    const done = (v) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target?.dataset?.act === 'cancel') done(null);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const pw = form.querySelector('#pwDialogPw').value;
      if (confirm) {
        if (pw.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; }
        if (pw !== form.querySelector('#pwDialogPw2').value) { msg.textContent = 'The two passwords don\'t match.'; return; }
      } else if (!pw) { msg.textContent = 'Type the backup password.'; return; }
      done(pw);
    });
    document.body.appendChild(overlay);
    window.addEventListener('keydown', onKey);
    form.querySelector('#pwDialogPw').focus();
  });
}

/**
 * Lightweight confirmation modal — Promise-based so the calling code reads
 * top-to-bottom. Resolves true on Restore, false on Cancel or backdrop click.
 */
function showRestoreConfirm(summaryHtml) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Confirm restore"
           style="background:var(--bg);border:1px solid rgba(124,58,237,0.4);border-radius:14px;padding:24px;max-width:480px;width:92vw;box-shadow:0 16px 50px rgba(0,0,0,0.5);color:var(--text)">
        <div style="font-size:24px;margin-bottom:8px">♻️ Restore from backup</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:14px;line-height:1.55">
          This will <strong style="color:#f59e0b">replace your current configuration</strong> with the backup contents. Your current config is auto-saved to a <code>.bak</code> file first so you can roll back if needed.
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px;font-size:13px;line-height:1.7;margin-bottom:18px">
          ${summaryHtml}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="health-action-btn" data-act="cancel" aria-label="Cancel restore">Cancel</button>
          <button class="health-action-btn primary" data-act="ok" aria-label="Confirm restore">Restore</button>
        </div>
      </div>
    `;
    const cleanup = (v) => {
      document.body.removeChild(overlay);
      window.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter')  cleanup(true);
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
      const act = e.target?.getAttribute?.('data-act');
      if (act === 'cancel') cleanup(false);
      if (act === 'ok')     cleanup(true);
    });
    document.body.appendChild(overlay);
    window.addEventListener('keydown', onKey);
  });
}

// ── Diagnostic bundle download (support helper) ─────────────────────────
async function downloadDiagnostic() {
  toast('Generating diagnostic bundle…', 'info');
  try {
    const r = await fetch('/api/diagnostic-bundle');
    if (!r.ok) { toast('Diagnostic generation failed — server returned ' + r.status, 'error'); return; }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vouza-diagnostic-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✅ Diagnostic saved. Attach it to a GitHub issue or email.', 'success');
  } catch (e) {
    toast('Diagnostic failed: ' + String(e), 'error');
  }
}

// ── Light/dark theme toggle ─────────────────────────────────────────────
const THEME_KEY = 'vouza_theme_v1';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.textContent = theme === 'light' ? '☀️' : '🌙';
    btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

// Restore theme on page load before anything else (avoids flash of wrong theme)
(function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') applyTheme(saved);
  } catch {}
})();

// Download a backup. It holds every key and password, so the server locks it
// with a password the person chooses here (scrypt + AES-256-GCM).
async function downloadBackup() {
  const password = await backupPasswordDialog({
    title:   '💾 Download a backup',
    intro:   'Your backup holds your keys and passwords, so it is locked with a password. ' +
             'You will need this password to restore it — write it down somewhere safe. It cannot be recovered.',
    confirm: true,
    okLabel: 'Download',
  });
  if (password === null) return;
  try {
    const r = await fetch('/api/export-config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast('Backup failed: ' + escHtml(d.error || `server returned ${r.status}`), 'error');
      return;
    }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vouza-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✅ Backup downloaded and locked with your password.', 'success');
  } catch (e) {
    toast('Backup failed: ' + String(e), 'error');
  }
}

function formatUptime(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ============================================================
// Friendly error wrapper — fetchSafe
// ============================================================
// Wraps fetch() with consistent error-to-user messaging so we don't surface
// raw HTTP errors. Use for any user-initiated API call. Returns:
//   { ok: true, data }   on success
//   { ok: false, error } on failure (error is a friendly string)

async function fetchSafe(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      // Map common HTTP statuses to actionable messages
      let friendly;
      switch (res.status) {
        case 400: friendly = "Something in your request wasn't valid. Try again or check the inputs."; break;
        case 401: friendly = "You're not authorised for this. If you're using the dashboard remotely, your password may be wrong."; break;
        case 403: friendly = "Access denied. This action isn't allowed from your current session."; break;
        case 404: friendly = "That endpoint doesn't exist. Try refreshing the page in case the dashboard is out of date."; break;
        case 429: friendly = "You're going too fast! Wait a few seconds and try again."; break;
        case 500:
        case 502:
        case 503:
        case 504: friendly = "The server hiccuped. Check that your agent is still running, then try again."; break;
        default:  friendly = `Server returned ${res.status}.`;
      }
      // Try to extract a more specific server-provided message
      try {
        const body = await res.json();
        if (body && body.error) friendly += ` (${String(body.error).slice(0, 120)})`;
      } catch { /* not JSON — that's fine */ }
      return { ok: false, error: friendly, status: res.status };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, data };
  } catch (err) {
    // Network failure / CORS / timeout / fetch aborted
    const msg = String(err && err.message || err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { ok: false, error: "Can't reach the dashboard server. Check it's still running (pm2 list)." };
    }
    return { ok: false, error: msg };
  }
}

// ============================================================
// Conversation search — highlight matching text
// ============================================================
// Improves on the existing filterConvs() by visually highlighting the
// matched substring in each conversation title/preview. Easier for the
// eye to scan when there are many results.

function highlightHits(text, query) {
  if (!query || !text) return escHtml(text || '');
  const safe = escHtml(text);
  // Build a case-insensitive regex from the query — escape regex specials
  const escQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(escQ, 'gi'), (m) => `<mark class="conv-search-hit">${m}</mark>`);
}

// ============================================================
// Live status dots in sidebar header — small green dot when integrations
// are healthy, amber if any channel is disconnected. Click → Health panel.
// ============================================================

let _liveStatusTimer = null;

function startLiveStatusPolling() {
  // Refresh every 30s while in live mode
  if (_liveStatusTimer) clearInterval(_liveStatusTimer);
  refreshLiveStatusDot();
  _liveStatusTimer = setInterval(refreshLiveStatusDot, 30000);
}

async function refreshLiveStatusDot() {
  // Only useful when in live mode
  if (!document.getElementById('mainApp')?.classList.contains('live-mode')) return;
  let tone = 'ok';
  let tooltip = 'All connected services are healthy';
  try {
    const status = await fetch('/api/agent/status').then((r) => r.json()).catch(() => null);
    if (!status?.running) {
      tone = 'bad';
      tooltip = 'Agent is not running — click for details';
    } else {
      const health = await fetch('/api/provider-health').then((r) => r.json()).catch(() => ({}));
      const anyOpen = Object.values(health || {}).some((h) => h.circuitOpen);
      if (anyOpen) { tone = 'warn'; tooltip = 'A provider is in cooldown — failover engaged'; }
    }
  } catch { tone = 'bad'; tooltip = 'Could not reach dashboard server'; }

  const nameEl = document.getElementById('convSidebarAgentName');
  if (nameEl) {
    let dot = nameEl.parentElement?.querySelector('.live-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'live-dot';
      dot.style.cursor = 'pointer';
      dot.title = tooltip;
      dot.onclick = (e) => { e.stopPropagation(); toggleHealthPanel(); };
      nameEl.parentElement?.insertBefore(dot, nameEl);
    }
    dot.className = `live-dot ${tone}`;
    dot.title = tooltip;
  }
}

async function loadMemoryPanel() {
  const el = document.getElementById('memoryPanelContent');
  el.innerHTML = '<div style="color:var(--text-dim);font-size:14px">Loading memories...</div>';
  try {
    const res = await fetch('/api/memories');
    const data = await res.json();
    renderMemoryPanel(data.entries || []);
    const countEl = document.getElementById('memoryCount');
    if (countEl) countEl.textContent = data.total > 0 ? `(${data.total})` : '';
  } catch {
    el.innerHTML = '<div class="memory-empty">Could not load memories. Make sure the agent server is running.</div>';
  }
}

function renderMemoryPanel(entries) {
  const el = document.getElementById('memoryPanelContent');
  if (!entries.length) {
    el.innerHTML = `<div class="memory-empty">
      <div style="font-size:48px;margin-bottom:14px">🧠</div>
      <div style="font-weight:600;margin-bottom:8px;font-size:15px">No memories yet — that's normal!</div>
      <div style="font-size:13px;color:var(--text-dim);max-width:380px;margin:0 auto;line-height:1.6">
        Your agent automatically remembers useful facts as you chat — your name, work hours, frequent contacts, project shorthand. The list will fill up here as you use it.
      </div>
      <div style="margin-top:18px;font-size:12px;color:var(--text-dim);max-width:380px;margin-left:auto;margin-right:auto">
        💡 Want to teach it something explicitly? Try:<br>
        <em style="color:var(--brand-light)">"Remember that my team's standup is every Mon/Wed/Fri at 9 AM."</em>
      </div>
    </div>`;
    return;
  }

  // Group by type
  const groups = {};
  for (const e of entries) {
    if (!groups[e.type]) groups[e.type] = [];
    groups[e.type].push(e);
  }

  const typeLabels = {
    contact:'👤 Contacts', process:'⚙️ Processes', preference:'⭐ Preferences',
    feedback:'💬 Feedback', learned_skill:'🎓 Learned Skills', pattern:'🔁 Patterns'
  };

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-size:13px;color:var(--text-dim)">${entries.length} total memories stored</div>
    <button class="btn" style="font-size:12px;padding:6px 14px" onclick="loadMemoryPanel()">↻ Refresh</button>
  </div>`;

  for (const [type, typeEntries] of Object.entries(groups)) {
    html += `<div class="memory-group-label">${typeLabels[type] || type}</div>`;
    for (const entry of typeEntries) {
      const color = MEMORY_TYPE_COLORS[entry.type] || '#888';
      const age = formatMemoryAge(entry.updatedAt);
      const tags = (entry.tags || []).map(t => `<span class="memory-tag">${t}</span>`).join('');
      html += `<div class="memory-entry">
        <div class="memory-type-dot" style="background:${color}"></div>
        <div class="memory-entry-body">
          <div class="memory-entry-title">${escHtml(entry.title)}</div>
          <div class="memory-entry-content">${escHtml(entry.content)}</div>
          ${tags ? `<div class="memory-entry-tags">${tags}</div>` : ''}
          <div class="memory-entry-meta">${age}</div>
        </div>
        <button class="memory-delete-btn" onclick="deleteMemory('${entry.id}')" title="Forget this">✕</button>
      </div>`;
    }
  }

  el.innerHTML = html;
}

async function deleteMemory(id) {
  if (!confirm('Remove this memory?')) return;
  try {
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    await loadMemoryPanel();
  } catch {
    alert('Could not delete memory.');
  }
}

function formatMemoryAge(ts) {
  const h = (Date.now() - ts) / 3600000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 720) return `${Math.floor(h/24)}d ago`;
  return `${Math.floor(h/720)}mo ago`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Update memory count badge on init
async function updateMemoryCount() {
  try {
    const res = await fetch('/api/memories');
    const data = await res.json();
    const el = document.getElementById('memoryCount');
    if (el && data.total > 0) el.textContent = `(${data.total})`;
  } catch {}
}

// ============================================================
// First-launch onboarding tour
// ============================================================
// Shown exactly ONCE per browser (localStorage flag). Walks new users
// through the key parts of the live dashboard so they don't feel lost.
// Skip button + Next button. Tooltips position themselves automatically
// relative to the highlighted element.

const TOUR_FLAG_KEY = 'vouza_tour_seen_v2'; // v2: new left menu

const TOUR_STEPS = [
  {
    target:  '.guide-pane, #guideInput',
    title:   '💬 Chat with your AI here',
    body:    'Type any request — "check my emails", "schedule a meeting Tuesday", "summarise this PDF". Your AI uses the tools you connected to actually do the work.',
    placement: 'top',
  },
  {
    target:  '.side-nav',
    title:   '🧭 Your menu',
    body:    '<strong>Connections</strong> — email, phone and apps. <strong>AI model</strong> — online AI or a free local AI on this computer. <strong>Memory</strong> — what your AI has learned. <strong>Privacy &amp; health</strong> — what went online and when. <strong>Settings</strong> — updates, backup and full setup.',
    placement: 'right',
  },
  {
    target:  '.conv-list, #convList',
    title:   '📚 Conversation history',
    body:    'Every chat is saved automatically. Click any past conversation to pick up where you left off. Use the search box above to find specific topics.',
    placement: 'right',
  },
  {
    target:  '.conv-sidebar-top',
    title:   '✏️ New conversation anytime',
    body:    'Click <strong>New</strong> to start a fresh thread. Useful when you switch topics or want a clean context for your AI. You can always come back to old threads from the list below.',
    placement: 'right',
  },
];

let _tourIdx = 0;

function startOnboardingTour() {
  if (localStorage.getItem(TOUR_FLAG_KEY)) return; // already seen
  if (!document.getElementById('mainApp')?.classList.contains('live-mode')) return;

  // Build the overlay if it doesn't exist
  let overlay = document.getElementById('tourOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';
    overlay.innerHTML = `
      <div class="tour-highlight" id="tourHighlight"></div>
      <div class="tour-tooltip" id="tourTooltip">
        <div class="tour-step-num" id="tourStepNum"></div>
        <div class="tour-title" id="tourTitle"></div>
        <div class="tour-body" id="tourBody"></div>
        <div class="tour-actions">
          <button class="tour-skip" onclick="endOnboardingTour()">Skip tour</button>
          <button class="tour-next" id="tourNextBtn" onclick="nextTourStep()">Next →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  _tourIdx = 0;
  overlay.classList.add('visible');
  // Slight delay so live mode has fully rendered before we measure positions
  setTimeout(() => renderTourStep(), 400);

  // Re-position on window resize / scroll
  window.addEventListener('resize', renderTourStep);
}

function renderTourStep() {
  const step = TOUR_STEPS[_tourIdx];
  if (!step) { endOnboardingTour(); return; }

  // Find the target element — try multiple selectors if comma-separated
  let target = null;
  for (const sel of step.target.split(',').map((s) => s.trim())) {
    target = document.querySelector(sel);
    if (target) break;
  }

  // If the target isn't on the page (rare), skip this step
  if (!target) { _tourIdx++; renderTourStep(); return; }

  const rect = target.getBoundingClientRect();
  const padding = 8;

  // Position the highlight ring around the target element
  const hl = document.getElementById('tourHighlight');
  hl.style.top    = `${rect.top - padding}px`;
  hl.style.left   = `${rect.left - padding}px`;
  hl.style.width  = `${rect.width + padding * 2}px`;
  hl.style.height = `${rect.height + padding * 2}px`;

  // Position the tooltip — try the requested placement, fall back to viewport edges
  const tt = document.getElementById('tourTooltip');
  document.getElementById('tourStepNum').textContent = `Step ${_tourIdx + 1} of ${TOUR_STEPS.length}`;
  document.getElementById('tourTitle').innerHTML     = step.title;
  document.getElementById('tourBody').innerHTML      = step.body;
  document.getElementById('tourNextBtn').textContent =
    (_tourIdx === TOUR_STEPS.length - 1) ? 'Got it ✓' : 'Next →';

  // Wait for tooltip dimensions to settle, then position it
  requestAnimationFrame(() => {
    const ttRect = tt.getBoundingClientRect();
    const margin = 16;
    let top, left;

    switch (step.placement) {
      case 'right':
        top  = Math.max(margin, rect.top + (rect.height / 2) - (ttRect.height / 2));
        left = rect.right + margin;
        // If it overflows right edge, push it to the left of the target instead
        if (left + ttRect.width > window.innerWidth - margin) {
          left = rect.left - ttRect.width - margin;
        }
        break;
      case 'top':
        top  = rect.top - ttRect.height - margin;
        left = Math.max(margin, rect.left + (rect.width / 2) - (ttRect.width / 2));
        if (top < margin) {
          top = rect.bottom + margin; // flip to bottom if no room above
        }
        break;
      case 'bottom':
      default:
        top  = rect.bottom + margin;
        left = Math.max(margin, rect.left + (rect.width / 2) - (ttRect.width / 2));
        break;
    }
    // Clamp to viewport
    left = Math.min(left, window.innerWidth  - ttRect.width  - margin);
    top  = Math.min(top,  window.innerHeight - ttRect.height - margin);
    tt.style.top  = `${Math.max(margin, top)}px`;
    tt.style.left = `${Math.max(margin, left)}px`;
  });
}

function nextTourStep() {
  _tourIdx++;
  if (_tourIdx >= TOUR_STEPS.length) { endOnboardingTour(); return; }
  renderTourStep();
}

function endOnboardingTour() {
  const overlay = document.getElementById('tourOverlay');
  if (overlay) overlay.classList.remove('visible');
  localStorage.setItem(TOUR_FLAG_KEY, '1');
  window.removeEventListener('resize', renderTourStep);
}

// ============================================================
// Wizard auto-save to localStorage (data-loss prevention)
// ============================================================
// Saves form field values as the user types, so accidental tab closure
// doesn't lose progress. Lives entirely client-side — server only sees
// committed values via the existing /api/config flow.

const DRAFT_KEY = 'vouza_wizard_draft_v1';
let _draftSaveTimer = null;

/**
 * Drafts live in localStorage — plaintext, readable by anything running on
 * this origin and left behind on the machine. So never draft secrets
 * (password-type fields: AI keys, app passwords, bot tokens) and never draft
 * Quick Setup, which verifies and saves server-side as the user goes.
 */
function isDraftableField(el) {
  if (!el || !el.id) return false;
  if (el.id === 'guideInput' || el.id === 'convSearch' || el.id === 'memorySearch') return false;
  if (el.type === 'password') return false;
  if (el.closest && el.closest('#quickSetup')) return false;
  return true;
}

/**
 * Snapshot every text/email/password/textarea field on the page and store
 * to localStorage. Debounced so we don't write on every keystroke.
 */
function scheduleDraftSave() {
  if (_draftSaveTimer) clearTimeout(_draftSaveTimer);
  _draftSaveTimer = setTimeout(() => {
    try {
      const draft = {};
      document.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach((el) => {
        if (!isDraftableField(el)) return;
        if (el.value && el.value.trim().length > 0) draft[el.id] = el.value;
      });
      if (Object.keys(draft).length > 0) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ts: Date.now(), fields: draft }));
      }
    } catch { /* localStorage may be disabled — silent */ }
  }, 1500); // 1.5s after last keystroke
}

/**
 * On page load, check for a draft newer than the saved config. If found,
 * show a banner offering to restore. User can accept (re-fill fields)
 * or discard (delete the draft).
 */
function checkForDraftToRestore() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft.fields || Object.keys(draft.fields).length === 0) return;

    // Scrub secrets that older versions stored (they drafted password fields).
    const safe = Object.fromEntries(Object.entries(draft.fields).filter(([id]) => {
      const el = document.getElementById(id);
      return !el || isDraftableField(el);
    }));
    if (Object.keys(safe).length !== Object.keys(draft.fields).length) {
      draft.fields = safe;
      if (Object.keys(safe).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      else { localStorage.removeItem(DRAFT_KEY); return; }
    }

    // If draft is older than 14 days, discard silently
    if (Date.now() - draft.ts > 14 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }

    // If every drafted field is already filled by saved config, nothing to restore
    const anyEmpty = Object.entries(draft.fields).some(([id]) => {
      const el = document.getElementById(id);
      return el && (!el.value || el.value.trim().length === 0);
    });
    if (!anyEmpty) return;

    // Show the restore banner above Step 1
    const step1 = document.getElementById('step-1');
    if (!step1) return;
    const banner = document.createElement('div');
    banner.className = 'draft-restore-banner';
    const minutes = Math.round((Date.now() - draft.ts) / 60000);
    const timeAgo = minutes < 60 ? `${minutes} min ago` :
                    minutes < 1440 ? `${Math.round(minutes/60)} hr ago` :
                    `${Math.round(minutes/1440)} days ago`;
    banner.innerHTML = `
      <div class="draft-icon">💾</div>
      <div class="draft-text">
        We found <strong>unsaved setup progress</strong> from ${timeAgo}.
        Want to restore it?
      </div>
      <button class="draft-restore-btn" onclick="restoreDraft()">Restore</button>
      <button class="draft-discard-btn" onclick="discardDraft()">Discard</button>
    `;
    step1.insertBefore(banner, step1.firstChild);
  } catch { /* corrupt JSON or localStorage disabled — silent */ }
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
    let restored = 0;
    for (const [id, val] of Object.entries(draft.fields || {})) {
      const el = document.getElementById(id);
      if (el && (!el.value || el.value.trim().length === 0)) {
        el.value = val;
        restored++;
        // Trigger any change handlers
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    document.querySelector('.draft-restore-banner')?.remove();
    toast(`💾 Restored ${restored} unsaved field${restored === 1 ? '' : 's'}`, 'success');
  } catch (e) {
    toast('Could not restore draft — please re-enter', 'error');
  }
}

function discardDraft() {
  localStorage.removeItem(DRAFT_KEY);
  document.querySelector('.draft-restore-banner')?.remove();
}

// Attach the auto-save listener globally (input event bubbles)
document.addEventListener('input', (e) => {
  const tag = e.target?.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
  // Only non-secret wizard fields (skip chat, search, passwords, Quick Setup)
  if (!isDraftableField(e.target)) return;
  scheduleDraftSave();
});

// Run the draft check shortly after init() to allow prefillFromConfig() to settle
setTimeout(checkForDraftToRestore, 800);

// ============================================================
// Command Palette (Cmd+K / Ctrl+K) — power-user keyboard accelerator
// ============================================================
// Modal overlay with fuzzy-matched commands. Mirrors VSCode / Linear / Raycast
// patterns so power users have a fast way to jump anywhere without clicking.
// Each command has a label, icon, optional hint (keyboard shortcut), and a
// run() function. The list is filtered as the user types.

const COMMANDS = [
  { id:'new-conv',    label:'Start a new conversation',     icon:'✏️', hint:'',          run: () => { if (typeof newConversation === 'function') newConversation(); } },
  { id:'open-health', label:'Open privacy & health',        icon:'🛡️', hint:'',          run: () => toggleHealthPanel() },
  { id:'open-mem',    label:'Open agent memories',          icon:'🧠', hint:'',          run: () => toggleMemoryPanel() },
  { id:'open-ai',     label:'Change the AI model (online or local)', icon:'🤖', hint:'', run: () => isLiveMode() ? openPage('ai') : openSettings() },
  { id:'open-conn',   label:'Open connections',             icon:'🔌', hint:'',          run: () => toggleSetupPanel() },
  { id:'open-set',    label:'Open full setup (wizard)',     icon:'⚙️', hint:'',          run: () => openSettings() },
  { id:'backup',      label:'Download a full backup',       icon:'💾', hint:'',          run: () => downloadBackup() },
  { id:'diagnostic',  label:'Report an issue (download diagnostic)', icon:'🆘', hint:'', run: () => downloadDiagnostic() },
  { id:'theme',       label:'Toggle light / dark theme',    icon:'🎨', hint:'',          run: () => toggleTheme() },
  { id:'docs',        label:'Open documentation on GitHub', icon:'📚', hint:'',          run: () => window.open('https://github.com/geechun80/vouza-admin-agent', '_blank') },
  { id:'add-email',   label:'Connect Email',                icon:'📧', hint:'',          run: () => onSetupItemClick('email', false, 'I want to connect my email. Walk me through it step by step.') },
  { id:'add-tel',     label:'Connect Telegram',             icon:'💬', hint:'',          run: () => onSetupItemClick('telegram', false, 'Help me set up Telegram so I can chat with the AI from my phone.') },
  { id:'add-wa',      label:'Connect WhatsApp',             icon:'📱', hint:'',          run: () => onSetupItemClick('whatsapp', false, "Help me connect WhatsApp. I want to scan the QR code.") },
  { id:'add-cal',     label:'Connect Calendar',             icon:'📅', hint:'',          run: () => onSetupItemClick('calendar', false, "Help me connect Google Calendar so the AI can schedule meetings.") },
  { id:'add-sheets',  label:'Connect Spreadsheets',         icon:'📊', hint:'',          run: () => onSetupItemClick('spreadsheet', false, "Help me connect Google Sheets for invoice and data tracking.") },
  { id:'restart',     label:'Restart the agent now',        icon:'🔁', hint:'',          run: () => { if (typeof retryLaunch === 'function') retryLaunch(); } },
];

let _cmdIdx = 0;

function openCmdPalette() {
  const overlay = document.getElementById('cmdPalette');
  const input   = document.getElementById('cmdPaletteInput');
  if (!overlay || !input) return;
  overlay.classList.add('visible');
  input.value = '';
  renderCmdList('');
  setTimeout(() => input.focus(), 50);
}

function closeCmdPalette() {
  document.getElementById('cmdPalette')?.classList.remove('visible');
}

function renderCmdList(query) {
  const list = document.getElementById('cmdPaletteList');
  if (!list) return;
  const q = (query || '').toLowerCase().trim();
  const matches = q
    ? COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q))
    : COMMANDS;
  _cmdIdx = 0;
  list.innerHTML = matches.length === 0
    ? `<li class="cmd-item"><span class="cmd-icon">🔍</span><span class="cmd-label" style="color:var(--text-dim)">No commands match "${escHtml(q)}"</span></li>`
    : matches.map((c, i) => `
        <li class="cmd-item ${i === 0 ? 'active' : ''}" data-id="${c.id}" onclick="runCmd('${c.id}')" role="option">
          <span class="cmd-icon">${c.icon}</span>
          <span class="cmd-label">${highlightHits(c.label, q)}</span>
          ${c.hint ? `<span class="cmd-hint">${escHtml(c.hint)}</span>` : ''}
        </li>
      `).join('');
}

function runCmd(id) {
  const cmd = COMMANDS.find((c) => c.id === id);
  closeCmdPalette();
  if (cmd) {
    // Slight delay so the modal closes visually before action runs
    setTimeout(() => { try { cmd.run(); } catch (e) { console.error(e); } }, 50);
  }
}

function moveCmdSelection(delta) {
  const list = document.getElementById('cmdPaletteList');
  if (!list) return;
  const items = list.querySelectorAll('.cmd-item[data-id]');
  if (items.length === 0) return;
  _cmdIdx = (_cmdIdx + delta + items.length) % items.length;
  items.forEach((it, i) => it.classList.toggle('active', i === _cmdIdx));
  items[_cmdIdx].scrollIntoView({ block: 'nearest' });
}

function getActiveCmdId() {
  const list = document.getElementById('cmdPaletteList');
  const active = list?.querySelector('.cmd-item.active[data-id]');
  return active?.getAttribute('data-id');
}

// Global keyboard handlers
document.addEventListener('keydown', (e) => {
  // Cmd+K on Mac, Ctrl+K on Windows/Linux — open palette from anywhere
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openCmdPalette();
    return;
  }
  // Palette-specific keys when it's open
  const overlay = document.getElementById('cmdPalette');
  if (!overlay?.classList.contains('visible')) return;
  if (e.key === 'Escape')       { closeCmdPalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdSelection(+1); }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); moveCmdSelection(-1); }
  else if (e.key === 'Enter')     { e.preventDefault(); const id = getActiveCmdId(); if (id) runCmd(id); }
});

// Clicking the overlay (outside the palette box) closes it
document.getElementById('cmdPalette')?.addEventListener('click', (e) => {
  if (e.target.id === 'cmdPalette') closeCmdPalette();
});

// Live filter as user types
document.getElementById('cmdPaletteInput')?.addEventListener('input', (e) => {
  renderCmdList(e.target.value);
});

// ============================================================
// What's New — changelog notifier
// ============================================================
// Compares the current build's version to the one the user last dismissed.
// If they differ, shows a non-intrusive badge with a "What's new?" modal
// listing the latest CHANGELOG entries. One-time per version.

const SEEN_VERSION_KEY = 'vouza_changelog_seen_v1';

// ── Version + "Check for updates" ───────────────────────────────────────────
// Shows which version is running (so "am I on the old one?" has an answer)
// and, only when the person presses the button, asks GitHub for the latest.
async function showAppVersion() {
  try {
    const { version } = await fetch('/api/version').then((r) => r.json());
    if (version) document.querySelectorAll('.app-version').forEach((el) => { el.textContent = `Version ${version}`; });
  } catch { /* silent */ }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showAppVersion);
else showAppVersion();

// Once a day (server-cached) the dashboard asks GitHub whether a newer
// version exists, so people on an old copy are told to update. Switch off in
// System Health -> Privacy & network. "Later" hides it for that version.
const UPDATE_DISMISSED_KEY = 'vouza_update_dismissed_v1';

async function autoCheckForUpdates() {
  try {
    const r = await fetch('/api/update-check?auto=1').then((x) => x.json());
    if (!r.ok || r.skipped || !r.updateAvailable) return;
    let dismissed = '';
    try { dismissed = localStorage.getItem(UPDATE_DISMISSED_KEY) || ''; } catch { /* private window */ }
    if (dismissed === r.latest) return;
    showUpdateBanner(r);
  } catch { /* offline — try again next time */ }
}

function showUpdateBanner(r) {
  if (document.getElementById('updateBanner')) return;
  const url = /^https:\/\/github\.com\//.test(r.url || '') ? r.url : 'https://github.com/geechun80/vouza-admin-agent#-update';
  const bar = document.createElement('div');
  bar.id = 'updateBanner';
  bar.className = 'update-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML =
    `<span>🆕 <strong>Version ${escHtml(r.latest)} is available</strong> — you have ${escHtml(r.current)}. Please update to get the latest fixes.</span>` +
    `<a class="btn btn-primary" href="${escHtml(url)}" target="_blank" rel="noopener">How to update</a>` +
    `<button type="button" class="btn" data-act="later">Later</button>`;
  bar.querySelector('[data-act="later"]').addEventListener('click', () => {
    try { localStorage.setItem(UPDATE_DISMISSED_KEY, r.latest); } catch { /* ignore */ }
    bar.remove();
  });
  document.body.appendChild(bar);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoCheckForUpdates);
else autoCheckForUpdates();

async function checkForUpdates(btn) {
  const out = btn.parentElement.querySelector('.update-result');
  if (!out) return;
  btn.disabled = true;
  out.textContent = 'Checking…';
  try {
    const r = await fetch('/api/update-check').then((x) => x.json());
    if (!r.ok) {
      out.textContent = r.error || "Couldn't check right now.";
    } else if (r.updateAvailable) {
      const url = /^https:\/\/github\.com\//.test(r.url || '') ? r.url : 'https://github.com/geechun80/vouza-admin-agent#-update';
      out.innerHTML = `🆕 Version ${escHtml(r.latest)} is available — you have ${escHtml(r.current)}. ` +
        `<a href="${escHtml(url)}" target="_blank" rel="noopener">How to update</a>`;
    } else {
      out.textContent = `✓ You're up to date (version ${r.current}).`;
    }
  } catch {
    out.textContent = "Couldn't check right now.";
  } finally {
    btn.disabled = false;
  }
}

async function checkChangelog() {
  // Only ever run in live mode — wizard users get the tour, not the changelog
  if (!document.getElementById('mainApp')?.classList.contains('live-mode')) return;
  try {
    const r = await fetch('/api/version');
    if (!r.ok) return;
    const { version, changelog } = await r.json();
    if (!version) return;

    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    if (seen === version) return; // user already dismissed this version

    // First-ever launch (no `seen` flag at all) — silently record current version
    // without showing the modal. We only celebrate UPDATES.
    if (!seen) {
      localStorage.setItem(SEEN_VERSION_KEY, version);
      return;
    }

    showWhatsNewModal(version, changelog || '');
  } catch { /* network fail — silent */ }
}

function showWhatsNewModal(version, changelog) {
  // Pull just the most recent entry from the CHANGELOG (everything before the
  // second `## ` heading). Keeps the modal short and focused.
  let body = changelog;
  const headings = [...changelog.matchAll(/^## /gm)];
  if (headings.length >= 2) {
    body = changelog.slice(headings[0].index, headings[1].index).trim();
  } else if (headings.length === 1) {
    body = changelog.slice(headings[0].index).trim();
  }

  // Very lightweight markdown → HTML for the changelog body
  const html = body
    .replace(/^## (.+)$/gm, '<h3 style="font-size:16px;margin:0 0 8px;color:var(--text)">$1</h3>')
    .replace(/^\*\*(.+?)\*\*$/gm, '<div style="font-weight:600;color:var(--brand-light);margin:6px 0 10px;font-size:13px">$1</div>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\s*)+/g, '<ul style="margin:0 0 12px;padding-left:20px;font-size:13px;color:var(--text-dim);line-height:1.7">$&</ul>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-size:12px">$1</code>');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)';
  overlay.innerHTML = `
    <div role="dialog" aria-modal="true" aria-label="What's new in this version"
         style="background:var(--bg);border:1px solid rgba(124,58,237,0.4);border-radius:14px;padding:24px;max-width:560px;width:92vw;max-height:75vh;overflow-y:auto;box-shadow:0 16px 50px rgba(0,0,0,0.5);color:var(--text)">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.6px;color:var(--brand-light);text-transform:uppercase;margin-bottom:6px">What's new</div>
      ${html || '<div style="color:var(--text-dim);font-size:13px">No changelog available.</div>'}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button class="health-action-btn primary" data-act="ok" aria-label="Dismiss what's-new modal">Got it 🎉</button>
      </div>
    </div>
  `;
  const cleanup = () => {
    document.body.removeChild(overlay);
    localStorage.setItem(SEEN_VERSION_KEY, version);
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target?.getAttribute?.('data-act') === 'ok') cleanup();
  });
  document.body.appendChild(overlay);
}

// Trigger changelog check ~2 s after live mode activates (lets the tour
// finish first if both happen on the same session).
new MutationObserver(() => {
  if (document.getElementById('mainApp')?.classList.contains('live-mode')) {
    setTimeout(checkChangelog, 2000);
  }
}).observe(document.getElementById('mainApp') || document.body, {
  attributes: true, attributeFilter: ['class'],
});

// Trigger the onboarding tour once live mode is fully visible — wait a bit
// so DOM layout settles. Watching for class changes on #mainApp catches both
// the immediate-live (operator key already set up) and post-wizard cases.
new MutationObserver(() => {
  if (document.getElementById('mainApp')?.classList.contains('live-mode')) {
    setTimeout(startOnboardingTour, 600);
  }
}).observe(document.getElementById('mainApp') || document.body, {
  attributes: true, attributeFilter: ['class'],
});



// ============================================================
// QUICK SETUP — one thing per screen. The user pastes a key or
// a password and presses Next; the server detects, verifies for
// real and saves. GET /api/quick-setup/state lets a refresh
// resume at the first step that isn't done.
// ============================================================
const qs = {
  step: 1,
  state: null,
  preset: null,       // detected email servers for the typed address
  qrSource: null,     // WhatsApp QR EventSource
  tgPoll: null,       // Telegram "linked yet?" poll timer
  phoneStarting: false,
  phoneLinked: false,
};
const QS_STEPS = 5;

async function qsApi(path, body) {
  const init = body === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!data) throw new Error(`HTTP ${res.status}`);
  return data;
}

const qsPause = (ms) => new Promise((r) => setTimeout(r, ms));
const qsEl = (id) => document.getElementById(id);

function qsMsg(n, text, kind) {
  const el = qsEl(`qsMsg${n}`);
  if (!el) return;
  el.className = `qs-msg${kind ? ` ${kind}` : ''}`;
  el.textContent = text || '';
}

function qsBusy(btn, busyLabel) {
  if (!btn) return () => {};
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  return () => { btn.disabled = false; btn.textContent = label; };
}

async function startQuickSetup() {
  qsEl('welcomeScreen').style.display = 'none';
  qsEl('quickSetup').style.display = 'flex';
  try { qs.state = await qsApi('/api/quick-setup/state'); } catch { qs.state = null; }
  const s = qs.state;
  if (s?.profile?.userName) qsEl('qsName').value = s.profile.userName;
  if (s?.email?.address)    qsEl('qsEmail').value = s.email.address;
  qsRenderAi();
  qsGo(qsFirstIncomplete());
}

function qsFirstIncomplete() {
  const s = qs.state;
  if (!s) return 1;
  if (!s.ai.configured || !s.profile.userName) return 1;
  if (!s.email.configured) return 2;
  if (!s.folders.granted.length) return 3;
  if (!(s.phone.whatsapp.connected || s.phone.telegram.linked)) return 4;
  return 5;
}

function qsGo(n) {
  qs.step = n;
  document.querySelectorAll('#quickSetup .qs-step').forEach((el) => {
    el.hidden = Number(el.dataset.qsStep) !== n;
  });
  qsRenderDots();
  qsEl('qsBack').hidden = n === 1;
  if (n !== 4) qsStopPhone();
  if (n === 2 && qsEl('qsEmail').value) qsDetectEmail();
  if (n === 3) qsRenderFolders();
  if (n === 4) qsStartPhone();
  if (n === 5) qsRenderDone();
  const step = document.querySelector(`#quickSetup .qs-step[data-qs-step="${n}"]`);
  const firstEmpty = [...step.querySelectorAll('input.qs-input')].find((i) => !i.closest('[hidden]') && !i.value);
  (firstEmpty || step.querySelector('[data-qs-primary]:not([hidden])'))?.focus({ preventScroll: true });
  qsEl('quickSetup').scrollTop = 0;
}

function qsRenderDots() {
  const dots = qsEl('qsDots');
  dots.innerHTML = Array.from({ length: QS_STEPS }, (_, i) => {
    const n = i + 1;
    const cls = n === qs.step ? 'current' : n < qs.step ? 'done' : '';
    return `<span class="qs-dot ${cls}"></span>`;
  }).join('');
  dots.setAttribute('aria-valuenow', String(qs.step));
  dots.setAttribute('aria-valuetext', `Step ${qs.step} of ${QS_STEPS}`);
}

// Enter presses the step's main button (kid-simple: type, Enter, done).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const box = qsEl('quickSetup');
  if (!box || box.style.display !== 'flex') return;
  if (!(e.target instanceof HTMLInputElement) || e.target.type === 'checkbox') return;
  const step = document.querySelector(`#quickSetup .qs-step[data-qs-step="${qs.step}"]`);
  if (e.target.id === 'qsTgToken') { e.preventDefault(); qsEl('qsTgBtn').click(); return; }
  const btn = step?.querySelector('[data-qs-primary]:not([hidden])');
  if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
});

// ── 1 · You + AI ─────────────────────────────────────────────
function qsRenderAi() {
  const ai = qs.state?.ai;
  const ready = !!ai?.configured;
  qsEl('qsAiBlock').hidden = ready;
  qsEl('qsAiReady').hidden = !ready;
  qsEl('qsLocalAiWrap').hidden = !!ai?.local;
  if (ready) {
    qsEl('qsAiReady').textContent = ai.local
      ? `✓ Using the local AI on this computer (${ai.model})`
      : ai.viaBuiltIn
        ? '✓ Your AI is ready — nothing to set up'
        : '✓ Your AI is connected';
  }
}

// ── 1 · alternative: local AI (Ollama) ───────────────────────
async function qsToggleLocalAi() {
  const box = qsEl('qsLocalAi');
  box.hidden = !box.hidden;
  qsEl('qsLocalToggle').setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) await qsCheckLocalAi();
}

async function qsCheckLocalAi() {
  const body = qsEl('qsLocalAiBody');
  body.textContent = 'Looking for a local AI…';
  let r = null;
  try { r = await qsApi('/api/quick-setup/local-ai'); } catch { /* shown below */ }
  if (!r || !r.running) {
    body.innerHTML = `
      <p class="qs-hint" style="margin-top:0">No local AI is running on this computer yet.</p>
      <ol class="qs-steps-list">
        <li>Download <strong>Ollama</strong> (free) from <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com ↗</a> and open it.</li>
        <li>Open a terminal and run <code>ollama pull ${escHtml(r?.suggested || 'qwen2.5:7b')}</code> (a few GB, one time).</li>
        <li>Come back and tap <strong>Check again</strong>.</li>
      </ol>
      <p class="qs-hint">A local AI is slower than a cloud one and needs a reasonably recent computer (8 GB+ memory).</p>
      <button class="qs-btn" type="button" onclick="qsCheckLocalAi()">Check again</button>`;
    return;
  }
  if (!r.models.length) {
    body.innerHTML = `
      <p class="qs-hint" style="margin-top:0">✓ Ollama is running, but it has no AI model yet.</p>
      <p class="qs-hint">Open a terminal and run <code>ollama pull ${escHtml(r.suggested)}</code>, then tap <strong>Check again</strong>.</p>
      <button class="qs-btn" type="button" onclick="qsCheckLocalAi()">Check again</button>`;
    return;
  }
  const pick = r.models.includes(r.suggested) ? r.suggested : r.models[0];
  body.innerHTML = `
    <label class="qs-label" for="qsLocalModel">✓ Found a local AI. Which model?</label>
    <select class="qs-input" id="qsLocalModel">
      ${r.models.map((m) => `<option value="${escHtml(m)}" ${m === pick ? 'selected' : ''}>${escHtml(m)}</option>`).join('')}
    </select>
    <p class="qs-hint">Pick one that supports tools (for example qwen2.5 or llama3.1) so it can read your email and files.</p>
    <button class="qs-btn" type="button" onclick="qsUseLocalAi(this)">Use this local AI</button>`;
}

async function qsUseLocalAi(btn) {
  const model = qsEl('qsLocalModel')?.value;
  if (!model) return;
  const done = qsBusy(btn, 'Saving…');
  try {
    const r = await qsApi('/api/quick-setup/local-ai', { model });
    if (!r.ok) { qsMsg(1, r.error, 'error'); return; }
    if (qs.state) qs.state.ai = { configured: true, ownKey: false, viaBuiltIn: false, local: true, model: r.model, provider: 'ollama' };
    qsMsg(1, `✓ Using the local AI (${r.model}) — your chats stay on this computer`, 'ok');
    qsRenderAi();
  } catch {
    qsMsg(1, "I couldn't save that. Make sure the assistant window is still open, then try again.", 'error');
  } finally {
    done();
  }
}

async function qsSubmitYou(btn) {
  const name = qsEl('qsName').value.trim();
  const key = qsEl('qsAiKey').value.trim();
  if (!name) {
    qsMsg(1, 'Type your name first 🙂', 'error');
    qsEl('qsName').focus();
    return;
  }
  if (!qs.state?.ai?.configured && !key) {
    qsMsg(1, 'Paste your AI key to continue. No key? Tap “Get a free key here”.', 'error');
    qsEl('qsAiKey').focus();
    return;
  }
  const done = qsBusy(btn, key ? 'Checking your key…' : 'Saving…');
  try {
    await qsApi('/api/quick-setup/profile', {
      userName: name,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    });
    if (key) {
      qsMsg(1, '', '');
      const r = await qsApi('/api/quick-setup/ai', { key });
      if (!r.ok) {
        qsMsg(1, r.error, 'error');
        qsEl('qsAiKey').classList.add('invalid');
        qsEl('qsAiKey').focus();
        return;
      }
      qsEl('qsAiKey').classList.remove('invalid');
      qsEl('qsAiKey').value = '';
      if (qs.state) qs.state.ai = { configured: true, ownKey: true, viaBuiltIn: false, provider: r.provider };
      qsMsg(1, `✓ Connected to ${r.label}`, 'ok');
      await qsPause(900);
    }
    if (qs.state) qs.state.profile.userName = name;
    qsMsg(1, '', '');
    qsRenderAi();
    qsGo(2);
  } catch {
    qsMsg(1, "I couldn't save that. Make sure the assistant window is still open, then try again.", 'error');
  } finally {
    done();
  }
}

// ── 2 · Email ────────────────────────────────────────────────
async function qsDetectEmail() {
  const address = qsEl('qsEmail').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  if (qs.preset && qs.preset.forAddress === address) return qs.preset;
  let r;
  try { r = await qsApi('/api/quick-setup/email/detect', { address }); } catch { return null; }
  if (!r.ok) return null;
  qs.preset = { ...r.preset, forAddress: address };
  const p = qs.preset;

  const help = qsEl('qsEmailHelp');
  if (p.appPasswordUrl) {
    const twoStep = p.id === 'gmail' ? ' (Google asks for 2-Step Verification first — follow its steps.)' : '';
    help.innerHTML =
      `<div class="qs-card-title">${escHtml(p.label)} needs an App Password</div>` +
      `It's a special password just for apps like this one — your normal password won't work.${twoStep}` +
      `<ol><li>Tap the button and sign in</li><li>Type any name, like “Assistant”, and create it</li><li>Copy the code and paste it below</li></ol>` +
      `<a class="qs-btn qs-btn-small" href="${escHtml(p.appPasswordUrl)}" target="_blank" rel="noopener">Create App Password ↗</a>`;
  } else {
    help.innerHTML =
      `<div class="qs-card-title">Use your email password</div>` +
      `If it isn't accepted, your provider may need an “app password” — look for it in your account's security settings.`;
  }
  help.hidden = false;
  qsEl('qsEmailPassLabel').textContent = p.appPasswordUrl ? 'App Password' : 'Password';
  qsEl('qsEmailPass').placeholder = p.id === 'gmail' ? '16 letters, like xxxx xxxx xxxx xxxx' : '';
  qsEl('qsImapHost').value = p.imapHost;
  qsEl('qsImapPort').value = p.imapPort;
  qsEl('qsSmtpHost').value = p.smtpHost;
  qsEl('qsSmtpPort').value = p.smtpPort;
  qsEl('qsServers').open = !!p.guessed;
  // Re-rendering the help card can remove the element that had focus (e.g.
  // the user tabbed onto the old "Create App Password" button) — put the
  // caret where they'd type next instead of losing it.
  if (!document.activeElement || document.activeElement === document.body) qsEl('qsEmailPass').focus();
  return p;
}

async function qsSubmitEmail(btn) {
  const address = qsEl('qsEmail').value.trim();
  const password = qsEl('qsEmailPass').value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    qsMsg(2, 'Type your full email address, like you@gmail.com', 'error');
    qsEl('qsEmail').focus();
    return;
  }
  if (!password.trim()) {
    qsMsg(2, 'Paste the password first.', 'error');
    qsEl('qsEmailPass').focus();
    return;
  }
  const done = qsBusy(btn, 'Signing in…');
  try {
    await qsDetectEmail();
    qsMsg(2, '', '');
    const r = await qsApi('/api/quick-setup/email', {
      address,
      password,
      imapHost: qsEl('qsImapHost').value.trim(),
      imapPort: qsEl('qsImapPort').value.trim(),
      smtpHost: qsEl('qsSmtpHost').value.trim(),
      smtpPort: qsEl('qsSmtpPort').value.trim(),
    });
    if (!r.ok) {
      qsMsg(2, r.error, 'error');
      if (r.field === 'server') qsEl('qsServers').open = true;
      if (r.field === 'password') { qsEl('qsEmailPass').classList.add('invalid'); qsEl('qsEmailPass').focus(); }
      return;
    }
    qsEl('qsEmailPass').classList.remove('invalid');
    qsEl('qsEmailPass').value = '';
    if (qs.state) qs.state.email = { configured: true, address, provider: r.provider };
    const unread = typeof r.unread === 'number'
      ? ` — you have ${r.unread} unread email${r.unread === 1 ? '' : 's'}`
      : '';
    qsMsg(2, `✓ Connected${unread}`, 'ok');
    await qsPause(1300);
    qsMsg(2, '', '');
    qsGo(3);
  } catch {
    qsMsg(2, "Something went wrong talking to the assistant. Try again in a moment.", 'error');
  } finally {
    done();
  }
}

// ── 3 · Documents ────────────────────────────────────────────
const QS_FOLDER_ICON = { Documents: '📄', Desktop: '🖥️', Downloads: '⬇️' };

function qsRenderFolders() {
  const list = qs.state?.folders?.suggestions || [];
  const noneYet = !list.some((f) => f.granted);
  qsEl('qsFolders').innerHTML = list.map((f, i) => {
    const checked = f.granted || (noneYet && f.exists);
    return `<label class="qs-folder${f.exists ? '' : ' missing'}">
      <input type="checkbox" data-path="${escHtml(f.path)}" ${checked ? 'checked' : ''} ${f.exists ? '' : 'disabled'} id="qsFolder${i}">
      <span class="ic" aria-hidden="true">${QS_FOLDER_ICON[f.label] || '📁'}</span>
      <span>${escHtml(f.label)}<small>${f.exists ? escHtml(f.path) : 'Not found on this computer'}</small></span>
    </label>`;
  }).join('');
}

async function qsSubmitFolders(btn) {
  const paths = [...document.querySelectorAll('#qsFolders input:checked')].map((i) => i.dataset.path);
  if (!paths.length) { qsGo(4); return; }
  const done = qsBusy(btn, 'Saving…');
  try {
    const r = await qsApi('/api/quick-setup/folders', { paths });
    const added = (r.results || []).filter((x) => x.ok).map((x) => x.path);
    if (qs.state) qs.state.folders.granted = added;
    if (!r.ok) {
      const bad = (r.results || []).filter((x) => !x.ok);
      qsMsg(3, `I couldn't add ${bad.map((b) => b.path.split(/[\\/]/).pop()).join(', ')}: ${bad[0]?.error || 'unknown error'}. Untick it to continue.`, 'error');
      return;
    }
    qsMsg(3, '', '');
    qsGo(4);
  } catch {
    qsMsg(3, "Something went wrong saving that. Try again in a moment.", 'error');
  } finally {
    done();
  }
}

// ── 4 · Phone ────────────────────────────────────────────────
async function qsStartPhone() {
  const s = qs.state;
  if (qs.phoneLinked) return;
  if (s?.phone?.whatsapp?.connected) { qsPhoneLinked('whatsapp', s.phone.whatsapp.owner); return; }
  if (s?.phone?.telegram?.linked)    { qsPhoneLinked('telegram'); return; }
  if (qs.phoneStarting) return;
  qs.phoneStarting = true;
  qsEl('qsWa').hidden = true;
  qsEl('qsTg').hidden = true;
  qsEl('qsPhoneSub').textContent = 'Starting your assistant… this takes a few seconds.';
  qsMsg(4, '', '');
  let r;
  try { r = await qsApi('/api/quick-setup/launch', {}); } catch (e) { r = { ok: false, error: String(e) }; }
  qs.phoneStarting = false;
  if (!r.ok) {
    qsEl('qsPhoneSub').textContent = "I couldn't start yet.";
    qsMsg(4, r.error || 'Unknown error', 'error');
    return;
  }
  if (qs.state) qs.state.agentRunning = true;
  qsShowWhatsApp();
}

function qsShowWhatsApp() {
  qsStopTelegramPoll();
  qsEl('qsTg').hidden = true;
  qsEl('qsWa').hidden = false;
  qsEl('qsPhoneSub').textContent = 'Scan this code with WhatsApp to link your phone.';
  qsOpenQrStream();
}

function qsOpenQrStream() {
  qsCloseQrStream();
  qsEl('qsQr').innerHTML = '<div class="qs-spinner" aria-label="Loading code"></div>';
  const es = new EventSource('/api/whatsapp/qr-stream');
  qs.qrSource = es;
  es.addEventListener('qr', (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.dataUrl) qsEl('qsQr').innerHTML = `<img src="${d.dataUrl}" alt="WhatsApp link code">`;
    } catch { /* ignore malformed */ }
  });
  es.addEventListener('status', (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.status === 'connected') qsOnWhatsAppConnected();
      if (d.status === 'logged_out') qsMsg(4, 'WhatsApp signed out. Tap “Use WhatsApp instead” to get a new code.', 'error');
    } catch { /* ignore malformed */ }
  });
  es.addEventListener('connected', () => qsOnWhatsAppConnected());
  es.addEventListener('error', (ev) => {
    // Server-sent "error" events carry JSON; plain connection drops don't.
    if (ev && ev.data) {
      try { qsMsg(4, JSON.parse(ev.data).message, 'error'); } catch { /* ignore */ }
      qsCloseQrStream();
    }
  });
}

function qsCloseQrStream() {
  // The server ends the stream once linked; close ours so the browser
  // doesn't auto-reconnect in a loop.
  if (qs.qrSource) { qs.qrSource.close(); qs.qrSource = null; }
}

async function qsOnWhatsAppConnected() {
  qsCloseQrStream();
  if (qs.phoneLinked) return;
  qs.phoneLinked = true;
  let r = {};
  try { r = await qsApi('/api/quick-setup/whatsapp/linked', {}); } catch { /* still linked */ }
  qsPhoneLinked('whatsapp', r.owner);
}

function qsPhoneLinked(kind, owner) {
  qs.phoneLinked = true;
  qsCloseQrStream();
  qsStopTelegramPoll();
  qsEl('qsWa').hidden = true;
  qsEl('qsTg').hidden = true;
  qsEl('qsPhoneSub').textContent = '';
  const who = owner ? `${owner.name ? `${owner.name} · ` : ''}${owner.phone}` : '';
  const banner = qsEl('qsPhoneDone');
  banner.innerHTML = kind === 'whatsapp'
    ? `✓ WhatsApp linked${who ? ` to ${escHtml(who)}` : ''}<span>I sent you a message in “Message yourself”. Reply there anytime.</span>`
    : `✓ Telegram linked<span>Message your bot anytime — it answers only you.</span>`;
  banner.hidden = false;
  qsEl('qsSkip4').hidden = true;
  qsEl('qsNext4').hidden = false;
  qsEl('qsNext4').focus({ preventScroll: true });
  if (qs.state) {
    if (kind === 'whatsapp') qs.state.phone.whatsapp.connected = true;
    else qs.state.phone.telegram.linked = true;
  }
}

function qsShowTelegram() {
  qsCloseQrStream();
  qsEl('qsWa').hidden = true;
  qsEl('qsTg').hidden = false;
  qsEl('qsPhoneSub').textContent = 'Connect a Telegram bot instead.';
  qsEl('qsTgToken').focus();
}

async function qsSubmitTelegram(btn) {
  const token = qsEl('qsTgToken').value.trim();
  if (!token) { qsMsg(4, 'Paste the token from @BotFather first.', 'error'); return; }
  const done = qsBusy(btn, 'Connecting…');
  try {
    const r = await qsApi('/api/quick-setup/telegram', { token });
    if (!r.ok) { qsMsg(4, r.error, 'error'); return; }
    qsMsg(4, '', '');
    qsEl('qsTgToken').value = '';
    if (r.qrDataUrl) qsEl('qsTgQr').src = r.qrDataUrl;
    if (r.link) qsEl('qsTgHref').href = r.link;
    qsEl('qsTgLink').hidden = false;
    qsStopTelegramPoll();
    const started = Date.now();
    qs.tgPoll = setInterval(async () => {
      if (Date.now() - started > 30 * 60 * 1000) { qsStopTelegramPoll(); return; }
      try {
        const st = await qsApi('/api/quick-setup/telegram/status');
        if (st.linked) qsPhoneLinked('telegram');
      } catch { /* keep polling */ }
    }, 2000);
  } catch {
    qsMsg(4, "Something went wrong talking to the assistant. Try again in a moment.", 'error');
  } finally {
    done();
  }
}

function qsStopTelegramPoll() {
  if (qs.tgPoll) { clearInterval(qs.tgPoll); qs.tgPoll = null; }
}

function qsStopPhone() {
  qsCloseQrStream();
  qsStopTelegramPoll();
}

// ── 5 · Done ─────────────────────────────────────────────────
function qsRenderDone() {
  const s = qs.state || { ai: {}, email: {}, folders: { granted: [] }, phone: { whatsapp: {}, telegram: {} } };
  const n = s.folders.granted.length;
  const items = [
    [s.ai.configured, 'Your AI is connected', 'AI not connected — go back to step 1'],
    [s.email.configured, `Email connected${s.email.address ? ` (${s.email.address})` : ''}`, 'Email not connected — you can add it later under Setup'],
    [n > 0, `I can search ${n} folder${n === 1 ? '' : 's'}`, 'No folders shared — I can’t find your documents yet'],
    [s.phone.whatsapp.connected || s.phone.telegram.linked,
      s.phone.whatsapp.connected ? 'WhatsApp linked' : 'Telegram linked',
      'Phone not linked — you can link it later under Setup'],
  ];
  qsEl('qsChecklist').innerHTML = items.map(([ok, yes, no]) =>
    `<li class="${ok ? '' : 'todo'}"><span class="ic">${ok ? '✅' : '⚪'}</span><span>${escHtml(ok ? yes : no)}</span></li>`
  ).join('');
  qsRenderPower();
}

let qsPowerTimer = null;
async function qsRenderPower(attempt = 0) {
  clearTimeout(qsPowerTimer);
  let p;
  try { p = await qsApi('/api/power'); } catch { qsEl('qsPowerRows').textContent = ''; return; }
  const rows = [];
  const ka = p.keepAwake || {};
  if (ka.state === 'active') {
    rows.push(['✅', "This computer won't fall asleep while I'm running. Keep it plugged in."]);
  } else if (ka.state === 'starting') {
    rows.push(['⏳', 'Asking Windows to keep this computer awake…']);
    if (attempt < 30) qsPowerTimer = setTimeout(() => qsRenderPower(attempt + 1), 3000);
  } else if (ka.state === 'off') {
    rows.push(['⏳', "I'll keep this computer awake once I'm running."]);
  } else {
    rows.push(['⚠️', `I couldn't stop this computer from sleeping${ka.detail ? ` (${ka.detail})` : ''}. Turn off “Sleep” in your power settings so I can answer while you're away.`]);
  }
  let html = rows.map(([ic, t]) => `<div class="qs-power-row"><span>${ic}</span><span>${escHtml(t)}</span></div>`).join('');
  if (p.lidWillSleep) {
    html += `<div class="qs-power-row"><span>⚠️</span><span>Closing the lid puts this laptop to sleep, and then I can't answer you.
      Change <b>“When I close the lid”</b> to <b>“Do nothing”</b> for <b>Plugged in</b>.<br>
      <button class="qs-btn qs-btn-small" onclick="qsOpenLidSettings(this)">Change lid setting</button></span></div>`;
  }
  qsEl('qsPowerRows').innerHTML = html;
}

async function qsOpenLidSettings(btn) {
  const done = qsBusy(btn, 'Opening…');
  try {
    const r = await qsApi('/api/power/open-lid-settings', {});
    if (!r.ok) qsMsg(5, r.error, 'error');
    else qsMsg(5, 'Windows settings opened — pick “Do nothing” under Plugged in, then Save changes. Come back and press the button below.', 'info');
  } catch {
    qsMsg(5, "Couldn't open the settings. Search Windows for “Choose what closing the lid does”.", 'error');
  } finally {
    done();
  }
}

async function qsFinish(btn) {
  const done = qsBusy(btn, 'Finishing…');
  try {
    const r = await qsApi('/api/quick-setup/finish', { autostart: qsEl('qsAutostart').checked });
    if (!r.ok) { qsMsg(5, r.error || "Couldn't finish setup.", 'error'); return; }
    if (r.autostart && !r.autostart.ok) toast(`Couldn't set up automatic start: ${r.autostart.error}`, 'error');
  } catch {
    qsMsg(5, "Something went wrong talking to the assistant. Try again in a moment.", 'error');
    return;
  } finally {
    done();
  }
  qsStopPhone();
  clearTimeout(qsPowerTimer);
  qsEl('quickSetup').style.display = 'none';
  qsEl('mainApp').style.display = 'block';
  init();
  activateLiveMode();
}

// ============================================================
// Left menu + pages (live mode) — 2.3.0
// A menu item opens its page where the chat was (#mainApp.page-open);
// "Chat" brings the conversation back. The wizard keeps its own flow.
// ============================================================
var PAGE_PANELS = { // var: init() may run before this line
  connections: 'setup-panel',
  ai:          'ai-panel',
  memory:      'memory-panel',
  health:      'health-panel',
  settings:    'settings-panel',
};
var _currentPage = 'chat';

function isLiveMode() {
  return !!document.getElementById('mainApp')?.classList.contains('live-mode');
}

function closePages() {
  document.getElementById('mainApp')?.classList.remove('page-open');
  for (const id of Object.values(PAGE_PANELS)) document.getElementById(id)?.classList.remove('page-active');
  if (_healthRefreshTimer) { clearInterval(_healthRefreshTimer); _healthRefreshTimer = null; }
  _currentPage = 'chat';
}

async function openPage(name) {
  if (!PAGE_PANELS[name]) name = 'chat';
  closePages();
  _currentPage = name;
  document.querySelectorAll('.side-nav-item').forEach((b) => {
    const on = b.dataset.page === name;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    // Narrow windows show the menu as a sideways strip — keep the current item in view
    if (on && b.parentElement.scrollWidth > b.parentElement.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  if (name === 'chat') {
    updateChatEmptyState();
    return;
  }
  document.getElementById('mainApp')?.classList.add('page-open');
  const panel = document.getElementById(PAGE_PANELS[name]);
  panel.classList.add('page-active');
  panel.scrollTop = 0;
  try {
    if (name === 'connections') { renderSetupStatusPanel(); await renderSetupPanel(); }
    else if (name === 'ai')     await renderAiPage();
    else if (name === 'memory') await loadMemoryPanel();
    else if (name === 'health') {
      await loadHealthPanel();
      if (_currentPage === 'health') _healthRefreshTimer = setInterval(loadHealthPanel, 15000);
    }
  } catch (err) {
    console.warn(`Page ${name} failed to load:`, err);
  }
}

// ── Chat start screen ────────────────────────────────────────
function updateChatEmptyState() {
  const box = document.getElementById('guideMessages');
  const col = document.getElementById('guideCol');
  if (!box || !col) return;
  const hasMessages = [...box.children].some((el) => el.id !== 'guideTyping');
  col.classList.toggle('chat-empty', !hasMessages);
  if (!hasMessages) {
    const hi = document.getElementById('chatWelcomeHi');
    const name = (_savedConfig?.agent?.userName || document.getElementById('userName')?.value || '').trim();
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    if (hi) hi.textContent = name ? `${part}, ${name}` : part;
  }
}

(function watchChatMessages() {
  const box = document.getElementById('guideMessages');
  if (!box || typeof MutationObserver === 'undefined') return;
  new MutationObserver(updateChatEmptyState).observe(box, { childList: true });
  updateChatEmptyState();
})();

/** A start-screen suggestion: send it now, or put it in the box to finish. */
function useChatSuggestion(text, send) {
  const input = document.getElementById('guideInput');
  if (!input) return;
  input.value = text;
  if (send) { sendGuideMsg(); return; }
  input.focus();
  input.setSelectionRange(text.length, text.length);
  if (typeof autoGrowGuideInput === 'function') autoGrowGuideInput();
}

// ── "AI: … · Change" under the message box ───────────────────
function shortModelName(id) {
  const s = String(id || '');
  const label = typeof modelLabel === 'function' ? modelLabel(s) : s;
  return label !== s ? label : (s.split('/').pop() || s);
}

function describeAi(ai) {
  if (!ai || !ai.configured) return { icon: '⚠️', text: 'No AI set up yet' };
  if (ai.local)      return { icon: '💻', text: `${ai.model} · runs on this computer` };
  if (ai.viaBuiltIn) return { icon: '☁️', text: 'Built-in AI · online' };
  return { icon: '☁️', text: `${shortModelName(ai.activeModel)} · online` };
}

async function refreshChatModelLine() {
  const el = document.getElementById('chatModelLine');
  if (!el) return;
  let s = null;
  try { s = await qsApi('/api/quick-setup/state'); } catch { /* leave it empty */ }
  if (!s) { el.innerHTML = ''; return; }
  const d = describeAi(s.ai);
  el.innerHTML = `<span>${d.icon} AI: ${escHtml(d.text)}</span> · <button type="button" class="link-btn" onclick="openPage('ai')">Change</button>`;
}

// ── 🤖 AI model page ─────────────────────────────────────────
async function renderAiPage() {
  const el = document.getElementById('aiPageContent');
  if (!el) return;
  let s = null;
  try { s = await qsApi('/api/quick-setup/state'); } catch { /* shown below */ }
  const ai = s?.ai || {};
  const d = describeAi(ai);
  const now = !s
    ? "Couldn't read the current setting — make sure the assistant window is still open."
    : ai.local
      ? `💻 <strong>Local AI on this computer</strong> (${escHtml(ai.model)}). Your chats stay on this computer.`
      : `${d.icon} <strong>${escHtml(d.text)}</strong>${ai.ownKey ? ' — using your own key.' : ai.viaBuiltIn ? ' — no key needed.' : ''}`;
  el.innerHTML = `
    <div class="page-card current">
      <h3>Right now</h3>
      <p>${now}</p>
    </div>
    <div class="page-card">
      <h3>☁️ Online AI</h3>
      <p class="page-hint" style="margin-bottom:0">Fast and smart. Your messages go to the AI company of the key you use.</p>
      ${ai.local ? `
        <div class="page-row" style="margin-top:12px">
          <button type="button" class="btn btn-primary" onclick="aiUseOnline(this)">Switch back to online AI</button>
        </div>` : ''}
      <label for="aiNewKey">${ai.local ? 'Or paste a new AI key' : ai.ownKey ? 'Use a different AI key' : 'Paste your AI key'}</label>
      <div class="page-row">
        <input type="password" id="aiNewKey" placeholder="Starts with sk-or-, sk-ant-, sk-, AIza or xai-" autocomplete="off" spellcheck="false"
               onkeydown="if(event.key==='Enter'){event.preventDefault();aiSaveKey(document.getElementById('aiSaveKeyBtn'))}">
        <button type="button" class="btn" id="aiSaveKeyBtn" onclick="aiSaveKey(this)">Check &amp; save</button>
      </div>
      <p class="page-hint" style="margin-top:8px">No key? <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">Get one from OpenRouter ↗</a> — one key works with every model. To pick exact models, use <button type="button" class="link-btn" onclick="openSettings()">full setup</button>.</p>
      <div class="page-msg" id="aiOnlineMsg" role="status"></div>
    </div>
    <div class="page-card">
      <h3>💻 Local AI on this computer (Ollama)</h3>
      <p class="page-hint">Free and private: nothing is sent to an AI company. Slower than an online AI, and needs a computer with 8 GB+ memory.</p>
      <div id="aiLocalBody"></div>
    </div>`;
  renderLocalAiCard(document.getElementById('aiLocalBody'), {
    current: ai.local ? ai.model : null,
    onDone: () => { renderAiPage(); refreshChatModelLine(); },
  });
}

async function aiSaveKey(btn) {
  const input = document.getElementById('aiNewKey');
  const msg = document.getElementById('aiOnlineMsg');
  const key = input?.value.trim();
  if (!key) { input?.focus(); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const r = await qsApi('/api/quick-setup/ai', { key });
    if (!r.ok) { msg.className = 'page-msg error'; msg.textContent = r.error; return; }
    input.value = '';
    toast(`✓ Connected to ${r.label} — your assistant now uses it`, 'success');
    if (_savedConfig?.agent) _savedConfig.agent.provider = r.provider;
    await renderAiPage();
    refreshChatModelLine();
  } catch {
    msg.className = 'page-msg error';
    msg.textContent = "I couldn't save that. Make sure the assistant window is still open, then try again.";
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

async function aiUseOnline(btn) {
  const msg = document.getElementById('aiOnlineMsg');
  btn.disabled = true;
  try {
    const r = await qsApi('/api/quick-setup/online-ai', {});
    if (!r.ok) {
      msg.className = 'page-msg error';
      msg.textContent = r.error;
      if (r.needKey) document.getElementById('aiNewKey')?.focus();
      return;
    }
    if (_savedConfig?.agent) Object.assign(_savedConfig.agent, { provider: r.provider, model: r.model });
    toast('✓ Switched to the online AI', 'success');
    await renderAiPage();
    refreshChatModelLine();
  } catch {
    msg.className = 'page-msg error';
    msg.textContent = "I couldn't switch. Make sure the assistant window is still open, then try again.";
  } finally {
    btn.disabled = false;
  }
}

// ── Local AI (Ollama) card — AI model page + setup wizard ────
// opts.current: model in use now (or null); opts.onDone(model) after saving.
async function renderLocalAiCard(el, opts = {}) {
  if (!el) return;
  el.innerHTML = '<p class="page-hint">Looking for a local AI on this computer…</p>';
  let r = null;
  try { r = await qsApi('/api/quick-setup/local-ai'); } catch { /* treated as not running */ }
  const again = '<button type="button" class="btn" data-local-again>Check again</button>';
  if (!r || !r.running) {
    el.innerHTML = `
      <p class="page-hint" style="margin-top:0">No local AI is running on this computer yet. To add one:</p>
      <ol class="local-steps">
        <li>Download <strong>Ollama</strong> (free) from <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com ↗</a>, install it and open it.</li>
        <li>Open a terminal (Windows: search “cmd”) and run <code>ollama pull ${escHtml(r?.suggested || 'qwen2.5:7b')}</code> — a few GB, one time.</li>
        <li>Come back here and tap <strong>Check again</strong>.</li>
      </ol>
      ${opts.current ? `<p class="page-msg error">⚠️ Your assistant is set to the local AI (${escHtml(opts.current)}), but Ollama isn't running — open Ollama, or switch back to online AI.</p>` : ''}
      ${again}`;
  } else if (!r.models.length) {
    el.innerHTML = `
      <p class="page-hint" style="margin-top:0">✓ Ollama is running, but it has no AI model yet.</p>
      <p class="page-hint">Open a terminal and run <code>ollama pull ${escHtml(r.suggested)}</code>, then tap <strong>Check again</strong>.</p>
      ${again}`;
  } else {
    const pick = r.models.includes(opts.current) ? opts.current
      : r.models.includes(r.suggested) ? r.suggested : r.models[0];
    el.innerHTML = `
      ${opts.current ? `<p class="page-msg ok" style="margin:0 0 6px">✓ In use: ${escHtml(opts.current)}</p>` : '<p class="page-hint" style="margin-top:0">✓ Found a local AI.</p>'}
      <label for="localAiModel">Which model?</label>
      <div class="page-row">
        <select id="localAiModel">
          ${r.models.map((m) => `<option value="${escHtml(m)}" ${m === pick ? 'selected' : ''}>${escHtml(m)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-primary" data-local-use>${opts.current ? 'Use this model' : 'Use this local AI'}</button>
      </div>
      <p class="page-hint" style="margin-top:8px">Pick one that supports tools (for example qwen2.5 or llama3.1) so it can read your email and files.</p>
      <div class="page-msg" data-local-msg role="status"></div>`;
  }
  el.querySelector('[data-local-again]')?.addEventListener('click', () => renderLocalAiCard(el, opts));
  el.querySelector('[data-local-use]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const label = btn.textContent;
    const msg = el.querySelector('[data-local-msg]');
    const model = el.querySelector('#localAiModel')?.value;
    if (!model) return;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = await qsApi('/api/quick-setup/local-ai', { model });
      if (!res.ok) { msg.className = 'page-msg error'; msg.textContent = res.error; return; }
      toast(`✓ Using the local AI (${res.model}) — your chats stay on this computer`, 'success');
      refreshChatModelLine();
      opts.onDone?.(res.model);
    } catch {
      msg.className = 'page-msg error';
      msg.textContent = "I couldn't save that. Make sure the assistant window is still open, then try again.";
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });
}

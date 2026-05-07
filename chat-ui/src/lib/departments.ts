/**
 * Department configuration registry.
 *
 * Each department defines:
 * - Which company specs (systems) are available via get_company_spec()
 * - Which n8n credentials are available for workflow generation
 * - Optional extra prompt rules injected as department context
 *
 * Credentials are tagged with env: 'sandbox' | 'production' AND a serviceKey.
 * serviceKey groups sandbox/production credentials of the same canonical service so the
 * "Take to Production" promote flow can pair them deterministically (e.g. swap a workflow's
 * sandbox Salesforce credential for the matching production one). Two credentials with the
 * same serviceKey MUST also share the same `type` — credential types are not interchangeable
 * in n8n workflow JSON.
 *
 * Default behavior: use sandbox credentials unless the user explicitly requests production.
 *
 * Adding a new department: add an entry to DEPARTMENTS below. No code changes needed.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Credential {
  service: string;
  serviceKey: string;  // pairing key for sandbox↔production swap (e.g. 'salesforce', 'bigquery', 'slack_bot'). Lowercase.
  name: string;   // exact n8n credential name
  type: string;   // credential type key in workflow JSON (e.g., googleApi, slackApi)
  id: string;     // credential ID
  env: 'sandbox' | 'production';  // environment — default to sandbox unless user requests production
}

export interface DepartmentConfig {
  id: string;
  displayName: string;
  description: string;
  specs: string[];               // keys into SPEC_FILE_MAP (department-specific)
  credentials: Credential[];     // department-specific credentials
  promptRules?: string;          // optional extra XML rules for this department
  n8nProjectId?: string;         // n8n project to deploy workflows into (sandbox)
  n8nProductionProjectId?: string;  // n8n project for the "Take to Production" promote flow. Absence = button hidden in Hub.
}

// ─── Shared resources (available to all departments) ──────────────────────────

export const SHARED_CREDENTIALS: Credential[] = [
  { service: 'BigQuery', serviceKey: 'bigquery', name: 'Google BigQuery - N8N Service Account', type: 'googleApi', id: 'h7fJ82YhtOnUL58u', env: 'production' },
];

export const SHARED_SPECS = ['join_map'];

// ─── Department registry ──────────────────────────────────────────────────────

export const DEPARTMENTS: Record<string, DepartmentConfig> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKETING — n8n project: PkYJF1B9yVB8Imbl (Marketing Sandbox)
  // Only sandbox project exists. No production project.
  // ═══════════════════════════════════════════════════════════════════════════
  marketing: {
    id: 'marketing',
    displayName: 'Marketing',
    description: 'Marketing automation, ads, analytics, and content workflows',
    specs: ['hubspot', 'salesforce'],
    n8nProjectId: 'PkYJF1B9yVB8Imbl',
    credentials: [
      // Google Ads
      { service: 'Google Ads', serviceKey: 'google_ads', name: "Assaf's google ads api", type: 'googleAdsOAuth2Api', id: '7zPWAntoXHKpq6l7', env: 'sandbox' },
      // Google Drive
      { service: 'Google Drive (Erik)', serviceKey: 'gdrive', name: "Erik's Guesty Google Drive", type: 'googleDriveOAuth2Api', id: 'X2f4iJbsdyKh8JwR', env: 'sandbox' },
      // Google Gemini
      { service: 'Google Gemini (Marketing)', serviceKey: 'gemini', name: 'Google Gemini Guesty n8n Marketing', type: 'googlePalmApi', id: 'LL8fLgZSrUn8oZtV', env: 'sandbox' },
      { service: 'Google Gemini (Content)', serviceKey: 'gemini', name: 'Gemini - Content team', type: 'googlePalmApi', id: 'n1zl0kqIiUBw8ZRC', env: 'sandbox' },
      // Google Sheets
      { service: 'Google Sheets (Ron)', serviceKey: 'gsheets', name: 'Google Sheets account 64', type: 'googleSheetsOAuth2Api', id: 'LaWDjKMsqe74XASy', env: 'sandbox' },
      { service: 'Google Sheets (Assaf)', serviceKey: 'gsheets', name: "Assaf's Gsheet", type: 'googleSheetsOAuth2Api', id: 'EDO1bmcTulXX52OG', env: 'sandbox' },
      { service: 'Google Sheets (Erik)', serviceKey: 'gsheets', name: 'Google Sheets - @erik.cohen', type: 'googleSheetsOAuth2Api', id: '4jA8N85DnTpkvyeV', env: 'sandbox' },
      // Facebook / Meta
      { service: 'Facebook Graph', serviceKey: 'facebook_graph', name: 'Facebook Graph account 2', type: 'facebookGraphApi', id: 'Ieb5eo9DMkpgO9gU', env: 'sandbox' },
      // Trustpilot
      { service: 'Trustpilot', serviceKey: 'trustpilot', name: 'Trustpilot', type: 'httpHeaderAuth', id: 'zLLyVK7WyGS5CrWO', env: 'sandbox' },
      { service: 'Trustpilot (Ron)', serviceKey: 'trustpilot', name: 'Trustpilot1 - @ron.madar.hallevi - AI Team', type: 'httpHeaderAuth', id: '7myhqevBiXu7f4x0', env: 'sandbox' },
      // Modjo
      { service: 'Modjo', serviceKey: 'modjo', name: 'Modjo - Cross Dept', type: 'httpHeaderAuth', id: '0hrsL4YxOAvva28w', env: 'sandbox' },
      // Firecrawl
      { service: 'Firecrawl', serviceKey: 'firecrawl', name: 'firecrawl', type: 'httpBearerAuth', id: 'ngaBlIhFMFTZFajQ', env: 'sandbox' },
      // HiBob
      { service: 'HiBob', serviceKey: 'hibob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'sandbox' },
      // Monday.com (per-user credentials)
      { service: 'Monday.com (Erik)', serviceKey: 'monday', name: 'Monday.com - @erik.cohen - AI Team', type: 'mondayComApi', id: 'RB7E9LHIgTSUCl1b', env: 'sandbox' },
      { service: 'Monday.com (Ron)', serviceKey: 'monday', name: 'Monday.com - @ron.madar.hallevi - AI Team', type: 'mondayComApi', id: 'XNWtLaeE4VtX26uQ', env: 'sandbox' },
      { service: 'Monday.com (Samuel)', serviceKey: 'monday', name: 'Monday.com - @samuel.green', type: 'mondayComApi', id: 'WNVVcnekSFyRZwnW', env: 'sandbox' },
      // HubSpot
      { service: 'HubSpot', serviceKey: 'hubspot', name: 'HubSpot Developer', type: 'hubspotDeveloperApi', id: '1AM3RFd0UdBtfZR6', env: 'sandbox' },
      // Salesforce
      { service: 'Salesforce', serviceKey: 'salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'sandbox' },
      // Slack
      { service: 'Slack (Assaf)', serviceKey: 'slack_oauth', name: "Assaf's Slack Connection", type: 'slackOAuth2Api', id: '5Ii5X9IFid1S8rIE', env: 'sandbox' },
      { service: 'Slack (Samuel)', serviceKey: 'slack_bot', name: 'Slack - @samuel.green', type: 'slackApi', id: '90UBEYY1Sx6LQvEk', env: 'sandbox' },
      // Gmail
      { service: 'Gmail (Samuel)', serviceKey: 'gmail', name: 'Gmail - @samuel.green', type: 'gmailOAuth2', id: 'iBtVNhsfWnnbxLtl', env: 'sandbox' },
      // OpenAI
      { service: 'OpenAI', serviceKey: 'openai', name: 'OpenAI Marketing Shareable', type: 'openAiApi', id: '2S9DHTC48wRxBERm', env: 'sandbox' },
      // Cohere
      { service: 'Cohere', serviceKey: 'cohere', name: 'Cohere API (Shareable)', type: 'cohereApi', id: 'g7Jo4o2OHWPqyYlq', env: 'sandbox' },
      // Supabase
      { service: 'Supabase (Marketing RAG)', serviceKey: 'supabase', name: 'Supabase - Marketing RAG', type: 'supabaseApi', id: 'VyqopKE3idqjqBQK', env: 'sandbox' },
      { service: 'Supabase (Modjo)', serviceKey: 'supabase', name: 'Supabase - Modjo Calls RAG', type: 'supabaseApi', id: 'aWfCfVlZn2EvsdYI', env: 'sandbox' },
      // Postgres
      { service: 'Postgres (RAG)', serviceKey: 'postgres', name: 'Postgres RAG - @erik.cohen', type: 'postgres', id: 'bU98iAG5WzDTF0lf', env: 'sandbox' },
    ],
    promptRules: `<department_rules>
Avoid Code nodes — Marketing users are non-technical.
Use built-in n8n nodes (If, Switch, Merge, Aggregate, Set, Filter, Sort) instead.
For Google Sheets operations, prefer the Google Sheets node with googleSheetsOAuth2Api credential.
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER SUCCESS — sandbox: kh5kTQJhrQ8KNoSC | production: HSINMLm9Tt4FHjL3
  // Has both sandbox (Salesforce Partial Sandbox) and production credentials.
  // ═══════════════════════════════════════════════════════════════════════════
  cs: {
    id: 'cs',
    displayName: 'Customer Success',
    description: 'Customer success management, health scores, and account workflows',
    specs: ['salesforce', 'csm', 'hibob', 'jira', 'marketplace', 'zendesk'],
    n8nProjectId: 'kh5kTQJhrQ8KNoSC',
    n8nProductionProjectId: 'HSINMLm9Tt4FHjL3',
    credentials: [
      // ── Sandbox ──
      { service: 'Salesforce (Sandbox)', serviceKey: 'salesforce', name: 'Salesforce Partial Sandbox', type: 'salesforceOAuth2Api', id: 'aBjJNGRAjYF66z5F', env: 'sandbox' },
      { service: 'Google Gemini (AI Team)', serviceKey: 'gemini', name: 'Gemini - AI Team - Cross Dept', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'sandbox' },
      { service: 'Google Sheets (CX auto)', serviceKey: 'gsheets', name: 'Google Sheets - cx_automations@guesty.com', type: 'googleSheetsOAuth2Api', id: '7ORQ8IRh8B5Gh30x', env: 'sandbox' },
      { service: 'Google Sheets (Roni)', serviceKey: 'gsheets', name: 'Google Sheets - Roni Shif', type: 'googleSheetsOAuth2Api', id: 'RPi7Ecm1B3utIhYr', env: 'sandbox' },
      { service: 'Google Sheets', serviceKey: 'gsheets', name: 'Google Sheets account 55', type: 'googleSheetsOAuth2Api', id: 'YYBfN3jdWCRUKtmb', env: 'sandbox' },
      { service: 'Google Docs', serviceKey: 'gdocs', name: 'Google Docs account 8', type: 'googleDocsOAuth2Api', id: 'M9Nr0Z9BWYCgb3a4', env: 'sandbox' },
      { service: 'Google Drive (Roni)', serviceKey: 'gdrive', name: 'Google Drive - @ronishif - CS', type: 'googleDriveOAuth2Api', id: 'buZzVXa0qB706qpQ', env: 'sandbox' },
      { service: 'Google Drive (Ron)', serviceKey: 'gdrive', name: 'Google Drive account - ron.madar.hallevi', type: 'googleDriveOAuth2Api', id: '0dsR60mVu0IfoZ2N', env: 'sandbox' },
      // ── Production ──
      { service: 'Salesforce', serviceKey: 'salesforce', name: 'Salesforce Production Read - Cross Dept', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Modjo', serviceKey: 'modjo', name: 'Modjo', type: 'httpHeaderAuth', id: '0hrsL4YxOAvva28w', env: 'production' },
      { service: 'HiBob', serviceKey: 'hibob', name: 'HiBob Service Account - Cross Dept', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'production' },
      { service: 'Google Gemini (CSM)', serviceKey: 'gemini', name: 'Google Gemini - Guesty - CS', type: 'googlePalmApi', id: 'w2UVOXsARkCmAsOu', env: 'production' },
      { service: 'Zendesk (OAuth2)', serviceKey: 'zendesk_oauth', name: 'Zendesk Production - Read - OAuth2 Generic - Cross Dept', type: 'oAuth2Api', id: 'B1ksdYFDJ8LJKaTJ', env: 'production' },
      { service: 'BigQuery (CS Read)', serviceKey: 'bigquery', name: 'Google Service Account n8n-ai-cx-read - Cross Dept', type: 'googleApi', id: 'VQ7CU7dKViVcv8Ah', env: 'production' },
      { service: 'BigQuery (n8n CS)', serviceKey: 'bigquery', name: 'n8n CS Read', type: 'googleApi', id: 'IPuoHnXTeledx3UW', env: 'production' },
      { service: 'Google Sheets 69', serviceKey: 'gsheets', name: 'Google Sheets account 69', type: 'googleSheetsOAuth2Api', id: 'q3XVQiSUNn6QTd3Y', env: 'production' },
      { service: 'Google Sheets Trigger (Roni)', serviceKey: 'gsheets_trigger', name: 'Google Sheets Trigger - @RoniShif', type: 'googleSheetsTriggerOAuth2Api', id: '6LuTruhh0yhTE5F3', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_bot', name: 'Slack - @Who App - AI Team', type: 'slackApi', id: '7H6auF31TpX7Wk7M', env: 'production' },
      { service: 'Slack (Roni)', serviceKey: 'slack_oauth', name: 'Slack - @ronishif - CS', type: 'slackOAuth2Api', id: 'wg7EWUJRwvP0yB5c', env: 'production' },
      { service: 'Gmail', serviceKey: 'gmail', name: 'Gmail - @Ronishif - CS', type: 'gmailOAuth2', id: '3XKWZw8KuGVggGEH', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
    ],
    promptRules: `<department_rules>
Prefer the native Salesforce node over BigQuery for direct Salesforce CRM operations (owner, pipeline, opportunities).
For Guesty account data (plans, features, integrations, listings), use BigQuery datalake_glue.accounts.
For BigQuery queries, ALWAYS use the CS-specific credential:
  Correct: "credentials": { "googleApi": { "id": "VQ7CU7dKViVcv8Ah", "name": "Google Service Account n8n-ai-cx-read - Cross Dept" } }
  Wrong:   "credentials": { "googleApi": { "id": "h7fJ82YhtOnUL58u", "name": "Google BigQuery - N8N Service Account" } } <- this is the shared credential, NOT for CS
Avoid Code nodes -- CS users are non-technical.
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER EXPERIENCE — sandbox: EuTGww8zaCWPb8Cr | production: W62G9hxuK9c7cKwo
  // REFERENCE DEPARTMENT — comprehensive credential set, both envs.
  // ═══════════════════════════════════════════════════════════════════════════
  cx: {
    id: 'cx',
    displayName: 'Customer Experience',
    description: 'Support operations, ticket management, and customer workflows',
    specs: ['zendesk', 'salesforce', 'jira', 'marketplace'],
    n8nProjectId: 'EuTGww8zaCWPb8Cr',
    n8nProductionProjectId: 'W62G9hxuK9c7cKwo',
    credentials: [
      // ── Sandbox ──
      { service: 'Zendesk (Sandbox)', serviceKey: 'zendesk', name: 'Zendesk Sandbox - Info@guesty', type: 'zendeskApi', id: 'OTFp18SnDgGUSn9u', env: 'sandbox' },
      { service: 'Google Gemini (CX)', serviceKey: 'gemini', name: 'Google Gemini Guesty n8n CX', type: 'googlePalmApi', id: 'JrzPwNiVhZibKlAr', env: 'sandbox' },
      { service: 'Google Translate', serviceKey: 'gtranslate', name: 'Google Service Account - CX translate', type: 'googleApi', id: 'PAAimNTryrvB72dp', env: 'sandbox' },
      { service: 'Google Sheets (Inbal)', serviceKey: 'gsheets', name: 'Inbal - Google Sheets', type: 'googleSheetsOAuth2Api', id: 'vkdgHYUQNhtG8jsq', env: 'sandbox' },
      // ── Production: Zendesk ──
      { service: 'Zendesk', serviceKey: 'zendesk', name: 'Zendesk production - info@guesty.com', type: 'zendeskApi', id: 'I0sSUZvS0LVHjO2J', env: 'production' },
      { service: 'Zendesk (CX AI Agent)', serviceKey: 'zendesk', name: 'CX AI Agent', type: 'zendeskApi', id: '1YeTFsUZflTUgSAL', env: 'production' },
      { service: 'Zendesk (Automations)', serviceKey: 'zendesk', name: 'cx_automations@guesty.com', type: 'zendeskApi', id: 'kJ5WD6rCXzB0uyKa', env: 'production' },
      { service: 'Zendesk (Main)', serviceKey: 'zendesk', name: 'Zendesk account', type: 'zendeskApi', id: 'cFdFPhADfsxMmPFC', env: 'production' },
      // ── Production: Zuora ──
      { service: 'Zuora', serviceKey: 'zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      // ── Production: Google AI ──
      { service: 'Google Gemini (PaLM 2)', serviceKey: 'gemini', name: 'Google Gemini(PaLM) Api account 2', type: 'googlePalmApi', id: 'bvrV6UBbFgHdfx0G', env: 'production' },
      { service: 'Google Gemini (PaLM)', serviceKey: 'gemini', name: 'Google Gemini(PaLM) Api account', type: 'googlePalmApi', id: 'zLbU4Ppa0sCk3avU', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'OpenAI (NSAT)', serviceKey: 'openai', name: 'NSAT N8N only', type: 'openAiApi', id: 'IqN9B2jFalWegjur', env: 'production' },
      { service: 'LiteLLM', serviceKey: 'litellm', name: 'LiteLLM', type: 'openAiApi', id: '27qQ13au01z8Ufs7', env: 'production' },
      // ── Production: Google Workspace ──
      { service: 'Gmail (CX Automations)', serviceKey: 'gmail', name: 'Gmail - cx_automations@guesty.com', type: 'gmailOAuth2', id: '4BConxQW0qmylDKE', env: 'production' },
      { service: 'Google Sheets (CX)', serviceKey: 'gsheets', name: 'Google Sheets - cx_automations@guesty.com', type: 'googleSheetsOAuth2Api', id: '7ORQ8IRh8B5Gh30x', env: 'production' },
      { service: 'Google Sheets (Kurt)', serviceKey: 'gsheets', name: 'Google Sheets account - Kurt P', type: 'googleSheetsOAuth2Api', id: 'LwIN9HXxRfbtb0xy', env: 'production' },
      { service: 'Google Sheets Trigger (Kurt)', serviceKey: 'gsheets_trigger', name: 'Google Sheets Trigger - Kurt', type: 'googleSheetsTriggerOAuth2Api', id: 'Muib6cP4QYhqDyQy', env: 'production' },
      { service: 'Google Docs (CX)', serviceKey: 'gdocs', name: 'CX Automation', type: 'googleDocsOAuth2Api', id: 'vFQAQugW0DywClzX', env: 'production' },
      { service: 'Google Drive (CX)', serviceKey: 'gdrive', name: 'CXAutomations - Drive access', type: 'googleDriveOAuth2Api', id: 'QF9qQq5kC8xrZ2EA', env: 'production' },
      // ── Production: BigQuery ──
      { service: 'BigQuery (SA)', serviceKey: 'bigquery', name: 'Google Service Account account', type: 'googleApi', id: '2EJkTXIICSEva3cQ', env: 'production' },
      // ── Production: Slack ──
      { service: 'Slack (Bot)', serviceKey: 'slack_bot', name: 'Slack account - BotToken', type: 'slackApi', id: 'RdxjTWVc6DaiNrIY', env: 'production' },
      { service: 'Slack (App User)', serviceKey: 'slack_bot', name: 'Slack - App_UserOAuth Token', type: 'slackApi', id: 'oaJpbo4QLikJ3j8c', env: 'production' },
      { service: 'Slack (UserMain)', serviceKey: 'slack_oauth', name: 'Slack - UserMain', type: 'slackOAuth2Api', id: 'AePQZCpFJGTgbQj7', env: 'production' },
      // ── Production: Jira ──
      { service: 'Jira', serviceKey: 'jira', name: 'Jira SW Cloud Training', type: 'jiraSoftwareCloudApi', id: 'kCkJqmNJ9XOn9knx', env: 'production' },
      // ── Production: Other ──
      { service: 'Airtable', serviceKey: 'airtable', name: 'Airtable Read Only', type: 'airtableTokenApi', id: 'v24j1xVtP1ISlLfG', env: 'production' },
      { service: 'n8n (self)', serviceKey: 'n8n_self', name: 'n8n account', type: 'n8nApi', id: 'UXyTfYKFugulfWX2', env: 'production' },
    ],
    promptRules: `<department_rules>
Prefer native Zendesk and Salesforce nodes over BigQuery for direct CRM/ticket operations.
For Guesty account data (plans, features, integrations, listings), use BigQuery datalake_glue.accounts.
For BigQuery queries, ALWAYS use the CX-specific credential:
  Correct: "credentials": { "googleApi": { "id": "2EJkTXIICSEva3cQ", "name": "Google Service Account account" } }
  Wrong:   "credentials": { "googleApi": { "id": "h7fJ82YhtOnUL58u", "name": "Google BigQuery - N8N Service Account" } } <- this is the shared credential, NOT for CX
Avoid Code nodes -- CX users are non-technical.
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ONBOARDING — n8n project: Yh0x22sXaF1PEsGT (17 workflows)
  // No sandbox project found. All credentials are production.
  // ═══════════════════════════════════════════════════════════════════════════
  ob: {
    id: 'ob',
    displayName: 'Onboarding',
    description: 'Client onboarding workflows and setup automation',
    specs: ['salesforce', 'zendesk', 'jira'],
    n8nProjectId: 'Yh0x22sXaF1PEsGT',
    credentials: [
      // ── Production ──
      { service: 'Salesforce', serviceKey: 'salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Zendesk', serviceKey: 'zendesk', name: 'Zendesk production - info@guesty.com', type: 'zendeskApi', id: 'I0sSUZvS0LVHjO2J', env: 'production' },
      { service: 'Zendesk (OAuth2)', serviceKey: 'zendesk_oauth', name: 'Zendesk Production - Read - OAuth2 Generic', type: 'oAuth2Api', id: 'B1ksdYFDJ8LJKaTJ', env: 'production' },
      { service: 'Modjo (OB)', serviceKey: 'modjo', name: 'OB - Modjo - AI Team v2', type: 'httpHeaderAuth', id: '86AbuOAwd0fFd1k6', env: 'production' },
      { service: 'Google Gemini', serviceKey: 'gemini', name: 'Gemini - AI Team', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_oauth', name: 'Slack - AI Team (Kurt)', type: 'slackOAuth2Api', id: 'BXeGv4HZaOauuct6', env: 'production' },
      { service: 'BigQuery (OB SA)', serviceKey: 'bigquery', name: '(OB) Service Account - AI Team', type: 'googleApi', id: 'jTPSwPeDuM4ipl69', env: 'production' },
    ],
    promptRules: `<department_rules>
Prefer native Salesforce and Zendesk nodes over BigQuery for direct CRM/ticket operations.
For Guesty account data (plans, features, integrations, listings), use BigQuery datalake_glue.accounts.
Avoid Code nodes -- Onboarding users are non-technical.
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENTS — sandbox: ahDlEt5r1gShUBKY | production: eieaMOSUdvEI07s3
  // Has a sandbox Slack channel for testing. Production project verified via
  // live n8n API: contains GuestyPay Prod workflows, ask-pay V2.1 prod, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  payments: {
    id: 'payments',
    displayName: 'Payments',
    description: 'Payment processing, billing, and fee reconciliation workflows',
    specs: ['zuora', 'salesforce', 'admin_data'],
    n8nProjectId: 'ahDlEt5r1gShUBKY',
    n8nProductionProjectId: 'eieaMOSUdvEI07s3',
    credentials: [
      // ── Sandbox ──
      { service: 'Slack (Test)', serviceKey: 'slack_bot', name: 'Slack ask-pay-test', type: 'slackApi', id: '0l2bJ3SquNB8nyFd', env: 'sandbox' },
      // ── Production ──
      { service: 'Zendesk', serviceKey: 'zendesk', name: 'Zendesk account', type: 'zendeskApi', id: 'cFdFPhADfsxMmPFC', env: 'production' },
      { service: 'Google Gemini (Payments)', serviceKey: 'gemini', name: 'Payments', type: 'googlePalmApi', id: 'p77YTdHfPZTSa9e9', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'Gil OpenAi account', type: 'openAiApi', id: 'FyoNWUsGsy9o6xdh', env: 'production' },
      { service: 'Google Drive (Payments)', serviceKey: 'gdrive_sa', name: 'n8n-payments', type: 'googleApi', id: 'aLlYQkLWrmANkfFZ', env: 'production' },
      { service: 'Google Sheets Trigger', serviceKey: 'gsheets_trigger', name: 'Google Sheets Elena Chechik', type: 'googleSheetsTriggerOAuth2Api', id: 'W6Zn2BYAkgmc1t8W', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_bot', name: 'Slack ask-pay', type: 'slackApi', id: '87t2GgsbEJDItDs7', env: 'production' },
      // Note: Zuora (GbVP08J912cXYfH4) and Salesforce (fCB6gfK7EaGpMnZy) accessed via CX project
      { service: 'Zuora', serviceKey: 'zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      { service: 'Salesforce', serviceKey: 'salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
    ],
    promptRules: `<department_rules>
Avoid Code nodes — Payments users are non-technical.
For Zuora data, use BigQuery (zuora_analytics tables). The native Zuora node is for API write operations only.
For BigQuery queries, ALWAYS use the shared BigQuery credential (Payments has no department-specific BQ credential):
  Correct: "credentials": { "googleApi": { "id": "h7fJ82YhtOnUL58u", "name": "Google BigQuery - N8N Service Account" } }
  Wrong:   "credentials": { "googleApi": { "id": "aLlYQkLWrmANkfFZ", "name": "n8n-payments" } } <- this is Google Drive, NOT BigQuery
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCE — sandbox: WrQXt2ZvpTq5Lkzo (no separate production project — workflows
  // promote in-place or run from the CX project where applicable).
  // Has Zendesk sandbox credential for testing.
  // ═══════════════════════════════════════════════════════════════════════════
  finance: {
    id: 'finance',
    displayName: 'Finance',
    description: 'Financial reporting, invoice reconciliation, and accounting workflows',
    specs: ['zuora', 'admin_data', 'salesforce', 'hibob'],
    n8nProjectId: 'WrQXt2ZvpTq5Lkzo',
    credentials: [
      // ── Sandbox ──
      { service: 'Zendesk (Sandbox)', serviceKey: 'zendesk', name: 'Zendesk Sandbox - Info@guesty.com', type: 'zendeskApi', id: 'OTFp18SnDgGUSn9u', env: 'sandbox' },
      // ── Production ──
      { service: 'Zuora', serviceKey: 'zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      { service: 'Salesforce', serviceKey: 'salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Salesforce (Finance)', serviceKey: 'salesforce', name: 'Salesforce account 17', type: 'salesforceOAuth2Api', id: 'kajhw4Ar6xiRUWS6', env: 'production' },
      { service: 'HiBob', serviceKey: 'hibob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'production' },
      { service: 'Zendesk (Read Only)', serviceKey: 'zendesk_oauth', name: 'Zendesk Production - read only', type: 'oAuth2Api', id: '1SdAw6N3Ln7Y9Myw', env: 'production' },
      { service: 'Google Gemini', serviceKey: 'gemini', name: 'Google Gemini Guesty n8n CX', type: 'googlePalmApi', id: 'JrzPwNiVhZibKlAr', env: 'production' },
      { service: 'Docebo', serviceKey: 'docebo', name: 'Docebo Bearer Access Token', type: 'httpHeaderAuth', id: 'FoTHzLs4zV4PF4Qw', env: 'production' },
      { service: 'Google Sheets', serviceKey: 'gsheets', name: 'Google Sheets account 70', type: 'googleSheetsOAuth2Api', id: 'iA1JZiIZhXYHkVaS', env: 'production' },
      { service: 'Google Sheets Trigger', serviceKey: 'gsheets_trigger', name: 'Google Sheets Trigger account 17', type: 'googleSheetsTriggerOAuth2Api', id: 'g9QbIBYSVEyY4z5L', env: 'production' },
      { service: 'Google Calendar', serviceKey: 'gcalendar', name: 'Google Calendar account 106', type: 'googleCalendarOAuth2Api', id: 'uWNZXrR1NCrZ1xr0', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_bot', name: 'bot_user_oauth_token_slack_app_workflows_builder', type: 'slackApi', id: 'g3NQlNzyjFofD87l', env: 'production' },
    ],
    promptRules: `<department_rules>
Avoid Code nodes — Finance users are non-technical.
For cross-source fee/invoice analysis, BigQuery is preferred (zuora_analytics + guesty_analytics joins).
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT — n8n project: cC2MXxyCdYtzY46e (sandbox)
  // PM-facing. No dedicated sandbox data envs yet; credentials point at prod read-paths.
  // ═══════════════════════════════════════════════════════════════════════════
  product: {
    id: 'product',
    displayName: 'Product',
    description: 'Product management workflows: roadmap reporting, release notes, customer feedback, usage analytics',
    specs: ['salesforce', 'hubspot', 'jira', 'admin_data', 'siit', 'gus'],
    n8nProjectId: 'cC2MXxyCdYtzY46e',
    credentials: [
      // ── Production (no dedicated sandbox envs yet) ──
      { service: 'Salesforce', serviceKey: 'salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'HubSpot', serviceKey: 'hubspot', name: 'HubSpot Developer', type: 'hubspotDeveloperApi', id: '1AM3RFd0UdBtfZR6', env: 'production' },
      { service: 'Jira', serviceKey: 'jira', name: 'Jira SW Cloud Training', type: 'jiraSoftwareCloudApi', id: 'kCkJqmNJ9XOn9knx', env: 'production' },
      { service: 'Google Gemini (AI Team)', serviceKey: 'gemini', name: 'Gemini - AI Team - Cross Dept', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_oauth', name: 'Slack - AI Team (Kurt)', type: 'slackOAuth2Api', id: 'BXeGv4HZaOauuct6', env: 'production' },
    ],
    promptRules: `<department_rules>
Avoid Code nodes — Product users are PMs and non-technical.
Use built-in n8n nodes (If, Switch, Merge, Aggregate, Set, Filter, Sort) instead.
Prefer native Salesforce, HubSpot, and Jira nodes over BigQuery for direct CRM/issue operations.
For product analytics (accounts, plans, features, listings, reservations), use BigQuery via the admin_data / siit / gus specs.
For BigQuery queries, use the shared credential (id: h7fJ82YhtOnUL58u, name: "Google BigQuery - N8N Service Account").
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PEOPLE — n8n project: GG87KkXICRSZxeQu (sandbox)
  // HR / People Ops. HiBob is system of record. PII-sensitive — see pii_rule.
  // ═══════════════════════════════════════════════════════════════════════════
  people: {
    id: 'people',
    displayName: 'People',
    description: 'HR operations: onboarding, offboarding, roster reporting, employee communications',
    specs: ['hibob', 'admin_data'],
    n8nProjectId: 'GG87KkXICRSZxeQu',
    credentials: [
      // ── Production (no dedicated sandbox envs yet) ──
      { service: 'HiBob', serviceKey: 'hibob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'production' },
      { service: 'Docebo', serviceKey: 'docebo', name: 'Docebo Bearer Access Token', type: 'httpHeaderAuth', id: 'FoTHzLs4zV4PF4Qw', env: 'production' },
      { service: 'Google Gemini (AI Team)', serviceKey: 'gemini', name: 'Gemini - AI Team - Cross Dept', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_oauth', name: 'Slack - AI Team (Kurt)', type: 'slackOAuth2Api', id: 'BXeGv4HZaOauuct6', env: 'production' },
    ],
    promptRules: `<department_rules>
Avoid Code nodes — People users are HR business partners and non-technical.
Use built-in n8n nodes (If, Switch, Merge, Aggregate, Set, Filter, Sort) instead.
For HiBob operations, use the HTTP Request node with the httpBasicAuth credential against https://api.hibob.com/v1/* (there is no native HiBob node).
For cross-reference between employees and Guesty accounts, use BigQuery via the admin_data spec.

<pii_rule priority="high">
HiBob data contains employee PII: compensation, home address, personal contact info, performance ratings, termination dates.
- Never post individual-level PII (e.g. name + salary, name + review, name + termination) to public Slack channels.
- When the destination is a shared channel, aggregate the output (counts, averages, distributions) before posting.
- Use DMs or HR-only private channels when individual-level detail is required.
- If the user requests individual PII in a channel whose name does not clearly indicate HR-only access, pause and ask: "This output contains employee PII. Please confirm the target channel is HR-only before I build this."
</pii_rule>
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFORMATION SYSTEMS (Team IS) — n8n project: 3wBiKLqcGT5en7HH (sandbox)
  // IT/systems automation. Audience is technical; Code nodes are allowed.
  // ═══════════════════════════════════════════════════════════════════════════
  is: {
    id: 'is',
    displayName: 'Information Systems',
    description: 'IT automation: access requests, service desk ticket flows, account provisioning, internal tooling',
    specs: ['jira', 'admin_data'],
    n8nProjectId: '3wBiKLqcGT5en7HH',
    // n8nProductionProjectId: 'UCEMQoFhrGZ3FChz',  // CANDIDATE — workflows match IS prod profile (SaaS Manager Bot, Okta Groups, GitHub Users). Awaiting manager confirmation before enabling Take to Production button.
    credentials: [
      // ── Production (no dedicated sandbox envs yet) ──
      { service: 'Jira', serviceKey: 'jira', name: 'Jira SW Cloud Training', type: 'jiraSoftwareCloudApi', id: 'kCkJqmNJ9XOn9knx', env: 'production' },
      { service: 'Google Gemini (AI Team)', serviceKey: 'gemini', name: 'Gemini - AI Team - Cross Dept', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'production' },
      { service: 'OpenAI', serviceKey: 'openai', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'Slack', serviceKey: 'slack_oauth', name: 'Slack - AI Team (Kurt)', type: 'slackOAuth2Api', id: 'BXeGv4HZaOauuct6', env: 'production' },
      { service: 'n8n (self)', serviceKey: 'n8n_self', name: 'n8n account', type: 'n8nApi', id: 'UXyTfYKFugulfWX2', env: 'production' },
    ],
    promptRules: `<department_rules>
Team IS users are technical — Code nodes, JavaScript/Python, and raw HTTP requests are acceptable.
The current Jira spec covers software-project issues, not Service Desk tickets. For Jira Service Desk (access requests, IT support tickets), use the generic HTTP Request node against the Service Desk REST API and confirm endpoint + payload with the user before building.
For employee/account/systems cross-reference, use BigQuery via the admin_data spec.
For BigQuery queries, use the shared credential (id: h7fJ82YhtOnUL58u, name: "Google BigQuery - N8N Service Account").
</department_rules>`,
  },
};

export const DEFAULT_DEPARTMENT = 'cx';

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getDepartment(id: string): DepartmentConfig | undefined {
  return DEPARTMENTS[id];
}

export function getDepartmentList(): Array<{ id: string; displayName: string; description: string }> {
  return Object.values(DEPARTMENTS).map(d => ({
    id: d.id,
    displayName: d.displayName,
    description: d.description,
  }));
}

/** Get all spec keys available for a department (own + shared + credentials). */
export function getDepartmentSpecKeys(dept: DepartmentConfig): string[] {
  return [...new Set([...dept.specs, ...SHARED_SPECS, 'credentials'])];
}

/**
 * Group a department's credentials (own + shared) by `serviceKey`.
 * Used by the promote flow + by the system prompt's department_context block to give the
 * AI a structured map of sandbox↔production pairs.
 *
 * Within a serviceKey, sandbox creds and production creds are kept in separate buckets so
 * the swap is unambiguous. If a serviceKey has only sandbox credentials, the workflow cannot
 * promote to production until an admin adds the missing prod cred — surfaced explicitly in
 * the promote checklist.
 */
export interface ServiceKeyBucket {
  serviceKey: string;
  type: string;  // shared by all entries in this bucket; types are not interchangeable
  sandbox: Credential[];
  production: Credential[];
}

export function getDepartmentCredentialsByServiceKey(dept: DepartmentConfig): ServiceKeyBucket[] {
  const allCreds = [...dept.credentials, ...SHARED_CREDENTIALS];
  const grouped = new Map<string, ServiceKeyBucket>();
  for (const c of allCreds) {
    const key = `${c.serviceKey}::${c.type}`;  // distinguish e.g. slack_bot vs slack_oauth even if serviceKey is shared
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = { serviceKey: c.serviceKey, type: c.type, sandbox: [], production: [] };
      grouped.set(key, bucket);
    }
    if (c.env === 'sandbox') bucket.sandbox.push(c);
    else bucket.production.push(c);
  }
  return Array.from(grouped.values()).sort((a, b) => a.serviceKey.localeCompare(b.serviceKey));
}

// Common wrong credential types for JSON examples (observed hallucination patterns)
const WRONG_TYPES: Record<string, string> = {
  slackApi: 'slackOAuth2Api',
  slackOAuth2Api: 'slackApi',
  googleApi: 'googleBigQueryOAuth2Api',
  salesforceOAuth2Api: 'salesforceApi',
  zendeskApi: 'zendeskOAuth2Api',
};

/**
 * Generate correct/wrong JSON examples for the most commonly confused credential types.
 * Uses actual department credentials to anchor the examples.
 */
function generateCredentialExamples(creds: Credential[]): string {
  const services = ['Slack', 'BigQuery', 'Salesforce', 'Zendesk'];
  const examples: string[] = [];

  for (const service of services) {
    // Find matching credentials, preferring sandbox over production
    const matches = creds.filter(c =>
      c.service.toLowerCase().includes(service.toLowerCase()) ||
      (service === 'BigQuery' && c.type === 'googleApi' && c.service.toLowerCase().includes('google'))
    );
    const sandboxCred = matches.find(c => c.env === 'sandbox');
    const prodCred = matches.find(c => c.env === 'production');
    const cred = sandboxCred ?? prodCred;
    if (!cred) continue;

    const wrongType = WRONG_TYPES[cred.type] ?? `${cred.type}Wrong`;
    const defaultLabel = sandboxCred ? ' (DEFAULT - use this)' : '';
    examples.push(
      `${service} in this department:`,
      `  Correct${defaultLabel}: "credentials": { "${cred.type}": { "id": "${cred.id}", "name": "${cred.name}" } }`,
      `  Wrong (type):  "credentials": { "${wrongType}": { "id": "...", "name": "${cred.name} - Cross Dept" } }`,
    );
    // If sandbox exists and production is different, show production as wrong-for-default
    if (sandboxCred && prodCred && sandboxCred.id !== prodCred.id) {
      examples.push(
        `  Wrong (env):   "credentials": { "${prodCred.type}": { "id": "${prodCred.id}", "name": "${prodCred.name}" } } <- production, not default`,
      );
    }
  }

  if (examples.length === 0) return '';

  return [
    '',
    '<credential_examples>',
    'When building workflow JSON, credential blocks must look EXACTLY like these examples.',
    'Copy the type, id, and name character-for-character from the table above.',
    'ALWAYS use the DEFAULT credential unless the user explicitly says "production".',
    '',
    ...examples,
    '',
    'Never append suffixes (e.g., "- Cross Dept", "- Read Only") to credential names.',
    'Never fabricate credential IDs not in the table above.',
    'Never use credential IDs from search_nodes or get_node results -- only use this table.',
    '</credential_examples>',
  ].join('\n');
}

/**
 * Get all credentials for a department (shared + own), formatted as markdown tables.
 * Groups by environment: sandbox first (default), then production.
 * Includes programmatic JSON examples for commonly confused credential types.
 */
export function getDepartmentCredentialsMarkdown(dept: DepartmentConfig): string {
  // Dept-specific credentials first so they appear before shared defaults in the table
  const allCreds = [...dept.credentials, ...SHARED_CREDENTIALS];

  const sandboxCreds = allCreds.filter(c => c.env === 'sandbox');
  const productionCreds = allCreds.filter(c => c.env === 'production');

  const header = '| Service | Service Key | n8n Credential Name | Credential JSON Key | ID |';
  const divider = '|---------|-------------|---------------------|---------------------|-----|';

  const sections: string[] = [];

  if (sandboxCreds.length > 0) {
    sections.push(
      '### Sandbox (default)',
      header,
      divider,
      ...sandboxCreds.map(c => `| ${c.service} | \`${c.serviceKey}\` | ${c.name} | \`${c.type}\` | \`${c.id}\` |`),
    );
  }

  if (productionCreds.length > 0) {
    sections.push(
      '',
      '### Production (use only when user requests production)',
      header,
      divider,
      ...productionCreds.map(c => `| ${c.service} | \`${c.serviceKey}\` | ${c.name} | \`${c.type}\` | \`${c.id}\` |`),
    );
  }

  sections.push(
    '',
    '**IMPORTANT: Use ONLY credentials from the tables above.** Default to **sandbox** credentials. Only use production when the user explicitly requests it.',
    'The "Credential JSON Key" column is the key to use in workflow JSON: `"credentials": { "<key>": { "id": "...", "name": "..." } }`',
    'Always include both `id` and `name` in credential JSON. The `id` is authoritative for resolution.',
    'The "Service Key" column groups sandbox/production pairs of the same canonical service. The promote-to-production flow uses this column to swap a sandbox credential for its production counterpart.',
  );

  // Add programmatic JSON examples for commonly confused credential types
  // Dept-specific credentials first so examples prefer them over shared defaults
  const examples = generateCredentialExamples([...dept.credentials, ...SHARED_CREDENTIALS]);
  if (examples) {
    sections.push(examples);
  }

  return sections.join('\n');
}

/**
 * Render the structured `<credentials_by_service_key>` block used by the promote checklist.
 * Each line shows a serviceKey with its sandbox and production credentials side-by-side, so
 * the AI can deterministically map a workflow's sandbox cred to its production counterpart
 * during the "yes promote" cred swap.
 */
export function getDepartmentServiceKeyBlock(dept: DepartmentConfig): string {
  const buckets = getDepartmentCredentialsByServiceKey(dept);
  if (buckets.length === 0) return '';

  const lines: string[] = ['<credentials_by_service_key>'];
  for (const b of buckets) {
    lines.push(`  ${b.serviceKey} (type: ${b.type}):`);
    if (b.sandbox.length === 0) {
      lines.push('    sandbox:    (none — workflows in this department default to production for this service)');
    } else {
      for (const c of b.sandbox) {
        lines.push(`    sandbox:    ${c.name} (id: ${c.id})`);
      }
    }
    if (b.production.length === 0) {
      lines.push('    production: (NONE — workflows referencing this service CANNOT promote until an admin adds a production credential)');
    } else {
      for (const c of b.production) {
        lines.push(`    production: ${c.name} (id: ${c.id})`);
      }
    }
  }
  lines.push('</credentials_by_service_key>');
  return lines.join('\n');
}

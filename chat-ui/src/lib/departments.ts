/**
 * Department configuration registry.
 *
 * Each department defines:
 * - Which company specs (systems) are available via get_company_spec()
 * - Which n8n credentials are available for workflow generation
 * - Optional extra prompt rules injected as department context
 *
 * Credentials are tagged with env: 'sandbox' | 'production'.
 * Default behavior: use sandbox credentials unless the user explicitly requests production.
 *
 * Adding a new department: add an entry to DEPARTMENTS below. No code changes needed.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Credential {
  service: string;
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
}

// ─── Shared resources (available to all departments) ──────────────────────────

export const SHARED_CREDENTIALS: Credential[] = [
  { service: 'BigQuery', name: 'Google BigQuery - N8N Service Account', type: 'googleApi', id: 'h7fJ82YhtOnUL58u', env: 'production' },
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
      { service: 'Google Ads', name: "Assaf's google ads api", type: 'googleAdsOAuth2Api', id: '7zPWAntoXHKpq6l7', env: 'sandbox' },
      // Google Drive
      { service: 'Google Drive (Erik)', name: "Erik's Guesty Google Drive", type: 'googleDriveOAuth2Api', id: 'X2f4iJbsdyKh8JwR', env: 'sandbox' },
      // Google Gemini
      { service: 'Google Gemini (Marketing)', name: 'Google Gemini Guesty n8n Marketing', type: 'googlePalmApi', id: 'LL8fLgZSrUn8oZtV', env: 'sandbox' },
      { service: 'Google Gemini (Content)', name: 'Gemini - Content team', type: 'googlePalmApi', id: 'n1zl0kqIiUBw8ZRC', env: 'sandbox' },
      // Google Sheets
      { service: 'Google Sheets (Ron)', name: 'Google Sheets account 64', type: 'googleSheetsOAuth2Api', id: 'LaWDjKMsqe74XASy', env: 'sandbox' },
      { service: 'Google Sheets (Assaf)', name: "Assaf's Gsheet", type: 'googleSheetsOAuth2Api', id: 'EDO1bmcTulXX52OG', env: 'sandbox' },
      { service: 'Google Sheets (Erik)', name: 'Google Sheets - @erik.cohen', type: 'googleSheetsOAuth2Api', id: '4jA8N85DnTpkvyeV', env: 'sandbox' },
      // Facebook / Meta
      { service: 'Facebook Graph', name: 'Facebook Graph account 2', type: 'facebookGraphApi', id: 'Ieb5eo9DMkpgO9gU', env: 'sandbox' },
      // Trustpilot
      { service: 'Trustpilot', name: 'Trustpilot', type: 'httpHeaderAuth', id: 'zLLyVK7WyGS5CrWO', env: 'sandbox' },
      { service: 'Trustpilot (Ron)', name: 'Trustpilot1 - @ron.madar.hallevi - AI Team', type: 'httpHeaderAuth', id: '7myhqevBiXu7f4x0', env: 'sandbox' },
      // Modjo
      { service: 'Modjo', name: 'Modjo - Cross Dept', type: 'httpHeaderAuth', id: '0hrsL4YxOAvva28w', env: 'sandbox' },
      // Firecrawl
      { service: 'Firecrawl', name: 'firecrawl', type: 'httpBearerAuth', id: 'ngaBlIhFMFTZFajQ', env: 'sandbox' },
      // HiBob
      { service: 'HiBob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'sandbox' },
      // Monday.com (per-user credentials)
      { service: 'Monday.com (Erik)', name: 'Monday.com - @erik.cohen - AI Team', type: 'mondayComApi', id: 'RB7E9LHIgTSUCl1b', env: 'sandbox' },
      { service: 'Monday.com (Ron)', name: 'Monday.com - @ron.madar.hallevi - AI Team', type: 'mondayComApi', id: 'XNWtLaeE4VtX26uQ', env: 'sandbox' },
      { service: 'Monday.com (Samuel)', name: 'Monday.com - @samuel.green', type: 'mondayComApi', id: 'WNVVcnekSFyRZwnW', env: 'sandbox' },
      // HubSpot
      { service: 'HubSpot', name: 'HubSpot Developer', type: 'hubspotDeveloperApi', id: '1AM3RFd0UdBtfZR6', env: 'sandbox' },
      // Salesforce
      { service: 'Salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'sandbox' },
      // Slack
      { service: 'Slack (Assaf)', name: "Assaf's Slack Connection", type: 'slackOAuth2Api', id: '5Ii5X9IFid1S8rIE', env: 'sandbox' },
      { service: 'Slack (Samuel)', name: 'Slack - @samuel.green', type: 'slackApi', id: '90UBEYY1Sx6LQvEk', env: 'sandbox' },
      // Gmail
      { service: 'Gmail (Samuel)', name: 'Gmail - @samuel.green', type: 'gmailOAuth2', id: 'iBtVNhsfWnnbxLtl', env: 'sandbox' },
      // OpenAI
      { service: 'OpenAI', name: 'OpenAI Marketing Shareable', type: 'openAiApi', id: '2S9DHTC48wRxBERm', env: 'sandbox' },
      // Cohere
      { service: 'Cohere', name: 'Cohere API (Shareable)', type: 'cohereApi', id: 'g7Jo4o2OHWPqyYlq', env: 'sandbox' },
      // Supabase
      { service: 'Supabase (Marketing RAG)', name: 'Supabase - Marketing RAG', type: 'supabaseApi', id: 'VyqopKE3idqjqBQK', env: 'sandbox' },
      { service: 'Supabase (Modjo)', name: 'Supabase - Modjo Calls RAG', type: 'supabaseApi', id: 'aWfCfVlZn2EvsdYI', env: 'sandbox' },
      // Postgres
      { service: 'Postgres (RAG)', name: 'Postgres RAG - @erik.cohen', type: 'postgres', id: 'bU98iAG5WzDTF0lf', env: 'sandbox' },
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
    credentials: [
      // ── Sandbox ──
      { service: 'Salesforce (Sandbox)', name: 'Salesforce Partial Sandbox', type: 'salesforceOAuth2Api', id: 'aBjJNGRAjYF66z5F', env: 'sandbox' },
      { service: 'Google Gemini (AI Team)', name: 'Gemini - AI Team - Cross Dept', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'sandbox' },
      { service: 'Google Sheets (CX auto)', name: 'Google Sheets - cx_automations@guesty.com', type: 'googleSheetsOAuth2Api', id: '7ORQ8IRh8B5Gh30x', env: 'sandbox' },
      { service: 'Google Sheets (Roni)', name: 'Google Sheets - Roni Shif', type: 'googleSheetsOAuth2Api', id: 'RPi7Ecm1B3utIhYr', env: 'sandbox' },
      { service: 'Google Sheets', name: 'Google Sheets account 55', type: 'googleSheetsOAuth2Api', id: 'YYBfN3jdWCRUKtmb', env: 'sandbox' },
      { service: 'Google Docs', name: 'Google Docs account 8', type: 'googleDocsOAuth2Api', id: 'M9Nr0Z9BWYCgb3a4', env: 'sandbox' },
      { service: 'Google Drive (Roni)', name: 'Google Drive - @ronishif - CS', type: 'googleDriveOAuth2Api', id: 'buZzVXa0qB706qpQ', env: 'sandbox' },
      { service: 'Google Drive (Ron)', name: 'Google Drive account - ron.madar.hallevi', type: 'googleDriveOAuth2Api', id: '0dsR60mVu0IfoZ2N', env: 'sandbox' },
      // ── Production ──
      { service: 'Salesforce', name: 'Salesforce Production Read - Cross Dept', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Modjo', name: 'Modjo', type: 'httpHeaderAuth', id: '0hrsL4YxOAvva28w', env: 'production' },
      { service: 'HiBob', name: 'HiBob Service Account - Cross Dept', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'production' },
      { service: 'Google Gemini (CSM)', name: 'Google Gemini - Guesty - CS', type: 'googlePalmApi', id: 'w2UVOXsARkCmAsOu', env: 'production' },
      { service: 'Zendesk (OAuth2)', name: 'Zendesk Production - Read - OAuth2 Generic - Cross Dept', type: 'oAuth2Api', id: 'B1ksdYFDJ8LJKaTJ', env: 'production' },
      { service: 'BigQuery (CS Read)', name: 'Google Service Account n8n-ai-cx-read - Cross Dept', type: 'googleApi', id: 'VQ7CU7dKViVcv8Ah', env: 'production' },
      { service: 'BigQuery (n8n CS)', name: 'n8n CS Read', type: 'googleApi', id: 'IPuoHnXTeledx3UW', env: 'production' },
      { service: 'Google Sheets 69', name: 'Google Sheets account 69', type: 'googleSheetsOAuth2Api', id: 'q3XVQiSUNn6QTd3Y', env: 'production' },
      { service: 'Google Sheets Trigger (Roni)', name: 'Google Sheets Trigger - @RoniShif', type: 'googleSheetsTriggerOAuth2Api', id: '6LuTruhh0yhTE5F3', env: 'production' },
      { service: 'Slack', name: 'Slack - @Who App - AI Team', type: 'slackApi', id: '7H6auF31TpX7Wk7M', env: 'production' },
      { service: 'Slack (Roni)', name: 'Slack - @ronishif - CS', type: 'slackOAuth2Api', id: 'wg7EWUJRwvP0yB5c', env: 'production' },
      { service: 'Gmail', name: 'Gmail - @Ronishif - CS', type: 'gmailOAuth2', id: '3XKWZw8KuGVggGEH', env: 'production' },
      { service: 'OpenAI', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
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
    credentials: [
      // ── Sandbox ──
      { service: 'Zendesk (Sandbox)', name: 'Zendesk Sandbox - Info@guesty', type: 'zendeskApi', id: 'OTFp18SnDgGUSn9u', env: 'sandbox' },
      { service: 'Google Gemini (CX)', name: 'Google Gemini Guesty n8n CX', type: 'googlePalmApi', id: 'JrzPwNiVhZibKlAr', env: 'sandbox' },
      { service: 'Google Translate', name: 'Google Service Account - CX translate', type: 'googleApi', id: 'PAAimNTryrvB72dp', env: 'sandbox' },
      { service: 'Google Sheets (Inbal)', name: 'Inbal - Google Sheets', type: 'googleSheetsOAuth2Api', id: 'vkdgHYUQNhtG8jsq', env: 'sandbox' },
      // ── Production: Zendesk ──
      { service: 'Zendesk', name: 'Zendesk production - info@guesty.com', type: 'zendeskApi', id: 'I0sSUZvS0LVHjO2J', env: 'production' },
      { service: 'Zendesk (CX AI Agent)', name: 'CX AI Agent', type: 'zendeskApi', id: '1YeTFsUZflTUgSAL', env: 'production' },
      { service: 'Zendesk (Automations)', name: 'cx_automations@guesty.com', type: 'zendeskApi', id: 'kJ5WD6rCXzB0uyKa', env: 'production' },
      { service: 'Zendesk (Main)', name: 'Zendesk account', type: 'zendeskApi', id: 'cFdFPhADfsxMmPFC', env: 'production' },
      // ── Production: Zuora ──
      { service: 'Zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      // ── Production: Google AI ──
      { service: 'Google Gemini (PaLM 2)', name: 'Google Gemini(PaLM) Api account 2', type: 'googlePalmApi', id: 'bvrV6UBbFgHdfx0G', env: 'production' },
      { service: 'Google Gemini (PaLM)', name: 'Google Gemini(PaLM) Api account', type: 'googlePalmApi', id: 'zLbU4Ppa0sCk3avU', env: 'production' },
      { service: 'OpenAI', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'OpenAI (NSAT)', name: 'NSAT N8N only', type: 'openAiApi', id: 'IqN9B2jFalWegjur', env: 'production' },
      { service: 'LiteLLM', name: 'LiteLLM', type: 'openAiApi', id: '27qQ13au01z8Ufs7', env: 'production' },
      // ── Production: Google Workspace ──
      { service: 'Gmail (CX Automations)', name: 'Gmail - cx_automations@guesty.com', type: 'gmailOAuth2', id: '4BConxQW0qmylDKE', env: 'production' },
      { service: 'Google Sheets (CX)', name: 'Google Sheets - cx_automations@guesty.com', type: 'googleSheetsOAuth2Api', id: '7ORQ8IRh8B5Gh30x', env: 'production' },
      { service: 'Google Sheets (Kurt)', name: 'Google Sheets account - Kurt P', type: 'googleSheetsOAuth2Api', id: 'LwIN9HXxRfbtb0xy', env: 'production' },
      { service: 'Google Sheets Trigger (Kurt)', name: 'Google Sheets Trigger - Kurt', type: 'googleSheetsTriggerOAuth2Api', id: 'Muib6cP4QYhqDyQy', env: 'production' },
      { service: 'Google Docs (CX)', name: 'CX Automation', type: 'googleDocsOAuth2Api', id: 'vFQAQugW0DywClzX', env: 'production' },
      { service: 'Google Drive (CX)', name: 'CXAutomations - Drive access', type: 'googleDriveOAuth2Api', id: 'QF9qQq5kC8xrZ2EA', env: 'production' },
      // ── Production: BigQuery ──
      { service: 'BigQuery (SA)', name: 'Google Service Account account', type: 'googleApi', id: '2EJkTXIICSEva3cQ', env: 'production' },
      // ── Production: Slack ──
      { service: 'Slack (Bot)', name: 'Slack account - BotToken', type: 'slackApi', id: 'RdxjTWVc6DaiNrIY', env: 'production' },
      { service: 'Slack (App User)', name: 'Slack - App_UserOAuth Token', type: 'slackApi', id: 'oaJpbo4QLikJ3j8c', env: 'production' },
      { service: 'Slack (UserMain)', name: 'Slack - UserMain', type: 'slackOAuth2Api', id: 'AePQZCpFJGTgbQj7', env: 'production' },
      // ── Production: Jira ──
      { service: 'Jira', name: 'Jira SW Cloud Training', type: 'jiraSoftwareCloudApi', id: 'kCkJqmNJ9XOn9knx', env: 'production' },
      // ── Production: Other ──
      { service: 'Airtable', name: 'Airtable Read Only', type: 'airtableTokenApi', id: 'v24j1xVtP1ISlLfG', env: 'production' },
      { service: 'n8n (self)', name: 'n8n account', type: 'n8nApi', id: 'UXyTfYKFugulfWX2', env: 'production' },
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
      { service: 'Salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Zendesk', name: 'Zendesk production - info@guesty.com', type: 'zendeskApi', id: 'I0sSUZvS0LVHjO2J', env: 'production' },
      { service: 'Zendesk (OAuth2)', name: 'Zendesk Production - Read - OAuth2 Generic', type: 'oAuth2Api', id: 'B1ksdYFDJ8LJKaTJ', env: 'production' },
      { service: 'Modjo (OB)', name: 'OB - Modjo - AI Team v2', type: 'httpHeaderAuth', id: '86AbuOAwd0fFd1k6', env: 'production' },
      { service: 'Google Gemini', name: 'Gemini - AI Team', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'production' },
      { service: 'OpenAI', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'Slack', name: 'Slack - AI Team (Kurt)', type: 'slackOAuth2Api', id: 'BXeGv4HZaOauuct6', env: 'production' },
      { service: 'BigQuery (OB SA)', name: '(OB) Service Account - AI Team', type: 'googleApi', id: 'jTPSwPeDuM4ipl69', env: 'production' },
    ],
    promptRules: `<department_rules>
Prefer native Salesforce and Zendesk nodes over BigQuery for direct CRM/ticket operations.
For Guesty account data (plans, features, integrations, listings), use BigQuery datalake_glue.accounts.
Avoid Code nodes -- Onboarding users are non-technical.
</department_rules>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENTS — n8n project: ahDlEt5r1gShUBKY (11 workflows)
  // Has a sandbox Slack channel for testing.
  // ═══════════════════════════════════════════════════════════════════════════
  payments: {
    id: 'payments',
    displayName: 'Payments',
    description: 'Payment processing, billing, and fee reconciliation workflows',
    specs: ['zuora', 'salesforce', 'admin_data'],
    n8nProjectId: 'ahDlEt5r1gShUBKY',
    credentials: [
      // ── Sandbox ──
      { service: 'Slack (Test)', name: 'Slack ask-pay-test', type: 'slackApi', id: '0l2bJ3SquNB8nyFd', env: 'sandbox' },
      // ── Production ──
      { service: 'Zendesk', name: 'Zendesk account', type: 'zendeskApi', id: 'cFdFPhADfsxMmPFC', env: 'production' },
      { service: 'Google Gemini (Payments)', name: 'Payments', type: 'googlePalmApi', id: 'p77YTdHfPZTSa9e9', env: 'production' },
      { service: 'OpenAI', name: 'Gil OpenAi account', type: 'openAiApi', id: 'FyoNWUsGsy9o6xdh', env: 'production' },
      { service: 'Google Drive (Payments)', name: 'n8n-payments', type: 'googleApi', id: 'aLlYQkLWrmANkfFZ', env: 'production' },
      { service: 'Google Sheets Trigger', name: 'Google Sheets Elena Chechik', type: 'googleSheetsTriggerOAuth2Api', id: 'W6Zn2BYAkgmc1t8W', env: 'production' },
      { service: 'Slack', name: 'Slack ask-pay', type: 'slackApi', id: '87t2GgsbEJDItDs7', env: 'production' },
      // Note: Zuora (GbVP08J912cXYfH4) and Salesforce (fCB6gfK7EaGpMnZy) accessed via CX project
      { service: 'Zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      { service: 'Salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
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
  // FINANCE — sandbox: WrQXt2ZvpTq5Lkzo | production: EuTGww8zaCWPb8Cr (22 workflows)
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
      { service: 'Zendesk (Sandbox)', name: 'Zendesk Sandbox - Info@guesty.com', type: 'zendeskApi', id: 'OTFp18SnDgGUSn9u', env: 'sandbox' },
      // ── Production ──
      { service: 'Zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      { service: 'Salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Salesforce (Finance)', name: 'Salesforce account 17', type: 'salesforceOAuth2Api', id: 'kajhw4Ar6xiRUWS6', env: 'production' },
      { service: 'HiBob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'production' },
      { service: 'Zendesk (Read Only)', name: 'Zendesk Production - read only', type: 'oAuth2Api', id: '1SdAw6N3Ln7Y9Myw', env: 'production' },
      { service: 'Google Gemini', name: 'Google Gemini Guesty n8n CX', type: 'googlePalmApi', id: 'JrzPwNiVhZibKlAr', env: 'production' },
      { service: 'Docebo', name: 'Docebo Bearer Access Token', type: 'httpHeaderAuth', id: 'FoTHzLs4zV4PF4Qw', env: 'production' },
      { service: 'Google Sheets', name: 'Google Sheets account 70', type: 'googleSheetsOAuth2Api', id: 'iA1JZiIZhXYHkVaS', env: 'production' },
      { service: 'Google Sheets Trigger', name: 'Google Sheets Trigger account 17', type: 'googleSheetsTriggerOAuth2Api', id: 'g9QbIBYSVEyY4z5L', env: 'production' },
      { service: 'Google Calendar', name: 'Google Calendar account 106', type: 'googleCalendarOAuth2Api', id: 'uWNZXrR1NCrZ1xr0', env: 'production' },
      { service: 'Slack', name: 'bot_user_oauth_token_slack_app_workflows_builder', type: 'slackApi', id: 'g3NQlNzyjFofD87l', env: 'production' },
    ],
    promptRules: `<department_rules>
Avoid Code nodes — Finance users are non-technical.
For cross-source fee/invoice analysis, BigQuery is preferred (zuora_analytics + guesty_analytics joins).
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

  const header = '| Service | n8n Credential Name | Credential JSON Key | ID |';
  const divider = '|---------|---------------------|---------------------|-----|';

  const sections: string[] = [];

  if (sandboxCreds.length > 0) {
    sections.push(
      '### Sandbox (default)',
      header,
      divider,
      ...sandboxCreds.map(c => `| ${c.service} | ${c.name} | \`${c.type}\` | \`${c.id}\` |`),
    );
  }

  if (productionCreds.length > 0) {
    sections.push(
      '',
      '### Production (use only when user requests production)',
      header,
      divider,
      ...productionCreds.map(c => `| ${c.service} | ${c.name} | \`${c.type}\` | \`${c.id}\` |`),
    );
  }

  sections.push(
    '',
    '**IMPORTANT: Use ONLY credentials from the tables above.** Default to **sandbox** credentials. Only use production when the user explicitly requests it.',
    'The "Credential JSON Key" column is the key to use in workflow JSON: `"credentials": { "<key>": { "id": "...", "name": "..." } }`',
    'Always include both `id` and `name` in credential JSON. The `id` is authoritative for resolution.',
  );

  // Add programmatic JSON examples for commonly confused credential types
  // Dept-specific credentials first so examples prefer them over shared defaults
  const examples = generateCredentialExamples([...dept.credentials, ...SHARED_CREDENTIALS]);
  if (examples) {
    sections.push(examples);
  }

  return sections.join('\n');
}

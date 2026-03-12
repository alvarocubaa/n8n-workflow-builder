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
      // Google Service Accounts
      { service: 'Google SA (Marketing)', name: 'Google Service Account n8n-marketing', type: 'googleApi', id: 'Cr2rXAGCh1K5pJop', env: 'sandbox' },
      { service: 'Google SA (BQ #2)', name: 'Google Service Account account 2', type: 'googleApi', id: 'foNPffWDTPUndZtD', env: 'sandbox' },
      { service: 'Google SA (Translate)', name: 'Google Service Account - CX translate', type: 'googleApi', id: 'PAAimNTryrvB72dp', env: 'sandbox' },
      // Google Docs
      { service: 'Google Docs', name: 'Google Docs account 11', type: 'googleDocsOAuth2Api', id: 'sgzXeonPZK1apIGE', env: 'sandbox' },
      { service: 'Google Docs (Nechama)', name: "Nechama's Google Docs account", type: 'googleDocsOAuth2Api', id: 'OeU2XvTnmWi9wjlC', env: 'sandbox' },
      // Google Drive
      { service: 'Google Drive', name: 'Google Drive account 17', type: 'googleDriveOAuth2Api', id: 'VYYOBJ5NcCzuOlHn', env: 'sandbox' },
      { service: 'Google Drive (Erik)', name: "Erik's Guesty Google Drive", type: 'googleDriveOAuth2Api', id: 'X2f4iJbsdyKh8JwR', env: 'sandbox' },
      // Google Gemini
      { service: 'Google Gemini', name: 'Google Gemini Guesty n8n Marketing', type: 'googlePalmApi', id: 'LL8fLgZSrUn8oZtV', env: 'sandbox' },
      // Google Sheets
      { service: 'Google Sheets', name: 'Google Sheets account 64', type: 'googleSheetsOAuth2Api', id: 'LaWDjKMsqe74XASy', env: 'sandbox' },
      { service: 'Google Sheets (Assaf)', name: "Assaf's Gsheet", type: 'googleSheetsOAuth2Api', id: 'EDO1bmcTulXX52OG', env: 'sandbox' },
      { service: 'Google Sheets Trigger', name: 'Google Sheets Trigger account 13', type: 'googleSheetsTriggerOAuth2Api', id: 'D8pj4nOG0SuFxj5h', env: 'sandbox' },
      // Facebook / Meta
      { service: 'Facebook Graph', name: 'Facebook Graph account 2', type: 'facebookGraphApi', id: 'Ieb5eo9DMkpgO9gU', env: 'sandbox' },
      // Trustpilot
      { service: 'Trustpilot (public)', name: 'Trustpilot', type: 'httpHeaderAuth', id: 'zLLyVK7WyGS5CrWO', env: 'sandbox' },
      { service: 'Trustpilot (private)', name: 'trustpilot private', type: 'oAuth2Api', id: '49EwCqcxZalW8LTC', env: 'sandbox' },
      // Modjo
      { service: 'Modjo', name: 'Modjo', type: 'httpHeaderAuth', id: '0hrsL4YxOAvva28w', env: 'sandbox' },
      // LlamaIndex
      { service: 'LlamaIndex', name: 'LlamaIndex [Marketing Sandbox]', type: 'httpHeaderAuth', id: 'cE79dMtRPKcFvBJT', env: 'sandbox' },
      // Firecrawl
      { service: 'Firecrawl', name: 'firecrawl', type: 'httpBearerAuth', id: 'ngaBlIhFMFTZFajQ', env: 'sandbox' },
      // HiBob
      { service: 'HiBob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'sandbox' },
      // Monday.com
      { service: 'Monday.com', name: 'Monday.com API', type: 'mondayComApi', id: 'XsKPBAGItELeiJ8S', env: 'sandbox' },
      // Salesforce
      { service: 'Salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'sandbox' },
      // Slack
      { service: 'Slack (Ron)', name: "Ron's Slack credentials", type: 'slackOAuth2Api', id: 'MkMAiC1ecfpYtIz1', env: 'sandbox' },
      { service: 'Slack (Assaf)', name: "Assaf's Slack Connection", type: 'slackOAuth2Api', id: '5Ii5X9IFid1S8rIE', env: 'sandbox' },
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
    specs: ['salesforce', 'csm', 'hibob', 'jira', 'marketplace'],
    n8nProjectId: 'kh5kTQJhrQ8KNoSC',
    credentials: [
      // ── Sandbox ──
      { service: 'Salesforce (Sandbox)', name: 'Salesforce Partial Sandbox', type: 'salesforceOAuth2Api', id: 'aBjJNGRAjYF66z5F', env: 'sandbox' },
      { service: 'Google Gemini (AI Team)', name: 'Gemini - AI Team', type: 'googlePalmApi', id: 'FSUdg9cOOhjJ5bfh', env: 'sandbox' },
      // ── Production ──
      { service: 'Salesforce', name: 'Salesforce Production Read', type: 'salesforceOAuth2Api', id: 'fCB6gfK7EaGpMnZy', env: 'production' },
      { service: 'Modjo', name: 'AI Team - v2 (Modjo)', type: 'httpHeaderAuth', id: 'F7aaemlCF4AOev8s', env: 'production' },
      { service: 'HiBob', name: 'HiBob Service Account', type: 'httpBasicAuth', id: 'i1wp4rmLyhytsxPj', env: 'production' },
      { service: 'Google Gemini (CSM)', name: 'Google Gemini Guesty n8n8 CSM', type: 'googlePalmApi', id: 'w2UVOXsARkCmAsOu', env: 'production' },
      { service: 'Zendesk (OAuth2)', name: 'Zendesk Production - Read - OAuth2 Generic', type: 'oAuth2Api', id: 'B1ksdYFDJ8LJKaTJ', env: 'production' },
      { service: 'BigQuery (Read)', name: 'Google Service Account n8n-ai-cx-read', type: 'googleApi', id: 'VQ7CU7dKViVcv8Ah', env: 'production' },
      { service: 'Google Sheets', name: 'Google Sheets account 55', type: 'googleSheetsOAuth2Api', id: 'YYBfN3jdWCRUKtmb', env: 'production' },
      { service: 'Google Docs', name: 'Google Docs account 8', type: 'googleDocsOAuth2Api', id: 'M9Nr0Z9BWYCgb3a4', env: 'production' },
      { service: 'Google Drive', name: 'Google Drive account - ron.madar.hallevi', type: 'googleDriveOAuth2Api', id: '0dsR60mVu0IfoZ2N', env: 'production' },
      { service: 'Slack', name: 'Slack account 77', type: 'slackApi', id: '7H6auF31TpX7Wk7M', env: 'production' },
      { service: 'Gmail', name: 'Gmail account 47', type: 'gmailOAuth2', id: '3XKWZw8KuGVggGEH', env: 'production' },
      { service: 'OpenAI', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
    ],
    promptRules: `<department_rules>
Prefer the native Salesforce node over BigQuery for direct Salesforce CRM operations (owner, pipeline, opportunities).
For Guesty account data (plans, features, integrations, listings), use BigQuery datalake_glue.accounts.
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
      { service: 'Zendesk (Sandbox)', name: 'Zendesk sandbox', type: 'zendeskApi', id: 'PEFCagywCPGDJGjg', env: 'sandbox' },
      { service: 'Zendesk (Sandbox RW)', name: 'Zendesk Sandbox - Read and Write - OAuth2 Generic', type: 'oAuth2Api', id: 'A7d4a6CBhZl6J7pA', env: 'sandbox' },
      // ── Production: Zendesk ──
      { service: 'Zendesk', name: 'Zendesk production - info@guesty.com', type: 'zendeskApi', id: 'I0sSUZvS0LVHjO2J', env: 'production' },
      { service: 'Zendesk (CX AI Agent)', name: 'CX AI Agent', type: 'zendeskApi', id: '1YeTFsUZflTUgSAL', env: 'production' },
      { service: 'Zendesk (Automations)', name: 'cx_automations@guesty.com', type: 'zendeskApi', id: 'kJ5WD6rCXzB0uyKa', env: 'production' },
      // ── Production: Salesforce ──
      // (uses shared Salesforce Production Read — not duplicated here; see SHARED or request via join)
      // ── Production: Zuora ──
      { service: 'Zuora', name: 'zuora', type: 'oAuth2Api', id: 'GbVP08J912cXYfH4', env: 'production' },
      // ── Production: Google AI ──
      { service: 'Google Gemini (CX)', name: 'Google Gemini Guesty n8n CX', type: 'googlePalmApi', id: 'JrzPwNiVhZibKlAr', env: 'production' },
      { service: 'OpenAI', name: 'AI Team - OpenAI', type: 'openAiApi', id: 'sibRkht3HDN1V5lW', env: 'production' },
      { service: 'OpenAI (NSAT)', name: 'NSAT N8N only', type: 'openAiApi', id: 'IqN9B2jFalWegjur', env: 'production' },
      // ── Production: Google Workspace ──
      { service: 'Gmail (CX Automations)', name: 'Gmail - cx_automations@guesty.com', type: 'gmailOAuth2', id: '4BConxQW0qmylDKE', env: 'production' },
      { service: 'Google Sheets (CX)', name: 'Google Sheets - cx_automations@guesty.com', type: 'googleSheetsOAuth2Api', id: '7ORQ8IRh8B5Gh30x', env: 'production' },
      { service: 'Google Docs (CX)', name: 'CX Automation', type: 'googleDocsOAuth2Api', id: 'vFQAQugW0DywClzX', env: 'production' },
      { service: 'Google Drive (CX)', name: 'CXAutomations - Drive access', type: 'googleDriveOAuth2Api', id: 'QF9qQq5kC8xrZ2EA', env: 'production' },
      { service: 'Google Translate', name: 'Google Service Account - CX translate', type: 'googleApi', id: 'PAAimNTryrvB72dp', env: 'production' },
      // ── Production: BigQuery ──
      { service: 'BigQuery (CX)', name: 'Google BigQuery account 3', type: 'googleApi', id: 'vWwsUUkc4EYrtsmN', env: 'production' },
      { service: 'BigQuery (SA)', name: 'Google Service Account account', type: 'googleApi', id: '2EJkTXIICSEva3cQ', env: 'production' },
      // ── Production: Slack ──
      { service: 'Slack (Bot)', name: 'Slack account - BotToken', type: 'slackApi', id: 'RdxjTWVc6DaiNrIY', env: 'production' },
      // ── Production: Jira ──
      { service: 'Jira', name: 'Jira SW Cloud Training', type: 'jiraSoftwareCloudApi', id: 'kCkJqmNJ9XOn9knx', env: 'production' },
      // ── Production: Other ──
      { service: 'Airtable', name: 'Airtable Read Only', type: 'airtableTokenApi', id: 'v24j1xVtP1ISlLfG', env: 'production' },
      { service: 'n8n (self)', name: 'n8n account', type: 'n8nApi', id: 'UXyTfYKFugulfWX2', env: 'production' },
    ],
    promptRules: `<department_rules>
Prefer native Zendesk and Salesforce nodes over BigQuery for direct CRM/ticket operations.
For Guesty account data (plans, features, integrations, listings), use BigQuery datalake_glue.accounts.
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
    // Find first credential matching this service (case-insensitive, partial match)
    const cred = creds.find(c =>
      c.service.toLowerCase().includes(service.toLowerCase()) ||
      (service === 'BigQuery' && c.type === 'googleApi' && c.service.toLowerCase().includes('google'))
    );
    if (!cred) continue;

    const wrongType = WRONG_TYPES[cred.type] ?? `${cred.type}Wrong`;
    examples.push(
      `${service} in this department:`,
      `  Correct: "credentials": { "${cred.type}": { "id": "${cred.id}", "name": "${cred.name}" } }`,
      `  Wrong:   "credentials": { "${wrongType}": { "id": "...", "name": "${cred.name} - Cross Dept" } }`,
    );
  }

  if (examples.length === 0) return '';

  return [
    '',
    '<credential_examples>',
    'When building workflow JSON, credential blocks must look EXACTLY like these examples.',
    'Copy the type, id, and name character-for-character from the table above.',
    '',
    ...examples,
    '',
    'Never append suffixes (e.g., "- Cross Dept", "- Read Only") to credential names.',
    'Never fabricate credential IDs not in the table above.',
    '</credential_examples>',
  ].join('\n');
}

/**
 * Get all credentials for a department (shared + own), formatted as markdown tables.
 * Groups by environment: sandbox first (default), then production.
 * Includes programmatic JSON examples for commonly confused credential types.
 */
export function getDepartmentCredentialsMarkdown(dept: DepartmentConfig): string {
  const allCreds = [...SHARED_CREDENTIALS, ...dept.credentials];

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
  const examples = generateCredentialExamples(allCreds);
  if (examples) {
    sections.push(examples);
  }

  return sections.join('\n');
}

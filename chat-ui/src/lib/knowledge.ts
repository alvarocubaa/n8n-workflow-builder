import fs from 'fs';
import path from 'path';
import { getDepartment, getDepartmentCredentialsMarkdown } from './departments';

// ─── Directory configuration ──────────────────────────────────────────────────
// Local dev:   set SKILLS_DIR / SPECS_DIR in .env.local (or docker-compose volumes)
// Cloud Run:   files baked into image at /app/knowledge/skills and /app/knowledge/specs

const SKILLS_DIR =
  process.env.SKILLS_DIR ?? path.join(process.cwd(), 'knowledge', 'skills');
const SPECS_DIR =
  process.env.SPECS_DIR ?? path.join(process.cwd(), 'knowledge', 'specs');

// ─── Skill map ────────────────────────────────────────────────────────────────
// Maps short keys (used in tool calls) to subdirectory names in SKILLS_DIR.
// Each subdirectory contains a SKILL.md with the full expert guide.

const SKILL_DIR_MAP: Record<string, string> = {
  javascript:  'n8n-code-javascript',
  python:      'n8n-code-python',
  expressions: 'n8n-expression-syntax',
  mcp_tools:   'n8n-mcp-tools-expert',
  node_config: 'n8n-node-configuration',
  validation:  'n8n-validation-expert',
  patterns:    'n8n-workflow-patterns',
};

// ─── Company spec map ─────────────────────────────────────────────────────────
// Maps short keys to flat filenames in SPECS_DIR (0000_Master layout).

const SPEC_FILE_MAP: Record<string, string> = {
  salesforce:  '02_SRC_Salesforce_Spec.md',
  zendesk:     '02_SRC_Zendesk_Spec.md',
  jira:        '02_SRC_Jira_Spec.md',
  hubspot:     '02_SRC_Hubspot_Spec.md',
  csm:         '02_SRC_CSM_Spec.md',
  modjo:       '02_SRC_CSM_Spec.md',       // alias — Modjo is now part of CSM spec
  zuora:       '02_SRC_Zuora_Spec.md',
  hibob:       '02_SRC_Hibob_Spec.md',
  siit:        '02_SRC_Siit_Spec.md',
  gus:         '02_SRC_Gus_Spec.md',
  admin_data:  '02_SRC_AdminData_Spec.md',
  marketplace: '02_SRC_Marketplace_Spec.md',
  credentials: '01_INFRA_Credentials_Guide.md',
  join_map:    '03_JOIN_MAP.md',
};

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Read a skill guide for a given skill key.
 *
 * By default returns SKILL.md (the main guide) plus a list of available
 * supporting reference files. If `file` is provided, returns that specific
 * supporting file instead.
 *
 * Returns an error string if the key is unknown or the file is missing
 * (so the model sees a useful message instead of throwing).
 */
export function readSkill(skillKey: string, file?: string): string {
  const dir = SKILL_DIR_MAP[skillKey];
  if (!dir) {
    return `Unknown skill: "${skillKey}". Valid keys: ${Object.keys(SKILL_DIR_MAP).join(', ')}`;
  }
  const skillDir = path.join(SKILLS_DIR, dir);

  // If a specific supporting file is requested, return just that file
  if (file) {
    const filePath = path.join(skillDir, `${file}.md`);
    if (!fs.existsSync(filePath)) {
      return `File "${file}.md" not found in ${dir}. Available: ${listSupportingFiles(skillDir)}`;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  // Default: return SKILL.md (the main guide)
  const mainFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(mainFile)) {
    return `Skill file not found at ${mainFile}. Check that SKILLS_DIR is mounted correctly.`;
  }

  let content = fs.readFileSync(mainFile, 'utf-8');

  // Append list of available supporting files so the model can request them if needed
  const supporting = listSupportingFiles(skillDir);
  if (supporting) {
    content += `\n\n---\nAdditional reference files available (call get_n8n_skill with file parameter): ${supporting}`;
  }
  return content;
}

function listSupportingFiles(skillDir: string): string {
  try {
    return fs.readdirSync(skillDir)
      .filter(f => f.endsWith('.md') && f !== 'SKILL.md' && f !== 'README.md')
      .map(f => f.replace('.md', ''))
      .join(', ');
  } catch { return ''; }
}

/**
 * Read the spec file for a given company system key.
 *
 * When departmentId is provided and systemKey is 'credentials',
 * returns department-scoped credentials instead of the full guide.
 */
export function readCompanySpec(systemKey: string, departmentId?: string): string {
  // Department-scoped credentials
  if (systemKey === 'credentials' && departmentId) {
    const dept = getDepartment(departmentId);
    if (dept) {
      return `# ${dept.displayName} Department — Credentials Guide\n\n` +
        getDepartmentCredentialsMarkdown(dept) +
        '\n\nAlways include both `id` and `name` in credential JSON. The `id` is authoritative for resolution.';
    }
  }

  const file = SPEC_FILE_MAP[systemKey];
  if (!file) {
    return `Unknown system: "${systemKey}". Valid keys: ${Object.keys(SPEC_FILE_MAP).join(', ')}`;
  }
  const filePath = path.join(SPECS_DIR, file);
  if (!fs.existsSync(filePath)) {
    return `Spec file not found at ${filePath}. Check that SPECS_DIR is mounted correctly.`;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/** Expose key lists for use in system prompt generation. */
export const SKILL_KEYS = Object.keys(SKILL_DIR_MAP) as (keyof typeof SKILL_DIR_MAP)[];
export const SPEC_KEYS  = Object.keys(SPEC_FILE_MAP) as (keyof typeof SPEC_FILE_MAP)[];

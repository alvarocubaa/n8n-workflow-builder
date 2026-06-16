const TOOL_LABELS: Record<string, string> = {
  search_nodes: 'Searching n8n nodes',
  get_node: 'Loading node details',
  validate_node: 'Validating node',
  validate_workflow: 'Validating workflow',
  n8n_validate_workflow: 'Validating workflow',
  n8n_autofix_workflow: 'Autofixing workflow',
  get_company_spec: 'Reading data source spec',
  get_n8n_skill: 'Loading skill',
  search_templates: 'Searching templates',
  get_template: 'Loading template',
  tools_documentation: 'Reading tool docs',
  n8n_create_workflow: 'Creating workflow in n8n',
  n8n_get_workflow: 'Reading n8n workflow',
  n8n_list_workflows: 'Listing workflows',
  n8n_update_full_workflow: 'Updating workflow',
  n8n_update_partial_workflow: 'Updating workflow',
  n8n_delete_workflow: 'Deleting workflow',
  n8n_deploy_template: 'Deploying template',
  n8n_test_workflow: 'Testing workflow',
  n8n_executions: 'Checking executions',
  n8n_health_check: 'Checking n8n status',
  n8n_workflow_versions: 'Reading workflow versions',
};

export function getToolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  return name
    .replace(/^n8n[-_]/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Workflow complexity scoring and ROI estimation.
 *
 * Complexity score (1–5) drives the "hours saved" estimate.
 * Hourly rate ($25) reflects non-technical staff self-serving
 * instead of filing dev requests.
 */

const HOURLY_RATE_USD = 25;

const HOURS_BY_COMPLEXITY: Record<number, number> = {
  1: 1.0,   // Simple webhook → Slack
  2: 2.5,   // Schedule + query + notification
  3: 5.0,   // Multi-step with transforms
  4: 10.0,  // SQL + multi-system + merge
  5: 20.0,  // AI agent + complex pipeline
};

export interface ComplexityResult {
  complexityScore: number;
  estimatedHoursSaved: number;
  estimatedValueUsd: number;
}

/**
 * Compute complexity from a parsed n8n workflow JSON.
 */
export function computeComplexity(workflowJson: string): ComplexityResult {
  let nodeCount = 0;
  let nodeTypes: string[] = [];
  let hasSqlQuery = false;
  let credentialTypeCount = 0;

  try {
    const wf = JSON.parse(workflowJson);
    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    nodeCount = nodes.length;
    nodeTypes = [...new Set<string>(nodes.map((n: { type?: string }) => n.type ?? ''))];
    hasSqlQuery = nodeTypes.some(t => t.includes('BigQuery') || t.includes('bigQuery'));

    // Count distinct credential types across all nodes
    const credTypes = new Set<string>();
    for (const node of nodes) {
      if (node.credentials && typeof node.credentials === 'object') {
        for (const key of Object.keys(node.credentials)) {
          credTypes.add(key);
        }
      }
    }
    credentialTypeCount = credTypes.size;
  } catch {
    // If JSON parsing fails, default to minimal complexity
  }

  // Node count points: 1–3 = 1pt, 4–7 = 2pt, 8+ = 3pt
  let score = nodeCount <= 3 ? 1 : nodeCount <= 7 ? 2 : 3;
  if (hasSqlQuery) score += 1;
  if (credentialTypeCount >= 2) score += 1;
  score = Math.min(score, 5);

  const estimatedHoursSaved = HOURS_BY_COMPLEXITY[score] ?? 1.0;
  const estimatedValueUsd = estimatedHoursSaved * HOURLY_RATE_USD;

  return { complexityScore: score, estimatedHoursSaved, estimatedValueUsd };
}

/**
 * Extract workflow metadata for analytics logging.
 */
export function extractWorkflowMeta(workflowJson: string): {
  nodeCount: number;
  nodeTypes: string[];
  hasSqlQuery: boolean;
} {
  try {
    const wf = JSON.parse(workflowJson);
    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    const nodeTypes = [...new Set<string>(nodes.map((n: { type?: string }) => n.type ?? ''))];
    const hasSqlQuery = nodeTypes.some(t => t.includes('BigQuery') || t.includes('bigQuery'));
    return { nodeCount: nodes.length, nodeTypes, hasSqlQuery };
  } catch {
    return { nodeCount: 0, nodeTypes: [], hasSqlQuery: false };
  }
}

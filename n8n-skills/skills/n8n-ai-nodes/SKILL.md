# n8n AI/LLM Nodes -- Expert Guide

## When to use which node

| Node | Use case | Complexity |
|------|----------|-----------|
| **Basic LLM Chain** (`chainLlm`) | Single-prompt tasks: classify, summarize, extract, evaluate | Low |
| **AI Agent** (`agent`) | Multi-step reasoning with tool access, autonomous decisions | High |

**Default to chainLlm** for qualification engines, classification, data extraction, and evaluation tasks. It is simpler, more predictable, and easier for non-technical users to understand.

Use AI Agent only when the workflow needs tool-calling autonomy (e.g., search web, query database, then decide next step).

---

## Architecture: Chain + Sub-node

AI nodes in n8n use a two-node pattern: a **chain node** (main workflow node) connected to a **language model sub-node** via the `ai_languageModel` input type.

```
[Previous Node] --> [Basic LLM Chain] --ai_languageModel--> [Gemini/OpenAI sub-node]
```

Two nodes in the JSON, one special connection:

```json
"connections": {
  "Previous Node": {
    "main": [[{ "node": "AI Qualification Engine", "type": "main", "index": 0 }]]
  },
  "AI Qualification Engine": {
    "ai_languageModel": [
      [{ "node": "Gemini LM", "type": "ai_languageModel", "index": 0 }]
    ]
  }
}
```

The LM sub-node has NO outgoing connections -- it feeds back into the chain node, which outputs on `main`.

---

## Configuring Basic LLM Chain (`@n8n/n8n-nodes-langchain.chainLlm` v1.9)

```json
{
  "type": "@n8n/n8n-nodes-langchain.chainLlm",
  "typeVersion": 1.9,
  "parameters": {
    "promptType": "define",
    "text": "={{ $json.fieldToAnalyze }}",
    "messages": {
      "messageValues": [
        {
          "type": "SystemMessagePromptTemplate",
          "message": "You are a classification engine. Return JSON only, no markdown."
        },
        {
          "type": "HumanMessagePromptTemplate",
          "message": "Classify this record: {{ $json.fieldToAnalyze }}"
        }
      ]
    },
    "hasOutputParser": false
  }
}
```

Key parameters:
- `promptType`: `"define"` for custom prompts (not `"auto"` which requires a connected chat trigger)
- `text`: the main input expression -- typically references data from the previous node
- `messages.messageValues[]`: array of `{type, message}` objects for system/human/AI messages
  - `SystemMessagePromptTemplate`: system instructions
  - `HumanMessagePromptTemplate`: the user-facing prompt template
  - `AIMessagePromptTemplate`: few-shot AI response examples
- `hasOutputParser`: set `true` to connect a structured output parser sub-node (advanced)

Output: `$json.text` (raw LLM text string)

---

## Configuring Google Gemini sub-node (`@n8n/n8n-nodes-langchain.lmChatGoogleGemini` v1)

```json
{
  "type": "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
  "typeVersion": 1,
  "parameters": {
    "modelName": "models/gemini-2.5-flash",
    "options": {
      "temperature": 0
    }
  },
  "credentials": {
    "googlePalmApi": {
      "id": "<from department table>",
      "name": "<from department table>"
    }
  }
}
```

Key parameters:
- **Credential type**: `googlePalmApi` (this is the correct type even though the UI shows "Google Gemini")
- `modelName`: `"models/gemini-2.5-flash"` (fast, cheap) or `"models/gemini-1.5-pro-latest"` (more capable)
- `options.temperature`: 0 for deterministic (classification, extraction), 0.3-0.7 for creative tasks
- `options.maxOutputTokens`: default 2048, increase for long outputs
- `options.topK`, `options.topP`: optional sampling controls

---

## Configuring OpenAI sub-node (`@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3)

```json
{
  "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  "typeVersion": 1.3,
  "parameters": {
    "model": {
      "mode": "list",
      "value": "gpt-5-mini"
    },
    "options": {
      "temperature": 0,
      "responseFormat": "json_object"
    }
  },
  "credentials": {
    "openAiApi": {
      "id": "<from department table>",
      "name": "<from department table>"
    }
  }
}
```

Key parameters:
- **Credential type**: `openAiApi`
- `model`: resource locator format `{ "mode": "list", "value": "gpt-5-mini" }`
- `options.responseFormat`: `"json_object"` forces valid JSON output (recommended for structured extraction)
- `options.temperature`: same guidance as Gemini

---

## Parsing AI output

The chain node outputs `$json.text` (raw string). To extract structured fields:

**For <=5 fields** -- Use a Set node with expressions:
```
Field: category    Value: ={{ JSON.parse($json.text).category }}
Field: confidence  Value: ={{ JSON.parse($json.text).confidence }}
```

**For >5 fields** -- Use a Code node (exception to no-code-nodes rule):
```javascript
const parsed = JSON.parse($input.first().json.text);
return { json: { ...$input.first().json, ...parsed } };
```

**Critical**: Always instruct the AI in the system prompt to return JSON only, no markdown, no code fences. Example system message:
> "Return ONLY a JSON object with these fields: category, confidence, reason. No markdown, no code fences, no explanation."

**For OpenAI**: Use `responseFormat: "json_object"` to guarantee valid JSON output.

---

## Positioning sub-nodes in the canvas

Sub-nodes should be positioned below their parent chain node:

```json
{
  "name": "Gemini LM",
  "position": [800, 500],
  ...
}
```

If the chain node is at position `[800, 300]`, place the LM sub-node at approximately `[800, 500]` (200px below).

---

## Guesty credential mapping

Use the department credential table. Common AI credentials by type:
- **Google Gemini**: credential type `googlePalmApi`
- **OpenAI**: credential type `openAiApi`

Always check the department credential table for the correct name and ID. Prefer sandbox credentials per the ENVIRONMENT PRIORITY rule.

---

## Common patterns

### Classification/Qualification engine
Schedule Trigger -> BigQuery (fetch records) -> Basic LLM Chain (classify) -> If (route by result) -> Slack/Sheets (output)

### Data extraction
Webhook -> Basic LLM Chain (extract fields from payload) -> Set (parse JSON output) -> Google Sheets (write)

### Summarization
Schedule Trigger -> BigQuery (fetch data) -> Basic LLM Chain (summarize) -> Slack (post summary)

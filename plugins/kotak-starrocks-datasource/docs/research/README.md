# Research and session record

This folder records how the plugin was designed: what was asked, what was found, and what changed along the
way. The documents are in order (2026-10-27 to 2026-10-28). For the current, verified instructions, use
[`../AGENT_GUIDE.md`](../AGENT_GUIDE.md) and [`../QUESTIONS.md`](../QUESTIONS.md). Where these files disagree
with those two, those two win.

| # | Document | What it is |
|---|---|---|
| 00 | [Original request and context](00-original-request-and-context.md) | The original ask, the user's scope statements, the authz plan, and the org deployment context gathered from photos |
| 01 | [Initial analysis and options](01-initial-analysis-and-options.md) | First pass over the Grafana source: token forwarding exists, pooling is the hard part, and the options for identity, connections and delivery |
| 02 | [Plan review after the authz plan](02-plan-review-after-authz-plan.md) | External plugin chosen. Three gaps found: cleartext login, MCP, and "no config changes" |
| 03 | [Research prompts for other agents](03-research-prompts-for-other-agents.md) | The prompts the user ran in the deploy-config and IDAM-docs repos |
| 04 | [Findings from org repos and IDAM docs](04-findings-from-org-repos-and-idam-docs.md) | Opaque access tokens, no JWT login yet, no per-user Ranger policies; ID token vs access token |
| 05 | [Original implementation guide](05-original-implementation-guide.md) | The step-by-step guide written before implementing. Partly superseded; see its header |
| 06 | [StarRocks JWT auth: protocol analysis](06-starrocks-jwt-auth-source-analysis.md) | **Key finding:** StarRocks uses `authentication_openid_connect_client`, not `mysql_clear_password`. Source excerpts, experiments, the driver patch |
| 07 | [Grafana 12.0.1 internals reference](07-grafana-12-internals-reference.md) | Grafana and SDK behaviour the plugin relies on, with file and line references |
| 08 | [Implementation summary and test evidence](08-implementation-summary-and-test-evidence.md) | What was built, and the raw output of the integration, end-to-end and refresh tests |

The photos used as inputs (`referencepic/`: the deployment doc and the authz plan; `referencepic1/`: the
agents' findings) are not in this repository.

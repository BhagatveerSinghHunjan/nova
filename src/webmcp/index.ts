/**
 * NOVA WebMCP tools
 * External agents discover these capabilities through document.modelContext
 *
 * Judges: start here for browser-side WebMCP registration.
 * - NovaWebMcpRegistrar.tsx — client mount (layout)
 * - register-tools.ts — document.modelContext.registerTool (six tools only)
 * - tool-definitions.ts — names, titles, schemas, descriptions
 * - ../app/webmcp/actions.ts — thin server bridge → domain operations
 */

export { NovaWebMcpRegistrar } from "@/webmcp/NovaWebMcpRegistrar";
export { registerNovaWebMcpTools } from "@/webmcp/register-tools";
export { NOVA_WEBMCP_TOOLS } from "@/webmcp/tool-definitions";

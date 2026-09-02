"use client";

/**
 * NOVA WebMCP tools
 * External agents discover these capabilities through document.modelContext
 *
 * Client-only mount point: registers tools once per mount lifecycle and
 * unregisters via AbortSignal on cleanup (avoids duplicates on navigation /
 * React Strict Mode remounts). Does not polyfill WebMCP.
 */

import { useEffect } from "react";

import { registerNovaWebMcpTools } from "@/webmcp/register-tools";

export function NovaWebMcpRegistrar() {
  useEffect(() => {
    const controller = new AbortController();

    void registerNovaWebMcpTools(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  return null;
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * The foundation is intentionally inert. Runtime hooks, workers, tools, and
 * commands are added only by the later cutover checkpoint.
 */
export default function plasticMemoryExtension(_pi: ExtensionAPI): void {
  // Auto-discovery must remain safe while the foundation is disabled.
}

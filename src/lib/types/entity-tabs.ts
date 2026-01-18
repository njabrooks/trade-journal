/**
 * Entity tab configuration for detail pages.
 * This file is NOT a client component, so it can be imported from server components.
 */

export interface EntityTab {
  id: string;
  label: string;
  href: string;
}

/**
 * Helper to generate standard entity detail tabs.
 * Can be called from server components.
 */
export function createEntityTabs(
  basePath: string,
  entityId: string
): EntityTab[] {
  return [
    { id: 'overview', label: 'Overview', href: `${basePath}/${entityId}/overview` },
    { id: 'evidence', label: 'Evidence', href: `${basePath}/${entityId}/evidence` },
    { id: 'execution', label: 'Execution', href: `${basePath}/${entityId}/execution` },
  ];
}

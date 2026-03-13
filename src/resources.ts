import type { Resource } from '@modelcontextprotocol/sdk/types.js';

/**
 * All Vaiz MCP resource definitions, hardcoded for static analysis visibility.
 * At runtime these are merged with resources fetched from the remote backend —
 * remote definitions take precedence when URIs collide.
 */
export const VAIZ_RESOURCES: Resource[] = [
  {
    uri: 'vaiz://space/overview',
    name: 'vaiz-space-overview',
    description:
      'Current space overview with projects, members, and statistics',
    mimeType: 'application/json',
  },
  {
    uri: 'vaiz://system/dict/project-colors',
    name: 'vaiz-system-colors',
    description: 'Available color options for projects',
    mimeType: 'application/json',
  },
  {
    uri: 'vaiz://system/dict/icon-types',
    name: 'vaiz-system-icons',
    description: 'Available icon types catalog',
    mimeType: 'application/json',
  },
  {
    uri: 'vaiz://system/dict/task-priorities',
    name: 'vaiz-system-priorities',
    description: 'Task priority levels reference',
    mimeType: 'application/json',
  },
  {
    uri: 'vaiz://system/dict/notification-groups',
    name: 'vaiz-system-notification-groups',
    description: 'Notification groups reference',
    mimeType: 'application/json',
  },
  {
    uri: 'vaiz://system/dict/entity-kinds',
    name: 'vaiz-system-entity-kinds',
    description: 'Entity types reference',
    mimeType: 'application/json',
  },
  {
    uri: 'vaiz://system/help/index',
    name: 'vaiz-system-help-index',
    description:
      'Official Vaiz platform documentation. For user documents, use search or get_document.',
    mimeType: 'application/json',
  },
];

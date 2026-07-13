import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/**
 * All Vaiz MCP tool definitions, hardcoded for static analysis visibility.
 * At runtime these are merged with tools fetched from the remote backend —
 * remote definitions take precedence when names collide.
 */

/** Standard output envelope returned by every Vaiz tool as structuredContent. */
const OUTPUT_SCHEMA: Tool['outputSchema'] = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: 'Human-readable summary of the tool result.',
    },
    data: {
      description: 'Structured result payload when available.',
    },
  },
  required: ['message'],
};

function readAnnotations(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
}

function writeAnnotations(title: string): ToolAnnotations {
  return {
    title,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
}

const historyFilterProps = {
  limit: {
    type: 'number',
    minimum: 1,
    maximum: 100,
    default: 50,
    description: 'Maximum number of history entries to return (1-100).',
  },
  keys: {
    type: 'array',
    items: { type: 'string' },
    description: 'Include only history entries with these event keys.',
  },
  excludeKeys: {
    type: 'array',
    items: { type: 'string' },
    description: 'Exclude history entries with these event keys.',
  },
  dateRangeStart: {
    type: 'string',
    description: 'Include history on or after this ISO date.',
  },
  dateRangeEnd: {
    type: 'string',
    description: 'Include history on or before this ISO date.',
  },
  createdBy: {
    type: 'array',
    items: { type: 'string' },
    description: 'Filter by creator member IDs.',
  },
} as const;

export const VAIZ_TOOLS: Tool[] = [
  {
    name: 'search_space',
    description:
      'Search for entities in the current space (tasks, projects, users, comments, boards, user documents). Not system documentation.',
    annotations: readAnnotations('Search Space'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          enum: ['task', 'project', 'user', 'comment', 'board', 'document'],
          default: 'task',
          description: 'Entity type to search within the current space.',
        },
        query: {
          type: 'string',
          minLength: 1,
          description: 'Search keywords to match against entity names and content.',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of search results to return (1-50).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_tasks',
    description: `Get a filtered list of tasks with pagination. All filters are combined with AND logic.

Examples:
- My tasks: get_tasks(assignees: [myMemberId])
- All uncompleted: get_tasks(completed: false)
- High priority: get_tasks(priorities: ["3"])
- Specific board: get_tasks(boardId: "...")
- By type: get_tasks(types: ["typeId1", "typeId2"])
- By group: get_tasks(boardId: "...", groupId: "...")
- Created by member: get_tasks(createdBy: "memberId")
- Next page: get_tasks(skip: 50, limit: 50)`,
    annotations: readAnnotations('Get Tasks'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          description: 'Filter by board ID (24-char hex).',
        },
        projectId: {
          type: 'string',
          description: 'Filter by project ID (24-char hex).',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by assignee member IDs.',
        },
        completed: {
          type: 'boolean',
          description: 'Filter by completion status.',
        },
        priorities: {
          type: 'array',
          items: { type: 'string', enum: ['0', '1', '2', '3'] },
          description: 'Filter by priority levels: "0" General, "1" Low, "2" Medium, "3" High.',
        },
        milestones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by milestone IDs.',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by task type IDs.',
        },
        groupId: {
          type: 'string',
          description: 'Filter by board column/group ID (24-char hex).',
        },
        createdBy: {
          type: 'string',
          description: 'Filter by creator member ID.',
        },
        includeArchived: {
          type: 'boolean',
          default: false,
          description: 'When true, include archived tasks.',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: 'Page size (1-100).',
        },
        skip: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Number of tasks to skip for pagination.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    description:
      'Get detailed information about a specific task by database ID or HRID (e.g., "PRJ-123")',
    annotations: readAnnotations('Get Task'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          minLength: 1,
          description: 'Task identifier: 24-char database ID or HRID (e.g. "PRJ-123").',
        },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the Vaiz workspace',
    annotations: writeAnnotations('Create Task'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Task creation payload. Requires name and boardId.',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              description: 'Task title shown in the board.',
            },
            boardId: {
              type: 'string',
              minLength: 1,
              description: 'Target board ID (24-char hex). Use list_projects to find board IDs.',
            },
            groupId: {
              type: 'string',
              description: 'Board column/group ID. Defaults to the first group when omitted.',
            },
            description: {
              type: 'string',
              description:
                'Task document content in Markdown format. Supports headings, lists, code blocks, tables, etc. Converted to rich document content automatically.',
            },
            priority: {
              type: 'string',
              enum: ['0', '1', '2', '3'],
              default: '1',
              description: 'Task priority: "0" (General), "1" (Low), "2" (Medium), "3" (High).',
            },
            assignees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Member IDs to assign to the task. Use list_members to get valid IDs.',
            },
            followers: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Map of memberId to follower role for task followers.',
            },
            dueStart: {
              type: 'string',
              description: 'Start date as ISO 8601 string.',
            },
            dueEnd: {
              type: 'string',
              description: 'Deadline as ISO 8601 string.',
            },
            parentTask: {
              type: 'string',
              description: 'Parent task ID when creating a subtask.',
            },
            milestones: {
              type: 'array',
              items: { type: 'string' },
              description: 'Milestone IDs to attach. Not allowed on subtasks.',
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Board task type IDs from the board typesList.',
            },
          },
          required: ['name', 'boardId'],
          additionalProperties: false,
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_task',
    description: 'Edit an existing task in the Vaiz workspace',
    annotations: writeAnnotations('Edit Task'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Task update payload. Requires taskId; include only fields to change.',
          properties: {
            taskId: {
              type: 'string',
              minLength: 1,
              description: 'Task identifier: 24-char database ID or HRID (e.g. "PRJ-123").',
            },
            name: {
              type: 'string',
              description: 'Updated task title.',
            },
            assignees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replacement list of assignee member IDs.',
            },
            completed: {
              type: 'boolean',
              description: 'Mark task as completed (true) or reopen (false).',
            },
            dueStart: {
              type: 'string',
              description: 'Start date as ISO 8601 string.',
            },
            dueEnd: {
              type: 'string',
              description: 'Deadline as ISO 8601 string.',
            },
            priority: {
              type: 'string',
              enum: ['0', '1', '2', '3'],
              description: 'Task priority: "0" (General), "1" (Low), "2" (Medium), "3" (High).',
            },
            coverUrl: {
              type: 'string',
              description: 'URL for the task cover image.',
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replacement list of board task type IDs.',
            },
            milestones: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replacement list of milestone IDs.',
            },
            group: {
              type: 'string',
              description: 'Board column/group ID to move the task into.',
            },
          },
          required: ['taskId'],
          additionalProperties: false,
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_task_comments',
    description:
      'Get all comments for a specific task by database ID or HRID (e.g., "PRJ-123")',
    annotations: readAnnotations('Get Task Comments'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          minLength: 1,
          description: 'Task identifier: 24-char database ID or HRID (e.g. "PRJ-123").',
        },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task_comment',
    description:
      'Create a new comment on a task by database ID or HRID (e.g., "PRJ-123")',
    annotations: writeAnnotations('Create Task Comment'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          minLength: 1,
          description: 'Task identifier: 24-char database ID or HRID (e.g. "PRJ-123").',
        },
        content: {
          type: 'string',
          minLength: 1,
          description:
            'Comment content in Markdown. Supports formatting, lists, code and mentions via @[label](kind:id).',
        },
        replyTo: {
          type: 'string',
          description: 'Parent comment ID when posting a threaded reply.',
        },
      },
      required: ['taskId', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_task_history',
    description: 'Get history of changes for a specific task',
    annotations: readAnnotations('Get Task History'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        ...historyFilterProps,
        taskId: {
          type: 'string',
          minLength: 1,
          description: 'Task identifier: 24-char database ID or HRID (e.g. "PRJ-123").',
        },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_task_blocker',
    description:
      'Toggle a blocker relationship between two tasks. Direction is relative to taskId: "blockers" = tasks that block taskId, "blocking" = tasks that taskId blocks. taskId and blockerTaskId accept database IDs or HRIDs (e.g. "PRJ-21").',
    annotations: writeAnnotations('Set Task Blocker'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'Primary task in the blocker relationship.',
        },
        blockerTaskId: {
          type: 'string',
          description: 'Related task to link as blocker or blocked.',
        },
        direction: {
          type: 'string',
          enum: ['blockers', 'blocking'],
          description:
            'Relationship direction relative to taskId: "blockers" = tasks blocking taskId, "blocking" = tasks blocked by taskId.',
        },
      },
      required: ['taskId', 'blockerTaskId', 'direction'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects in the current space',
    annotations: readAnnotations('List Projects'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_project',
    description: 'Get detailed information about a specific project by ID',
    annotations: readAnnotations('Get Project'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          minLength: 1,
          description: 'Project ID (24-char hex). Use list_projects to find project IDs.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_project_history',
    description:
      'Get history of all activities in a specific project across the workspace',
    annotations: readAnnotations('Get Project History'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        ...historyFilterProps,
        projectId: {
          type: 'string',
          minLength: 1,
          description: 'Project ID (24-char hex) whose history to load.',
        },
        entityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['task', 'project', 'board', 'document', 'milestone'],
          },
          description: 'Optional list of entity types to include in history results.',
        },
        taskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter history to specific task IDs.',
        },
        boardIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter history to specific board IDs.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_boards',
    description: `List all accessible boards in the current space, optionally filtered by project.

Examples:
- All boards: list_boards()
- Boards in project: list_boards(projectId: "...")`,
    annotations: readAnnotations('List Boards'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional project ID filter (24-char hex).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_board',
    description: 'Get detailed information about a specific board by ID',
    annotations: readAnnotations('Get Board'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          minLength: 1,
          description: 'Board ID (24-char hex). Use list_projects to find board IDs.',
        },
      },
      required: ['boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_document',
    description:
      'Create a new standalone document in the board document tree. For task or milestone documents, use create_task or create_milestone instead.',
    annotations: writeAnnotations('Create Document'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Document creation payload.',
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 256,
              description: 'Document title.',
            },
            container: {
              type: 'string',
              enum: ['project', 'space', 'personal'],
              default: 'personal',
              description:
                'Where to create the document: "personal" (default) — private to current user, "project" — in a project doc tree (requires projectId), "space" — shared space documents.',
            },
            projectId: {
              type: 'string',
              description: 'Required when container is "project". Project ID (24-char hex).',
            },
            description: {
              type: 'string',
              maxLength: 50000,
              description:
                'Document content in Markdown format. Converted to rich document content automatically.',
            },
            parentDocumentId: {
              type: 'string',
              description: 'Optional parent document ID for nesting in the doc tree.',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document',
    description:
      'Get detailed information about a USER document in workspace. For SYSTEM help, use read_resource!',
    annotations: readAnnotations('Get Document'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          minLength: 1,
          description: 'Document ID (24-char hex). Use search_space to find document IDs.',
        },
      },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document_comments',
    description: 'Get all comments for a specific document',
    annotations: readAnnotations('Get Document Comments'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          minLength: 1,
          description: 'Document ID (24-char hex). Use search_space to find document IDs.',
        },
      },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document_history',
    description: 'Get history of changes for a specific document',
    annotations: readAnnotations('Get Document History'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        ...historyFilterProps,
        documentId: {
          type: 'string',
          minLength: 1,
          description: 'Document ID (24-char hex) to load history for.',
        },
      },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_document_content',
    description:
      'Edit the document content (description) of a task, milestone, or standalone document. Can append to existing content or replace it entirely.',
    annotations: writeAnnotations('Edit Document Content'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Document content update payload.',
          properties: {
            documentId: {
              type: 'string',
              minLength: 1,
              description: 'Document ID (24-char hex). Use get_task or get_milestone to find document IDs.',
            },
            description: {
              type: 'string',
              minLength: 1,
              maxLength: 50000,
              description: 'Document content in Markdown format.',
            },
            replace: {
              type: 'boolean',
              default: false,
              description:
                'If true, replaces the entire document content. If false (default), appends to existing content.',
            },
          },
          required: ['documentId', 'description'],
          additionalProperties: false,
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_milestones',
    description:
      'List all milestones in the current space, optionally filtered by board or project',
    annotations: readAnnotations('List Milestones'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          description: 'Optional board ID filter (24-char hex).',
        },
        projectId: {
          type: 'string',
          description: 'Optional project ID filter (24-char hex).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_milestone',
    description:
      'Get detailed information about a specific milestone by ID',
    annotations: readAnnotations('Get Milestone'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        milestoneId: {
          type: 'string',
          minLength: 1,
          description: 'Milestone ID (24-char hex). Use list_milestones to find milestone IDs.',
        },
      },
      required: ['milestoneId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_milestone',
    description:
      'Create a new milestone in a board. The description field is a short plain-text summary (NOT Markdown). To add rich document content, use edit_document_content after creation.',
    annotations: writeAnnotations('Create Milestone'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Milestone title.',
        },
        boardId: {
          type: 'string',
          minLength: 1,
          description: 'Board ID where the milestone will be created.',
        },
        description: {
          type: 'string',
          maxLength: 1024,
          description:
            'Short plain-text description of the milestone (metadata, not document content). Do NOT put Markdown here. To add rich document content, use edit_document_content tool after creation.',
        },
        dueStart: {
          type: 'string',
          description: 'Start date as ISO 8601 string.',
        },
        dueEnd: {
          type: 'string',
          description: 'End date as ISO 8601 string.',
        },
      },
      required: ['name', 'boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_spaces',
    description: 'List all spaces available to the authenticated user.',
    annotations: readAnnotations('List Spaces'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_space_info',
    description:
      'Get detailed information about the current space and user permissions.',
    annotations: readAnnotations('Get Space Info'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'select_space',
    description: 'Select a space as the active MCP session context.',
    annotations: {
      title: 'Select Space',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          minLength: 1,
          description: 'Space ID to switch the MCP session into (24-char hex). Use list_spaces to find IDs.',
        },
      },
      required: ['spaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_current_user',
    description:
      'Get detailed information about the authenticated user and current space context.',
    annotations: readAnnotations('Get Current User'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_members',
    description: 'List all members in the current space',
    annotations: readAnnotations('List Members'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_member',
    description:
      'Get detailed information about a specific workspace member by ID',
    annotations: readAnnotations('Get Member'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        memberId: {
          type: 'string',
          minLength: 1,
          description: 'Member ID (24-char hex). Use list_members to find member IDs.',
        },
      },
      required: ['memberId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_user_history',
    description:
      'Get history of all activities performed by a specific user in the current workspace',
    annotations: readAnnotations('Get User History'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        ...historyFilterProps,
        memberId: {
          type: 'string',
          minLength: 1,
          description: 'Member ID whose activity history to load.',
        },
        entityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['task', 'project', 'board', 'document', 'milestone'],
          },
          description: 'Optional list of entity types to include in history results.',
        },
        taskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter history to specific task IDs.',
        },
        boardIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter history to specific board IDs.',
        },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter history to specific project IDs.',
        },
      },
      required: ['memberId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_notifications',
    description:
      'Get user notifications with filtering and pagination support',
    annotations: readAnnotations('Get Notifications'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum number of notifications to return (1-100).',
        },
        lastLoadedDate: {
          type: 'number',
          default: 0,
          description: 'Unix timestamp (ms) cursor for pagination. Pass the newest loaded notification date.',
        },
        readStatus: {
          type: 'string',
          enum: ['All', 'Read', 'Unread'],
          description: 'Filter notifications by read status.',
        },
        groups: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'Comments',
              'DocumentChanges',
              'Mentions',
              'Security',
              'Space',
              'TaskChanges',
              'Team',
              'Import',
            ],
          },
          description: 'Filter by notification group categories.',
        },
        pinned: {
          type: 'boolean',
          description: 'When true, return only pinned notifications.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_automations',
    description: 'Get all automations (workflows) for a specific board',
    annotations: readAnnotations('Get Automations'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        boardId: {
          type: 'string',
          minLength: 1,
          description: 'Board ID whose automations/workflows to load.',
        },
      },
      required: ['boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_resources',
    description:
      'List all available MCP resources (dictionaries, space data, system help index).',
    annotations: readAnnotations('List Resources'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_resource',
    description:
      'Read content of a specific MCP resource by name. For knowledge base articles, use "vaiz-help-" prefix + article name from the index.',
    annotations: readAnnotations('Read Resource'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          minLength: 1,
          description: 'Resource name from list_resources (e.g. "vaiz-space-overview").',
        },
      },
      required: ['resourceName'],
      additionalProperties: false,
    },
  },
  {
    name: 'ping_server',
    description: 'Health check for the Vaiz MCP server connection.',
    annotations: readAnnotations('Ping Server'),
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

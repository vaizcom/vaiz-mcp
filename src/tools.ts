import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * All Vaiz MCP tool definitions, hardcoded for static analysis visibility.
 * At runtime these are merged with tools fetched from the remote backend —
 * remote definitions take precedence when names collide.
 */
export const VAIZ_TOOLS: Tool[] = [
  {
    name: 'search',
    description:
      'Search for entities in YOUR workspace (tasks, projects, users, comments, boards, USER documents). NOT system documentation!',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          enum: ['task', 'project', 'user', 'comment', 'board', 'document'],
          default: 'task',
        },
        query: { type: 'string', minLength: 1 },
        limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_tasks',
    description: `Get a filtered list of tasks with pagination. Supports filtering by board, project, assignees, completion status, priorities, milestones, types, and creator.

Examples:
- My tasks: get_tasks(assignees: [myMemberId])
- All uncompleted: get_tasks(completed: false)
- High priority: get_tasks(priorities: ["3"])
- Specific board: get_tasks(boardId: "...")
- By type: get_tasks(types: ["typeId1", "typeId2"])
- By group: get_tasks(boardId: "...", groupId: "...")
- Created by member: get_tasks(createdBy: "memberId")
- Next page: get_tasks(skip: 50, limit: 50)`,
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        projectId: { type: 'string' },
        assignees: { type: 'array', items: { type: 'string' } },
        completed: { type: 'boolean' },
        priorities: {
          type: 'array',
          items: { type: 'string', enum: ['0', '1', '2', '3'] },
        },
        milestones: { type: 'array', items: { type: 'string' } },
        types: { type: 'array', items: { type: 'string' } },
        groupId: { type: 'string' },
        createdBy: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
        skip: { type: 'number', minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    description:
      'Get detailed information about a specific task by database ID or HRID (e.g., "PRJ-123")',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1 },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the Vaiz workspace',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            boardId: { type: 'string', minLength: 1 },
            groupId: { type: 'string' },
            description: {
              type: 'string',
              description:
                'Task document content in Markdown format. Supports headings, lists, code blocks, tables, etc. Converted to rich document content automatically.',
            },
            priority: {
              type: 'string',
              enum: ['0', '1', '2', '3'],
              default: '1',
            },
            assignees: { type: 'array', items: { type: 'string' } },
            followers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            dueStart: { type: 'string' },
            dueEnd: { type: 'string' },
            parentTask: { type: 'string' },
            milestones: { type: 'array', items: { type: 'string' } },
            types: { type: 'array', items: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            taskId: { type: 'string', minLength: 1 },
            name: { type: 'string' },
            assignees: { type: 'array', items: { type: 'string' } },
            completed: { type: 'boolean' },
            dueStart: { type: 'string' },
            dueEnd: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['0', '1', '2', '3'],
            },
            coverUrl: { type: 'string' },
            types: { type: 'array', items: { type: 'string' } },
            milestones: { type: 'array', items: { type: 'string' } },
            group: { type: 'string' },
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
    description: 'Get all comments for a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1 },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task_comment',
    description: 'Create a new comment on a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1 },
        content: { type: 'string', minLength: 1 },
        replyTo: { type: 'string' },
      },
      required: ['taskId', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_task_history',
    description: 'Get history of changes for a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
        keys: { type: 'array', items: { type: 'string' } },
        excludeKeys: { type: 'array', items: { type: 'string' } },
        dateRangeStart: { type: 'string' },
        dateRangeEnd: { type: 'string' },
        createdBy: { type: 'array', items: { type: 'string' } },
        taskId: { type: 'string', minLength: 1 },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_task_blocker',
    description:
      'Toggle a blocker relationship between two tasks. Direction is relative to taskId: "blockers" = tasks that block taskId, "blocking" = tasks that taskId blocks. Note: taskId and blockerTaskId require database IDs (use search to find tasks by HRID like "PRJ-21" to get their database IDs)',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        blockerTaskId: { type: 'string' },
        direction: { type: 'string', enum: ['blockers', 'blocking'] },
      },
      required: ['taskId', 'blockerTaskId', 'direction'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects in the current space',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_project',
    description: 'Get detailed information about a specific project by ID',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1 },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_project_history',
    description:
      'Get history of all activities in a specific project across the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
        keys: { type: 'array', items: { type: 'string' } },
        excludeKeys: { type: 'array', items: { type: 'string' } },
        dateRangeStart: { type: 'string' },
        dateRangeEnd: { type: 'string' },
        createdBy: { type: 'array', items: { type: 'string' } },
        projectId: { type: 'string', minLength: 1 },
        entityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['task', 'project', 'board', 'document', 'milestone'],
          },
        },
        taskIds: { type: 'array', items: { type: 'string' } },
        boardIds: { type: 'array', items: { type: 'string' } },
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
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_board',
    description: 'Get detailed information about a specific board by ID',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', minLength: 1 },
      },
      required: ['boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document',
    description:
      'Get detailed information about a USER document in workspace. For SYSTEM help, use read_resource!',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', minLength: 1 },
      },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document_comments',
    description: 'Get all comments for a specific document',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', minLength: 1 },
      },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document_history',
    description: 'Get history of changes for a specific document',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
        keys: { type: 'array', items: { type: 'string' } },
        excludeKeys: { type: 'array', items: { type: 'string' } },
        dateRangeStart: { type: 'string' },
        dateRangeEnd: { type: 'string' },
        createdBy: { type: 'array', items: { type: 'string' } },
        documentId: { type: 'string', minLength: 1 },
      },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_document_content',
    description:
      'Edit the document content (description) of a task, milestone, or standalone document. Can append to existing content or replace it entirely.',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            documentId: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1, maxLength: 50000 },
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
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
        projectId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_milestone',
    description:
      'Get detailed information about a specific milestone by ID',
    inputSchema: {
      type: 'object',
      properties: {
        milestoneId: { type: 'string', minLength: 1 },
      },
      required: ['milestoneId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_milestone',
    description:
      'Create a new milestone in a board. The description field is a short plain-text summary (NOT Markdown). To add rich document content, use edit_document_content after creation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 128 },
        boardId: { type: 'string', minLength: 1 },
        description: {
          type: 'string',
          maxLength: 1024,
          description:
            'Short plain-text description of the milestone (metadata, not document content). Do NOT put Markdown here. To add rich document content, use edit_document_content tool after creation.',
        },
        dueStart: { type: 'string' },
        dueEnd: { type: 'string' },
      },
      required: ['name', 'boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_spaces',
    description:
      'List all available spaces (spaces) for the current user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'space_info',
    description:
      'Get detailed information about current space and user permissions',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'select_space',
    description: 'Select a space to work with',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', minLength: 1 },
      },
      required: ['spaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'current_user',
    description:
      'Get detailed information about current authenticated user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_members',
    description: 'List all members in the current space',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_member',
    description:
      'Get detailed information about a specific workspace member by ID',
    inputSchema: {
      type: 'object',
      properties: {
        memberId: { type: 'string', minLength: 1 },
      },
      required: ['memberId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_user_history',
    description:
      'Get history of all activities performed by a specific user in the current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
        keys: { type: 'array', items: { type: 'string' } },
        excludeKeys: { type: 'array', items: { type: 'string' } },
        dateRangeStart: { type: 'string' },
        dateRangeEnd: { type: 'string' },
        createdBy: { type: 'array', items: { type: 'string' } },
        memberId: { type: 'string', minLength: 1 },
        entityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['task', 'project', 'board', 'document', 'milestone'],
          },
        },
        taskIds: { type: 'array', items: { type: 'string' } },
        boardIds: { type: 'array', items: { type: 'string' } },
        projectIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['memberId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_notifications',
    description:
      'Get user notifications with filtering and pagination support',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        lastLoadedDate: { type: 'number', default: 0 },
        readStatus: { type: 'string', enum: ['All', 'Read', 'Unread'] },
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
        },
        pinned: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_automations',
    description: 'Get all automations (workflows) for a specific board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', minLength: 1 },
      },
      required: ['boardId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_resources',
    description:
      'List all available MCP resources (dictionaries, workspace data, etc.)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_resource',
    description:
      'Read content of a specific MCP resource by name. For knowledge base articles, use "vaiz-help-" prefix + article name from the index.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', minLength: 1 },
      },
      required: ['resourceName'],
      additionalProperties: false,
    },
  },
  {
    name: 'ping',
    description: 'Simple ping tool for testing',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

import type { Prompt } from '@modelcontextprotocol/sdk/types.js';

/**
 * All Vaiz MCP prompt definitions, hardcoded for static analysis visibility.
 * At runtime these are merged with prompts fetched from the remote backend —
 * remote definitions take precedence when names collide.
 */
export const VAIZ_PROMPTS: Prompt[] = [
  {
    name: 'vaiz-mcp-usage-guide',
    description:
      'CRITICAL: Complete usage guide for Vaiz MCP tools - essential reading before using any MCP function',
    arguments: [
      {
        name: 'toolName',
        description: 'Specific tool name for targeted guidance',
        required: false,
      },
      {
        name: 'scenario',
        description: 'User scenario type',
        required: false,
      },
      {
        name: 'commonMistake',
        description: 'Common mistake to address',
        required: false,
      },
    ],
  },
  {
    name: 'proactive-intelligence',
    description:
      'CRITICAL: Instructions for proactive and intelligent behavior with MCP tools - makes agents act like Cursor',
    arguments: [
      {
        name: 'scenario',
        description: 'Type of scenario requiring proactive behavior',
        required: false,
      },
      {
        name: 'requiredDataPoints',
        description: 'Minimum number of data points to gather (default: 5)',
        required: false,
      },
    ],
  },
  {
    name: 'vaiz-behavior-model',
    description:
      'CRITICAL: Core behavior model and interaction guidelines for Vaiz AI agents',
    arguments: [
      {
        name: 'agentRole',
        description: 'Agent role specialization',
        required: false,
      },
      {
        name: 'userExperience',
        description: 'User experience level',
        required: false,
      },
      {
        name: 'contextMode',
        description: 'Current interaction context',
        required: false,
      },
    ],
  },
  {
    name: 'markdown-formatting-guide',
    description:
      'Comprehensive guide for proper Markdown formatting in all agent responses to users',
    arguments: [
      {
        name: 'responseType',
        description: 'Type of response being formatted',
        required: false,
      },
      {
        name: 'complexity',
        description: 'Level of detail required',
        required: false,
      },
    ],
  },
  {
    name: 'quick-start-guide',
    description:
      'Quick start guide for common Vaiz MCP operations with step-by-step instructions',
    arguments: [
      {
        name: 'taskType',
        description: 'Specific task type for targeted guidance',
        required: false,
      },
    ],
  },
  {
    name: 'workspace-setup-guide',
    description:
      'Essential guide for workspace selection and MCP context setup',
    arguments: [
      {
        name: 'targetSpaceName',
        description: 'Name of the target workspace/space',
        required: false,
      },
      {
        name: 'userScenario',
        description: 'User scenario type',
        required: false,
      },
    ],
  },
  {
    name: 'sprint-planning-assistant',
    description: 'Help plan sprint goals and task prioritization',
    arguments: [
      {
        name: 'sprintDuration',
        description: 'Sprint duration in weeks',
        required: false,
      },
      {
        name: 'teamCapacity',
        description: 'Team capacity percentage',
        required: false,
      },
      {
        name: 'focusArea',
        description: 'Main focus area for the sprint',
        required: false,
      },
    ],
  },
  {
    name: 'analyze-task-breakdown',
    description: 'Break down complex tasks into manageable subtasks',
    arguments: [
      {
        name: 'taskDescription',
        description: 'Description of the complex task to break down',
        required: true,
      },
      {
        name: 'timeframe',
        description: 'Available timeframe for completion',
        required: false,
      },
      {
        name: 'teamSize',
        description: 'Number of team members available',
        required: false,
      },
    ],
  },
  {
    name: 'create-task-guided',
    description: 'Guided task creation with best practices',
    arguments: [
      {
        name: 'projectContext',
        description: 'Current project context for the task',
        required: false,
      },
      {
        name: 'taskType',
        description: 'Type of task to create',
        required: false,
      },
      {
        name: 'urgency',
        description: 'Task urgency level',
        required: false,
      },
    ],
  },
];

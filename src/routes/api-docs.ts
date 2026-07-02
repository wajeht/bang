import type { RouteConfig } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import type { AppOpenAPIHono } from '../http.js';

type RouteRequest = NonNullable<RouteConfig['request']>;
type RequestBodySchema = NonNullable<
    NonNullable<RouteRequest['body']>['content']['application/json']
>['schema'];

const ApiResponse = z.unknown().openapi('ApiResponse');
const ErrorResponse = z
    .object({
        message: z.string().optional(),
        error: z.string().optional(),
        details: z.unknown().optional(),
    })
    .passthrough()
    .openapi('ErrorResponse');

const IdParam = z.object({
    id: z.string().regex(/^\d+$/),
});

const TabItemParam = z.object({
    id: z.string().regex(/^\d+$/),
    itemId: z.string().regex(/^\d+$/),
});

const PaginationQuery = z.object({
    page: z.string().optional(),
    per_page: z.string().optional(),
    search: z.string().optional(),
    sort_key: z.string().optional(),
    direction: z.enum(['asc', 'desc']).optional(),
});

const ActionInput = z
    .object({
        url: z.string().optional(),
        name: z.string().optional(),
        actionType: z.enum(['redirect', 'search']).optional(),
        trigger: z.string().optional(),
        hidden: z.union([z.boolean(), z.string()]).optional(),
    })
    .passthrough()
    .openapi('ActionInput');

const BookmarkInput = z
    .object({
        url: z.string().optional(),
        title: z.string().optional(),
        pinned: z.union([z.boolean(), z.string()]).optional(),
        hidden: z.union([z.boolean(), z.string()]).optional(),
    })
    .passthrough()
    .openapi('BookmarkInput');

const NoteInput = z
    .object({
        title: z.string().optional(),
        content: z.string().optional(),
        pinned: z.union([z.boolean(), z.string()]).optional(),
        hidden: z.union([z.boolean(), z.string()]).optional(),
    })
    .passthrough()
    .openapi('NoteInput');

const ReminderInput = z
    .object({
        title: z.string().optional(),
        content: z.string().optional(),
        when: z.string().optional(),
        custom_date: z.string().optional(),
        custom_time: z.string().optional(),
    })
    .passthrough()
    .openapi('ReminderInput');

const TabInput = z
    .object({
        title: z.string().optional(),
        trigger: z.string().optional(),
    })
    .passthrough()
    .openapi('TabInput');

const TabItemInput = z
    .object({
        title: z.string().optional(),
        url: z.string().optional(),
    })
    .passthrough()
    .openapi('TabItemInput');

const BulkDeleteInput = z
    .object({
        id: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
    })
    .passthrough()
    .openapi('BulkDeleteInput');

const MarkdownInput = z
    .object({
        content: z.string(),
    })
    .openapi('MarkdownInput');

const ThemeInput = z
    .object({
        theme: z.enum(['light', 'dark']),
    })
    .openapi('ThemeInput');

interface ApiRoute {
    method: RouteConfig['method'];
    path: string;
    tag: string;
    summary: string;
    params?: RouteRequest['params'];
    query?: RouteRequest['query'];
    body?: RequestBodySchema;
    status?: number;
}

export function registerApiDocs(app: AppOpenAPIHono) {
    app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });

    const routes: ApiRoute[] = [
        {
            method: 'get',
            path: '/api/collections',
            tag: 'Collections',
            summary: 'Get all user collections',
            query: PaginationQuery,
        },
        {
            method: 'get',
            path: '/api/actions',
            tag: 'Actions',
            summary: 'Get actions',
            query: PaginationQuery,
        },
        {
            method: 'post',
            path: '/api/actions',
            tag: 'Actions',
            summary: 'Create an action',
            body: ActionInput,
            status: 201,
        },
        {
            method: 'get',
            path: '/api/actions/{id}',
            tag: 'Actions',
            summary: 'Get a specific action',
            params: IdParam,
        },
        {
            method: 'patch',
            path: '/api/actions/{id}',
            tag: 'Actions',
            summary: 'Update an action',
            params: IdParam,
            body: ActionInput,
        },
        {
            method: 'delete',
            path: '/api/actions/{id}',
            tag: 'Actions',
            summary: 'Delete an action',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/actions/delete',
            tag: 'Actions',
            summary: 'Delete actions in bulk',
            body: BulkDeleteInput,
        },
        {
            method: 'post',
            path: '/api/actions/{id}/hide',
            tag: 'Actions',
            summary: 'Toggle action hidden status',
            params: IdParam,
        },
        {
            method: 'get',
            path: '/api/bookmarks',
            tag: 'Bookmarks',
            summary: 'Get bookmarks',
            query: PaginationQuery,
        },
        {
            method: 'post',
            path: '/api/bookmarks',
            tag: 'Bookmarks',
            summary: 'Create a bookmark',
            body: BookmarkInput,
            status: 201,
        },
        {
            method: 'get',
            path: '/api/bookmarks/{id}',
            tag: 'Bookmarks',
            summary: 'Get a specific bookmark',
            params: IdParam,
        },
        {
            method: 'patch',
            path: '/api/bookmarks/{id}',
            tag: 'Bookmarks',
            summary: 'Update a bookmark',
            params: IdParam,
            body: BookmarkInput,
        },
        {
            method: 'delete',
            path: '/api/bookmarks/{id}',
            tag: 'Bookmarks',
            summary: 'Delete a bookmark',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/bookmarks/delete',
            tag: 'Bookmarks',
            summary: 'Delete bookmarks in bulk',
            body: BulkDeleteInput,
        },
        {
            method: 'post',
            path: '/api/bookmarks/{id}/pin',
            tag: 'Bookmarks',
            summary: 'Toggle bookmark pinned status',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/bookmarks/{id}/hide',
            tag: 'Bookmarks',
            summary: 'Toggle bookmark hidden status',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/notes/render-markdown',
            tag: 'Notes',
            summary: 'Render markdown content to HTML',
            body: MarkdownInput,
        },
        {
            method: 'get',
            path: '/api/notes',
            tag: 'Notes',
            summary: 'Get notes',
            query: PaginationQuery,
        },
        {
            method: 'post',
            path: '/api/notes',
            tag: 'Notes',
            summary: 'Create a note',
            body: NoteInput,
            status: 201,
        },
        {
            method: 'get',
            path: '/api/notes/{id}',
            tag: 'Notes',
            summary: 'Get a specific note',
            params: IdParam,
        },
        {
            method: 'put',
            path: '/api/notes/{id}',
            tag: 'Notes',
            summary: 'Update a note',
            params: IdParam,
            body: NoteInput,
        },
        {
            method: 'delete',
            path: '/api/notes/{id}',
            tag: 'Notes',
            summary: 'Delete a note',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/notes/delete',
            tag: 'Notes',
            summary: 'Delete notes in bulk',
            body: BulkDeleteInput,
        },
        {
            method: 'post',
            path: '/api/notes/{id}/pin',
            tag: 'Notes',
            summary: 'Toggle note pinned status',
            params: IdParam,
        },
        {
            method: 'get',
            path: '/api/tabs',
            tag: 'Tabs',
            summary: 'Get tabs',
            query: PaginationQuery,
        },
        {
            method: 'post',
            path: '/api/tabs',
            tag: 'Tabs',
            summary: 'Create a tab group',
            body: TabInput,
            status: 201,
        },
        {
            method: 'patch',
            path: '/api/tabs/{id}',
            tag: 'Tabs',
            summary: 'Update a tab group',
            params: IdParam,
            body: TabInput,
        },
        {
            method: 'delete',
            path: '/api/tabs/{id}',
            tag: 'Tabs',
            summary: 'Delete a tab group',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/tabs/delete',
            tag: 'Tabs',
            summary: 'Delete tab groups in bulk',
            body: BulkDeleteInput,
        },
        {
            method: 'post',
            path: '/api/tabs/{id}/items',
            tag: 'Tabs',
            summary: 'Create a tab item',
            params: IdParam,
            body: TabItemInput,
            status: 201,
        },
        {
            method: 'patch',
            path: '/api/tabs/{id}/items/{itemId}',
            tag: 'Tabs',
            summary: 'Update a tab item',
            params: TabItemParam,
            body: TabItemInput,
        },
        {
            method: 'delete',
            path: '/api/tabs/{id}/items/{itemId}',
            tag: 'Tabs',
            summary: 'Delete a tab item',
            params: TabItemParam,
        },
        {
            method: 'get',
            path: '/api/reminders',
            tag: 'Reminders',
            summary: 'Get reminders',
            query: PaginationQuery,
        },
        {
            method: 'post',
            path: '/api/reminders',
            tag: 'Reminders',
            summary: 'Create a reminder',
            body: ReminderInput,
            status: 201,
        },
        {
            method: 'get',
            path: '/api/reminders/{id}',
            tag: 'Reminders',
            summary: 'Get a specific reminder',
            params: IdParam,
        },
        {
            method: 'patch',
            path: '/api/reminders/{id}',
            tag: 'Reminders',
            summary: 'Update a reminder',
            params: IdParam,
            body: ReminderInput,
        },
        {
            method: 'delete',
            path: '/api/reminders/{id}',
            tag: 'Reminders',
            summary: 'Delete a reminder',
            params: IdParam,
        },
        {
            method: 'post',
            path: '/api/reminders/delete',
            tag: 'Reminders',
            summary: 'Delete reminders in bulk',
            body: BulkDeleteInput,
        },
        {
            method: 'get',
            path: '/api/settings/api-key',
            tag: 'Settings',
            summary: 'Get current API key',
        },
        {
            method: 'post',
            path: '/api/settings/theme',
            tag: 'Settings',
            summary: 'Update theme',
            body: ThemeInput,
        },
    ];

    for (const route of routes) {
        registerApiRoute(app, route);
    }
}

function registerApiRoute(app: AppOpenAPIHono, route: ApiRoute) {
    app.openAPIRegistry.registerPath(
        createRoute({
            method: route.method,
            path: route.path,
            request: {
                params: route.params,
                query: route.query,
                body: route.body
                    ? {
                          required: true,
                          content: {
                              'application/json': {
                                  schema: route.body,
                              },
                          },
                      }
                    : undefined,
            },
            responses: {
                [route.status ?? 200]: {
                    description: 'Success response',
                    content: {
                        'application/json': {
                            schema: ApiResponse,
                        },
                    },
                },
                401: {
                    description: 'Unauthorized',
                    content: {
                        'application/json': {
                            schema: ErrorResponse,
                        },
                    },
                },
                422: {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: ErrorResponse,
                        },
                    },
                },
            },
            security: [{ BearerAuth: [] }],
            tags: [route.tag],
            summary: route.summary,
        }),
    );
}

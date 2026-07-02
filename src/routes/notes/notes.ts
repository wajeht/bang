import type { AppContext, AppContextContext, AppEnv, User } from '../../type.js';
import { renderView, setFlash } from '../middleware.js';
import { Hono } from 'hono';

function createNoteMarkdownRenderer(ctx: AppContext) {
    const noteRenderer = new ctx.libs.Renderer();
    noteRenderer.code = function ({ text, lang }) {
        if (lang && ctx.libs.hljs.getLanguage(lang)) {
            const highlighted = ctx.libs.hljs.highlight(text, { language: lang }).value;
            return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
        }
        return `<pre><code>${text}</code></pre>`;
    };

    return new ctx.libs.Marked({
        renderer: noteRenderer,
        breaks: true,
        gfm: true,
        pedantic: false,
        silent: false,
    });
}

export function createNotesRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();
    const sharedMarked = createNoteMarkdownRenderer(ctx);

    const NOTE_CONTENT_PREVIEW_LENGTH = 200;
    const NOTE_CONTENT_PREVIEW_SOURCE_LIMIT = 4000;

    router.post('/notes/render-markdown', ctx.middleware.authentication, (c) => {
        const { content } = c.get('body');

        if (!content || content.trim() === '') {
            throw new ctx.errors.ValidationError({ content: 'Content is required' });
        }

        const markdown = sharedMarked.parse(content) as string;
        const sanitized = ctx.libs.dompurify.sanitize(markdown);

        return c.json({ content: sanitized });
    });

    router.get('/notes', ctx.middleware.authentication, getNotesHandler);
    async function getNotesHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParamsFromContext(c, 'notes');

        const { canViewHidden, hasVerifiedPassword } =
            ctx.utils.request.canViewHiddenItemsFromContext(c, user);

        const { data, pagination } = await ctx.models.notes.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            excludeHidden: !canViewHidden,
        });

        const limitedData = data.slice(0, perPage);
        const markdownRemovedData = await Promise.all(
            limitedData.map(async (d: any) => {
                const content = String(d.content ?? '');
                const isSourceTruncated = content.length > NOTE_CONTENT_PREVIEW_SOURCE_LIMIT;
                let preview = await ctx.utils.util.convertMarkdownToPlainText(
                    content.slice(0, NOTE_CONTENT_PREVIEW_SOURCE_LIMIT),
                    NOTE_CONTENT_PREVIEW_LENGTH,
                );

                if (isSourceTruncated && preview && !preview.endsWith('...')) {
                    preview = `${preview}...`;
                }

                return {
                    ...d,
                    content: preview,
                };
            }),
        );

        ctx.utils.html.applyHighlighting(markdownRemovedData, ['title', 'content'], search);

        return renderView(ctx, c, 'notes/notes-index.html', {
            user: c.get('session').user,
            title: 'Notes',
            path: '/notes',
            layout: '_layouts/auth.html',
            data: markdownRemovedData,
            search,
            pagination,
            sortKey,
            direction,
            showHidden: canViewHidden,
            hiddenItemsVerified: hasVerifiedPassword,
        });
    }

    router.get('/notes/create', ctx.middleware.authentication, async (c) => {
        return renderView(ctx, c, 'notes/notes-new.html', {
            title: 'Notes / Create',
            path: '/notes/create',
            layout: '_layouts/auth.html',
        });
    });

    router.get('/notes/:id/edit', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const note = await ctx.models.notes.read(parseInt(c.req.param('id') ?? '', 10), user.id);

        if (!note) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        return renderView(ctx, c, 'notes/notes-edit.html', {
            title: 'Notes / Edit',
            path: '/notes/edit',
            layout: '_layouts/auth.html',
            note,
        });
    });

    router.get('/notes/:id', ctx.middleware.authentication, getNoteHandler);
    async function getNoteHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        let note = await ctx.models.notes.read(parseInt(c.req.param('id') ?? '', 10), user.id);

        if (!note) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        if (note.hidden) {
            const verificationKey = `note_${note.id}`;
            const verifiedTime = c.get('session').verifiedHiddenItems?.[verificationKey];

            if (!verifiedTime || verifiedTime < Date.now()) {
                const csrfToken = c.get('locals').csrfToken || '';

                return c.html(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Password Required</title></head>
                    <body>
                    <script>
                        const password = prompt("This note is protected. Please enter your password:");
                        if (password) {
                            const form = document.createElement('form');
                            form.method = 'POST';
                            form.action = '/verify-hidden-password';

                            const csrfInput = document.createElement('input');
                            csrfInput.type = 'hidden';
                            csrfInput.name = 'csrfToken';
                            csrfInput.value = '${csrfToken}';

                            const passwordInput = document.createElement('input');
                            passwordInput.type = 'hidden';
                            passwordInput.name = 'password';
                            passwordInput.value = password;

                            const typeInput = document.createElement('input');
                            typeInput.type = 'hidden';
                            typeInput.name = 'resource_type';
                            typeInput.value = 'note';

                            const idInput = document.createElement('input');
                            idInput.type = 'hidden';
                            idInput.name = 'resource_id';
                            idInput.value = '${note.id}';

                            const urlInput = document.createElement('input');
                            urlInput.type = 'hidden';
                            urlInput.name = 'redirect_url';
                            urlInput.value = '/notes/${note.id}';

                            form.appendChild(csrfInput);
                            form.appendChild(passwordInput);
                            form.appendChild(typeInput);
                            form.appendChild(idInput);
                            form.appendChild(urlInput);
                            document.body.appendChild(form);
                            form.submit();
                        } else {
                            window.history.back();
                        }
                    </script>
                    </body>
                    </html>
                `);
            }
        }

        let content: string = '';

        try {
            const escapedContent = note.content
                .replace(/<script/g, '&lt;script')
                .replace(/<\/script>/g, '&lt;/script&gt;')
                .replace(/<template/g, '&lt;template')
                .replace(/<\/template>/g, '&lt;/template&gt;');

            content = sharedMarked.parse(escapedContent) as string;
        } catch (_error) {
            content = '';
            ctx.logger.error(`cannot parse content into markdown`, { error: _error });
        }

        note = {
            ...note,
            content,
        };

        return renderView(ctx, c, 'notes/notes-show.html', {
            title: `Notes / ${note.title}`,
            path: `/notes/${note.id}`,
            layout: '_layouts/auth.html',
            note,
        });
    }

    router.post('/notes', ctx.middleware.authentication, postNoteHandler);
    async function postNoteHandler(c: AppContextContext) {
        const { title, content, pinned, hidden } = c.get('body');

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!content) {
            throw new ctx.errors.ValidationError({ content: 'Content is required' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ctx.errors.ValidationError({
                pinned: 'Pinned must be a boolean or checkbox value',
            });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ctx.errors.ValidationError({
                hidden: 'Hidden must be a boolean or checkbox value',
            });
        }

        const user = c.get('user') as User;

        if (hidden === 'on' || hidden === true) {
            const dbUser = await ctx.db('users').where({ id: user.id }).first();
            if (!dbUser?.hidden_items_password) {
                throw new ctx.errors.ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }

        const note = await ctx.models.notes.create({
            user_id: user.id,
            title: title.trim(),
            content: content.trim(),
            pinned: pinned === 'on' || pinned === true,
            hidden: hidden === 'on' || hidden === true,
        });

        setFlash(c, 'success', 'Note created successfully');
        return c.redirect(`/notes/${note.id}`);
    }

    router.post('/notes/:id/update', ctx.middleware.authentication, updateNoteHandler);
    async function updateNoteHandler(c: AppContextContext) {
        const { title, content, pinned, hidden } = c.get('body');

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!content) {
            throw new ctx.errors.ValidationError({ content: 'Content is required' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ctx.errors.ValidationError({
                pinned: 'Pinned must be a boolean or checkbox value',
            });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ctx.errors.ValidationError({
                hidden: 'Hidden must be a boolean or checkbox value',
            });
        }

        const user = c.get('user') as User;
        const noteId = parseInt(c.req.param('id') ?? '', 10);

        if (hidden === 'on' || hidden === true) {
            const dbUser = await ctx.db('users').where({ id: user.id }).first();
            if (!dbUser?.hidden_items_password) {
                throw new ctx.errors.ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }

        const currentNote = await ctx.models.notes.read(noteId, user.id);

        if (!currentNote) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        const updatedNote = await ctx.models.notes.update(noteId, user.id, {
            title: title.trim(),
            content: content.trim(),
            pinned: pinned === 'on' || pinned === true,
            hidden: hidden === 'on' || hidden === true,
        });

        setFlash(c, 'success', `Note ${updatedNote.title} updated successfully`);

        if (updatedNote.hidden && !currentNote.hidden) {
            setFlash(c, 'success', 'Note hidden successfully');
            return c.redirect('/notes');
        }

        return c.redirect(`/notes/${updatedNote.id}`);
    }

    router.post('/notes/:id/delete', ctx.middleware.authentication, deleteNoteHandler);
    router.post('/notes/delete', ctx.middleware.authentication, deleteNoteHandler);
    async function deleteNoteHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const noteIds = ctx.utils.request.extractIdsForDeleteFromContext(c);
        const deletedCount = await ctx.models.notes.delete(noteIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        setFlash(
            c,
            'success',
            `${deletedCount} note${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return c.redirect('/notes');
    }

    router.post('/notes/:id/pin', ctx.middleware.authentication, toggleNotePinHandler);
    async function toggleNotePinHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const noteId = parseInt(c.req.param('id') ?? '', 10);

        const currentNote = await ctx.models.notes.read(noteId, user.id);

        if (!currentNote) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        const updatedNote = await ctx.models.notes.update(noteId, user.id, {
            pinned: !currentNote.pinned,
        });

        setFlash(c, 'success', `Note ${updatedNote.pinned ? 'pinned' : 'unpinned'} successfully`);
        return c.redirect('/notes');
    }

    /**
     * GET /notes/{id}/download
     *
     * @tags Notes
     * @summary Download a note as markdown file
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - note id
     *
     * @return {string} 200 - markdown file
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.get('/notes/:id/download', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const note = await ctx.models.notes.read(parseInt(c.req.param('id') ?? '', 10), user.id);

        if (!note) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        const fileName = note.title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with dashes
            .replace(/-+/g, '-') // Replace multiple dashes with single dash
            .replace(/^-|-$/g, ''); // Remove leading/trailing dashes

        c.header('Content-Type', 'text/markdown; charset=utf-8');
        c.header('Content-Disposition', `attachment; filename="${fileName}.md"`);

        return c.body(note.content);
    });

    return router;
}

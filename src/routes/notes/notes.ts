import type { Request, Response } from 'express';
import type { AppContext, User } from '../../type';

export function NotesRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    /**
     * A note
     * @typedef {object} Note
     * @property {string} id - note id
     * @property {string} title.required - note title
     * @property {string} content.required - note content
     * @property {string} created_at - creation timestamp
     * @property {string} updated_at - last update timestamp
     */

    /**
     * GET /api/notes
     *
     * @tags Notes
     * @summary Get all notes
     *
     * @security BearerAuth
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     */
    router.get('/api/notes', ctx.middleware.authentication, getNotesHandler);
    router.get('/notes', ctx.middleware.authentication, getNotesHandler);
    async function getNotesHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParams(req, 'notes');

        // Check if user wants to show hidden items and has verified password
        const showHidden = req.query.hidden === 'true';
        const hasVerifiedPassword =
            req.session?.hiddenItemsVerified &&
            req.session?.hiddenItemsVerifiedAt &&
            Date.now() - req.session.hiddenItemsVerifiedAt < 30 * 60 * 1000; // 30 minutes

        const canViewHidden = showHidden && hasVerifiedPassword && user.hidden_items_password;

        const { data, pagination } = await ctx.models.notes.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !ctx.utils.auth.isApiRequest(req),
            excludeHidden: !canViewHidden,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        const limitedData = data.slice(0, perPage);
        const markdownRemovedData = await Promise.all(
            limitedData.map(async (d: any) => ({
                ...d,
                content: await ctx.utils.util.convertMarkdownToPlainText(d.content, 200),
            })),
        );

        return res.render('notes/notes-get.html', {
            user: req.session?.user,
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

    router.get(
        '/notes/create',
        ctx.middleware.authentication,
        async (_req: Request, res: Response) => {
            return res.render('notes/notes-create.html', {
                title: 'Notes / Create',
                path: '/notes/create',
                layout: '_layouts/auth.html',
            });
        },
    );

    router.get(
        '/notes/:id/edit',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const note = await ctx.models.notes.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!note) {
                throw new ctx.errors.NotFoundError('Note not found');
            }

            return res.render('notes/notes-edit.html', {
                title: 'Notes / Edit',
                path: '/notes/edit',
                layout: '_layouts/auth.html',
                note,
            });
        },
    );

    /**
     * GET /api/notes/{id}
     *
     * @tags Notes
     * @summary Get a specific note
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - note id
     *
     * @return {Note} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.get('/api/notes/:id', ctx.middleware.authentication, getNoteHandler);
    router.get('/notes/:id', ctx.middleware.authentication, getNoteHandler);
    async function getNoteHandler(req: Request, res: Response) {
        const user = req.user as User;
        let note = await ctx.models.notes.read(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        if (!note) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        if (note.hidden && !ctx.utils.auth.isApiRequest(req)) {
            const verificationKey = `note_${note.id}`;
            const verifiedTime = req.session?.verifiedHiddenItems?.[verificationKey];

            if (!verifiedTime || verifiedTime < Date.now()) {
                const csrfToken = res.locals.csrfToken || '';

                return res.set({ 'Content-Type': 'text/html' }).status(200).send(`
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

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: 'note retrieved successfully',
                data: note,
            });
            return;
        }

        let content: string = '';

        try {
            const { marked } = await import('marked');
            const hljs = await import('highlight.js');

            const renderer = new marked.Renderer();

            renderer.code = function ({ text, lang }) {
                if (lang && hljs.default.getLanguage(lang)) {
                    const highlighted = hljs.default.highlight(text, { language: lang }).value;
                    return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
                }
                return `<pre><code>${text}</code></pre>`;
            };

            marked.setOptions({
                renderer,
                breaks: true,
                gfm: true,
                pedantic: false,
                silent: false,
            });

            const escapedContent = note.content
                .replace(/<script/g, '&lt;script')
                .replace(/<\/script>/g, '&lt;/script&gt;')
                .replace(/<template/g, '&lt;template')
                .replace(/<\/template>/g, '&lt;/template&gt;');

            content = marked(escapedContent) as string;
        } catch (_error) {
            content = '';
            ctx.logger.error(`cannot parse content into markdown`, { error: _error });
        }

        note = {
            ...note,
            content,
        };

        return res.render('notes/notes-show.html', {
            title: `Notes / ${note.title}`,
            path: `/notes/${note.id}`,
            layout: '_layouts/auth.html',
            note,
        });
    }

    /**
     * POST /api/notes
     *
     * @tags Notes
     * @summary Create a new note
     *
     * @security BearerAuth
     *
     * @param {Note} request.body.required - note info
     *
     * @return {object} 201 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/notes', ctx.middleware.authentication, postNoteHandler);
    router.post('/notes', ctx.middleware.authentication, postNoteHandler);
    async function postNoteHandler(req: Request, res: Response) {
        const { title, content, pinned, hidden } = req.body;

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

        const user = req.user as User;

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
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

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(201).json({ message: `Note ${note.title} created successfully!` });
            return;
        }

        req.flash('success', 'Note created successfully');
        return res.redirect('/notes');
    }

    /**
     * PUT /api/notes/{id}
     *
     * @tags Notes
     * @summary Update a note
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - note id
     * @param {Note} request.body.required - note info
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.put('/api/notes/:id', ctx.middleware.authentication, updateNoteHandler);
    router.post('/notes/:id/update', ctx.middleware.authentication, updateNoteHandler);
    async function updateNoteHandler(req: Request, res: Response) {
        const { title, content, pinned, hidden } = req.body;

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

        const user = req.user as User;
        const noteId = parseInt(req.params.id as unknown as string);

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
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

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'note updated successfully' });
            return;
        }

        req.flash('success', `Note ${updatedNote.title} updated successfully`);

        if (updatedNote.hidden && !currentNote.hidden) {
            req.flash('success', 'Note hidden successfully');
            return res.redirect('/notes');
        }

        return res.redirect(`/notes/${updatedNote.id}`);
    }

    /**
     * DELETE /api/notes/{id}
     *
     * @tags Notes
     * @summary Delete a note
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - note id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.delete('/api/notes/:id', ctx.middleware.authentication, deleteNoteHandler);
    router.post('/notes/:id/delete', ctx.middleware.authentication, deleteNoteHandler);
    async function deleteNoteHandler(req: Request, res: Response) {
        const user = req.user as User;
        const deleted = await ctx.models.notes.delete(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        if (!deleted) {
            throw new ctx.errors.NotFoundError('Not not found');
        }

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'note deleted successfully' });
            return;
        }

        req.flash('success', 'Note deleted successfully');
        return res.redirect('/notes');
    }

    /**
     * POST /api/notes/delete-bulk
     *
     * @tags Notes
     * @summary Delete multiple notes
     *
     * @security BearerAuth
     *
     * @param {object} request.body.required - Bulk delete request
     * @param {array<string>} request.body.id - Array of note IDs
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/notes/delete-bulk', ctx.middleware.authentication, bulkDeleteNoteHandler);
    router.post('/notes/delete-bulk', ctx.middleware.authentication, bulkDeleteNoteHandler);
    async function bulkDeleteNoteHandler(req: Request, res: Response) {
        const { id } = req.body;

        if (!id || !Array.isArray(id)) {
            throw new ctx.errors.ValidationError({ id: 'IDs array is required' });
        }

        const noteIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

        if (noteIds.length === 0) {
            throw new ctx.errors.ValidationError({ id: 'No valid note IDs provided' });
        }

        const user = req.user as User;
        const deletedCount = await ctx.models.notes.bulkDelete(noteIds, user.id);

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} note${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: {
                    deletedCount,
                },
            });
            return;
        }

        req.flash(
            'success',
            `${deletedCount} note${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/notes');
    }

    /**
     * POST /api/notes/{id}/pin
     *
     * @tags Notes
     * @summary Toggle pin status of a note
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - note id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.post('/api/notes/:id/pin', ctx.middleware.authentication, toggleNotePinHandler);
    router.post('/notes/:id/pin', ctx.middleware.authentication, toggleNotePinHandler);
    async function toggleNotePinHandler(req: Request, res: Response) {
        const user = req.user as User;
        const noteId = parseInt(req.params.id as unknown as string);

        const currentNote = await ctx.models.notes.read(noteId, user.id);

        if (!currentNote) {
            throw new ctx.errors.NotFoundError('Note not found');
        }

        const updatedNote = await ctx.models.notes.update(noteId, user.id, {
            pinned: !currentNote.pinned,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: `Note ${updatedNote.pinned ? 'pinned' : 'unpinned'} successfully`,
                data: updatedNote,
            });
            return;
        }

        req.flash('success', `Note ${updatedNote.pinned ? 'pinned' : 'unpinned'} successfully`);
        return res.redirect('/notes');
    }

    /**
     * POST /api/notes/render-markdown
     *
     * @tags Notes
     * @summary Render markdown content to html
     *
     * @security BearerAuth
     *
     * @param {string} request.body.required - request body
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     */
    router.post(
        '/api/notes/render-markdown',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const { content } = req.body;

            if (!content || content.trim() === '') {
                throw new ctx.errors.ValidationError({ content: 'Content is required' });
            }

            const { marked } = await import('marked');
            const hljs = await import('highlight.js');

            const renderer = new marked.Renderer();

            renderer.code = function ({ text, lang }) {
                if (lang && hljs.default.getLanguage(lang)) {
                    const highlighted = hljs.default.highlight(text, { language: lang }).value;
                    return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
                }
                return `<pre><code>${text}</code></pre>`;
            };

            marked.setOptions({ renderer });
            const markdown = marked(content) as string;

            res.json({ content: markdown });
        },
    );

    return router;
}

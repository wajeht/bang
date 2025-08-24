import express from 'express';
import { logger } from '../../utils/logger';
import type { User, Notes } from '../../type';
import type { Request, Response } from 'express';
import { authenticationMiddleware } from '../middleware';
import { NotFoundError, ValidationError } from '../../error';
import { isApiRequest, extractPagination, convertMarkdownToPlainText } from '../../utils/util';

export function createNotesRouter(notes: Notes) {
    const router = express.Router();

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
    router.get('/api/notes', authenticationMiddleware, getNotesHandler);
    router.get('/notes', authenticationMiddleware, getNotesHandler);
    async function getNotesHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'notes');

        const { data, pagination } = await notes.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !isApiRequest(req),
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        const limitedData = data.slice(0, perPage);
        const markdownRemovedData = await Promise.all(
            limitedData.map(async (d: any) => ({
                ...d,
                content: await convertMarkdownToPlainText(d.content, 200),
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
        });
    }

    router.get('/notes/create', authenticationMiddleware, async (req: Request, res: Response) => {
        return res.render('notes/notes-create.html', {
            title: 'Notes / Create',
            path: '/notes/create',
            layout: '_layouts/auth.html',
            user: req.session.user,
        });
    });

    router.get('/notes/:id/edit', authenticationMiddleware, async (req: Request, res: Response) => {
        const user = req.user as User;
        const note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found');
        }

        return res.render('notes/notes-edit.html', {
            title: 'Notes / Edit',
            path: '/notes/edit',
            layout: '_layouts/auth.html',
            note,
            user: req.session.user,
        });
    });

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
    router.get('/api/notes/:id', authenticationMiddleware, getNoteHandler);
    router.get('/notes/:id', authenticationMiddleware, getNoteHandler);
    async function getNoteHandler(req: Request, res: Response) {
        const user = req.user as User;
        let note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found');
        }

        if (isApiRequest(req)) {
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
            logger.error(`cannot parse content into markdown`, { error: _error });
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
    router.post('/api/notes', authenticationMiddleware, postNoteHandler);
    router.post('/notes', authenticationMiddleware, postNoteHandler);
    async function postNoteHandler(req: Request, res: Response) {
        const { title, content, pinned } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!content) {
            throw new ValidationError({ content: 'Content is required' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ValidationError({ pinned: 'Pinned must be a boolean or checkbox value' });
        }

        const user = req.user as User;

        const note = await notes.create({
            user_id: user.id,
            title: title.trim(),
            content: content.trim(),
            pinned: pinned === 'on' || pinned === true,
        });

        if (isApiRequest(req)) {
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
    router.put('/api/notes/:id', authenticationMiddleware, updateNoteHandler);
    router.post('/notes/:id/update', authenticationMiddleware, updateNoteHandler);
    async function updateNoteHandler(req: Request, res: Response) {
        const { title, content, pinned } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!content) {
            throw new ValidationError({ content: 'Content is required' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ValidationError({ pinned: 'Pinned must be a boolean or checkbox value' });
        }

        const user = req.user as User;

        const updatedNote = await notes.update(
            parseInt(req.params.id as unknown as string),
            user.id,
            {
                title: title.trim(),
                content: content.trim(),
                pinned: pinned === 'on' || pinned === true,
            },
        );

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'note updated successfully' });
            return;
        }

        req.flash('success', `Note ${updatedNote.title} updated successfully`);
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
    router.delete('/api/notes/:id', authenticationMiddleware, deleteNoteHandler);
    router.post('/notes/:id/delete', authenticationMiddleware, deleteNoteHandler);
    async function deleteNoteHandler(req: Request, res: Response) {
        const user = req.user as User;
        const deleted = await notes.delete(parseInt(req.params.id as unknown as string), user.id);

        if (!deleted) {
            throw new NotFoundError('Not not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'note deleted successfully' });
            return;
        }

        req.flash('success', 'Note deleted successfully');
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
    router.post('/api/notes/:id/pin', authenticationMiddleware, toggleNotePinHandler);
    router.post('/notes/:id/pin', authenticationMiddleware, toggleNotePinHandler);
    async function toggleNotePinHandler(req: Request, res: Response) {
        const user = req.user as User;
        const noteId = parseInt(req.params.id as unknown as string);

        const currentNote = await notes.read(noteId, user.id);

        if (!currentNote) {
            throw new NotFoundError('Note not found');
        }

        const updatedNote = await notes.update(noteId, user.id, {
            pinned: !currentNote.pinned,
        });

        if (isApiRequest(req)) {
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
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const { content } = req.body;

            if (!content || content.trim() === '') {
                throw new ValidationError({ content: 'Content is required' });
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

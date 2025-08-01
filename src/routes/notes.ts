import express, { Request, Response } from 'express';
import { Notes, User } from '../type';
import {
    isApiRequest,
    extractPagination,
    getConvertedReadmeMDToHTML,
    convertMarkdownToPlainText,
} from '../utils/util';
import { NotFoundError, ValidationError } from '../error';
import { logger } from '../utils/logger';

export function createNotes(notes: Notes) {
    const router = express.Router();

    router.get('/notes', async (req: Request, res: Response) => {
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

        return res.render('./notes/notes-get.html', {
            user: req.session?.user,
            title: 'Notes',
            path: '/notes',
            layout: '../layouts/auth',
            howToContent: await getConvertedReadmeMDToHTML(),
            data: markdownRemovedData,
            search,
            pagination,
            sortKey,
            direction,
        });
    });

    router.get('/notes/create', (_req: Request, res: Response) => {
        return res.render('./notes/notes-create.html', {
            title: 'Notes / Create',
            path: '/notes/create',
            layout: '../layouts/auth',
        });
    });

    router.get('/notes/:id', async (req: Request, res: Response) => {
        const user = req.user as User;
        let note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found');
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

            marked.setOptions({ renderer });
            content = marked(note.content) as string;
        } catch (_error) {
            content = '';
            logger.error(`cannot parse content into markdown`, { error: _error });
        }

        note = {
            ...note,
            content,
        };

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'note retrieved successfully',
                data: note,
            });
            return;
        }

        return res.render('./notes/notes-id.html', {
            user: req.session?.user,
            title: `Notes / ${note.title}`,
            path: `/notes/${note.id}`,
            layout: '../layouts/auth',
            note,
        });
    });

    router.get('/notes/:id/edit', async (req: Request, res: Response) => {
        const user = req.user as User;
        const note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found');
        }

        return res.render('./notes/notes-edit.html', {
            title: 'Notes / Edit',
            path: '/notes/edit',
            layout: '../layouts/auth',
            note,
        });
    });

    router.post('/notes', async (req: Request, res: Response) => {
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
    });

    router.post('/notes/:id/update', updateHandler);
    router.patch('/notes/:id', updateHandler);
    async function updateHandler(req: Request, res: Response) {
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

    router.post('/notes/:id/pin', async (req: Request, res: Response) => {
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
    });

    router.post('/notes/:id/delete', deleteHandler);
    router.delete('/notes/:id', deleteHandler);
    async function deleteHandler(req: Request, res: Response) {
        const user = req.user as User;
        const noteId = parseInt(req.params.id as unknown as string);

        const deleted = await notes.delete(noteId, user.id);

        if (!deleted) {
            throw new NotFoundError('Note not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Note deleted successfully' });
            return;
        }

        req.flash('success', 'Note deleted successfully');
        return res.redirect('/notes');
    }

    router.post('/render-markdown', async (req: Request, res: Response) => {
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
        return;
    });

    return router;
}

import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
    createUnauthenticatedAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { dayjs } from '../../libs';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';

describe('Reminders Routes', () => {
    let app: any;

    beforeEach(async () => {
        const { app: expressApp } = await createApp();
        app = expressApp;
    });

    afterEach(async () => {
        await cleanupTestData();
    });

    afterAll(async () => {
        await cleanupTestDatabase();
    });

    describe('GET /reminders', () => {
        it('should require authentication', async () => {
            await request(app).get('/reminders').expect(302).expect('Location', '/?modal=login');
        });

        it('should return reminders list for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/reminders').expect(200);
            expect(response.text).toContain('Reminders');
        });

        it('should return empty list when user has no reminders', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/reminders').expect(200);
            expect(response.text).toContain('Reminders');
        });
    });

    describe('GET /api/reminders', () => {
        it('should require authentication', async () => {
            await request(app).get('/api/reminders').set('Accept', 'application/json').expect(401);
        });

        it('should return reminders as JSON', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('reminders').insert({
                user_id: user.id,
                title: 'Test Reminder',
                content: 'Remember to test',
                reminder_type: 'once',
                due_date: dayjs().add(1, 'day').toISOString(),
            });

            const response = await agent
                .get('/api/reminders')
                .set('Accept', 'application/json')
                .expect(200);

            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].title).toBe('Test Reminder');
        });
    });

    describe('GET /reminders/create', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/reminders/create')
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should render create reminder page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/reminders/create').expect(200);
            expect(response.text).toContain('Create');
        });
    });

    describe('POST /reminders', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/reminders')
                .type('form')
                .send({
                    title: 'New Reminder',
                    content: 'Remember this',
                    when: 'daily',
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should create a new reminder with specific date', async () => {
            const { agent, user } = await authenticateAgent(app);

            const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

            const response = await agent.post('/reminders').type('form').send({
                title: 'Tomorrow Reminder',
                content: 'Remember tomorrow',
                when: 'custom',
                custom_date: tomorrow,
                custom_time: '09:00',
            });

            expect(response.status).toBe(302);

            const reminder = await db('reminders').where({ user_id: user.id }).first();
            expect(reminder).toBeDefined();
            expect(reminder.title).toBe('Tomorrow Reminder');
            expect(reminder.content).toBe('Remember tomorrow');
            expect(reminder.reminder_type).toBe('once');
        });

        it('should create a daily reminder', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/reminders')
                .type('form')
                .send({
                    title: 'Daily Reminder',
                    content: 'Daily task',
                    when: 'daily',
                })
                .expect(302);

            const reminder = await db('reminders').where({ user_id: user.id }).first();
            expect(reminder).toBeDefined();
            expect(reminder.title).toBe('Daily Reminder');
            expect(reminder.reminder_type).toBe('recurring');
            expect(reminder.frequency).toBe('daily');
        });

        it('should create a reminder with custom date', async () => {
            const { agent, user } = await authenticateAgent(app);

            const customDate = dayjs().add(7, 'days').format('YYYY-MM-DD');
            const customTime = '14:30';

            await agent
                .post('/reminders')
                .type('form')
                .send({
                    title: 'Custom Date Reminder',
                    content: 'Custom date task',
                    when: 'custom',
                    custom_date: customDate,
                    custom_time: customTime,
                })
                .expect(302);

            const reminder = await db('reminders').where({ user_id: user.id }).first();
            expect(reminder).toBeDefined();
            expect(reminder.title).toBe('Custom Date Reminder');
            expect(reminder.reminder_type).toBe('once');
        });

        it('should validate required fields', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.post('/reminders').type('form').send({
                content: 'Content without title',
                when: 'daily',
            });

            expect(response.status).toBe(302);
        });
    });

    describe('POST /api/reminders', () => {
        it('should create a new reminder via API', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent.post('/api/reminders').send({
                title: 'API Reminder',
                content: 'API content',
                when: 'weekly',
            });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Reminder created successfully');
            expect(response.body.data.title).toBe('API Reminder');
            expect(response.body.data.content).toBe('API content');
            expect(response.body.data.reminder_type).toBe('recurring');
            expect(response.body.data.frequency).toBe('weekly');

            const reminder = await db('reminders').where({ id: response.body.data.id }).first();
            expect(reminder).toBeDefined();
        });
    });

    describe('GET /reminders/:id', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/api/reminders/1')
                .set('Accept', 'application/json')
                .expect(401);
        });

        it('should return 404 for non-existent reminder', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.get('/api/reminders/99999').set('Accept', 'application/json').expect(404);
        });

        it('should return reminder details for owner', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const [reminder] = await db('reminders')
                .insert({
                    user_id: user.id,
                    title: 'Test Reminder',
                    content: 'Test content',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            const response = await agent.get(`/api/reminders/${reminder.id}`).expect(200);

            expect(response.body.data.title).toBe('Test Reminder');
            expect(response.body.data.content).toBe('Test content');
        });

        it('should not allow viewing reminders from other users', async () => {
            const { agent } = await authenticateApiAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser',
                    email: 'other@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [reminder] = await db('reminders')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Reminder',
                    content: 'Other content',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            await agent
                .get(`/api/reminders/${reminder.id}`)
                .set('Accept', 'application/json')
                .expect(404);
        });
    });

    describe('GET /reminders/:id/edit', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/reminders/1/edit')
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should render edit page for reminder owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [reminder] = await db('reminders')
                .insert({
                    user_id: user.id,
                    title: 'Test Reminder',
                    content: 'Test content',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            const response = await agent.get(`/reminders/${reminder.id}/edit`).expect(200);
            expect(response.text).toContain('Edit');
            expect(response.text).toContain('Test Reminder');
        });
    });

    describe('POST /reminders/:id/update', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/reminders/1/update')
                .type('form')
                .send({
                    title: 'Updated Reminder',
                    content: 'Updated content',
                    when: 'daily',
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should update reminder for owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [reminder] = await db('reminders')
                .insert({
                    user_id: user.id,
                    title: 'Original Title',
                    content: 'Original content',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            await agent
                .post(`/reminders/${reminder.id}/update`)
                .type('form')
                .send({
                    title: 'Updated Title',
                    content: 'Updated content',
                    when: 'weekly',
                })
                .expect(302);

            const updatedReminder = await db('reminders').where({ id: reminder.id }).first();
            expect(updatedReminder.title).toBe('Updated Title');
            expect(updatedReminder.content).toBe('Updated content');
            expect(updatedReminder.reminder_type).toBe('recurring');
            expect(updatedReminder.frequency).toBe('weekly');
        });

        it('should not allow updating reminders from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser2',
                    email: 'other2@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [reminder] = await db('reminders')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Reminder',
                    content: 'Other content',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            await agent
                .post(`/reminders/${reminder.id}/update`)
                .type('form')
                .send({
                    title: 'Hacked Title',
                    content: 'Hacked content',
                    when: 'daily',
                })
                .expect(404);

            const unchangedReminder = await db('reminders').where({ id: reminder.id }).first();
            expect(unchangedReminder.title).toBe('Other User Reminder');
        });
    });

    describe('POST /reminders/:id/delete', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/reminders/1/delete')
                .type('form')
                .send({})
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should delete reminder for owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [reminder] = await db('reminders')
                .insert({
                    user_id: user.id,
                    title: 'To Delete',
                    content: 'Will be deleted',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            await agent.post(`/reminders/${reminder.id}/delete`).type('form').send({}).expect(302);

            const deletedReminder = await db('reminders').where({ id: reminder.id }).first();
            expect(deletedReminder).toBeUndefined();
        });

        it('should not allow deleting reminders from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser3',
                    email: 'other3@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [reminder] = await db('reminders')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Reminder',
                    content: 'Other content',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            await agent.post(`/reminders/${reminder.id}/delete`).type('form').send({}).expect(404);

            // Verify reminder still exists
            const stillExists = await db('reminders').where({ id: reminder.id }).first();
            expect(stillExists).toBeDefined();
        });
    });

    describe('POST /reminders/recalculate', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/reminders/recalculate')
                .type('form')
                .send({})
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should recalculate all reminders for user', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('reminders').insert([
                {
                    user_id: user.id,
                    title: 'Daily Reminder',
                    content: 'Daily task',
                    reminder_type: 'daily',
                    due_date: dayjs().subtract(1, 'day').toISOString(),
                },
                {
                    user_id: user.id,
                    title: 'Weekly Reminder',
                    content: 'Weekly task',
                    reminder_type: 'weekly',
                    due_date: dayjs().subtract(8, 'days').toISOString(),
                },
            ]);

            await agent.post('/reminders/recalculate').type('form').send({}).expect(302);

            const reminders = await db('reminders').where({ user_id: user.id });

            const dailyReminder = reminders.find((r) => r.title === 'Daily Reminder');
            const weeklyReminder = reminders.find((r) => r.title === 'Weekly Reminder');

            expect(dailyReminder).toBeDefined();
            expect(weeklyReminder).toBeDefined();

            expect(dailyReminder.due_date).toBeDefined();
            expect(weeklyReminder.due_date).toBeDefined();
        });
    });

    describe('POST /reminders/delete', () => {
        it('should delete multiple reminders', async () => {
            const { agent, user } = await authenticateAgent(app);

            const reminders = await db('reminders')
                .insert([
                    {
                        user_id: user.id,
                        title: 'Reminder 1',
                        content: 'Content 1',
                        reminder_type: 'once',
                        due_date: dayjs().add(1, 'day').toISOString(),
                    },
                    {
                        user_id: user.id,
                        title: 'Reminder 2',
                        content: 'Content 2',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: dayjs().add(2, 'days').toISOString(),
                    },
                    {
                        user_id: user.id,
                        title: 'Reminder 3',
                        content: 'Content 3',
                        reminder_type: 'once',
                        due_date: dayjs().add(3, 'days').toISOString(),
                    },
                ])
                .returning('*');

            await agent
                .post('/reminders/delete')
                .type('form')
                .send({ id: [reminders[0].id, reminders[1].id] })
                .expect(302);

            const remaining = await db('reminders').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].title).toBe('Reminder 3');
        });

        it('should only delete reminders owned by the user', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser',
                    email: 'other@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [userReminder] = await db('reminders')
                .insert({
                    user_id: user.id,
                    title: 'My Reminder',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            const [otherReminder] = await db('reminders')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other Reminder',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            await agent
                .post('/reminders/delete')
                .type('form')
                .send({ id: [userReminder.id, otherReminder.id] })
                .expect(302);

            const userReminders = await db('reminders').where({ user_id: user.id });
            const otherReminders = await db('reminders').where({ user_id: otherUser.id });

            expect(userReminders).toHaveLength(0);
            expect(otherReminders).toHaveLength(1);
        });

        it('should require id array', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.post('/reminders/delete').type('form').send({}).expect(302);
        });
    });

    describe('POST /api/reminders/delete', () => {
        it('should delete multiple reminders via API', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const reminders = await db('reminders')
                .insert([
                    {
                        user_id: user.id,
                        title: 'Reminder 1',
                        content: 'Content 1',
                        reminder_type: 'once',
                        due_date: dayjs().add(1, 'day').toISOString(),
                    },
                    {
                        user_id: user.id,
                        title: 'Reminder 2',
                        content: 'Content 2',
                        reminder_type: 'recurring',
                        frequency: 'daily',
                        due_date: dayjs().add(2, 'days').toISOString(),
                    },
                    {
                        user_id: user.id,
                        title: 'Reminder 3',
                        content: 'Content 3',
                        reminder_type: 'once',
                        due_date: dayjs().add(3, 'days').toISOString(),
                    },
                ])
                .returning('*');

            const response = await agent
                .post('/api/reminders/delete')
                .send({ id: [reminders[0].id, reminders[1].id] })
                .expect(200);

            expect(response.body.message).toContain('2 reminders deleted successfully');
            expect(response.body.data.deletedCount).toBe(2);

            const remaining = await db('reminders').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].title).toBe('Reminder 3');
        });

        it('should return correct count when some IDs are invalid', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const [reminder] = await db('reminders')
                .insert({
                    user_id: user.id,
                    title: 'Reminder 1',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                })
                .returning('*');

            const response = await agent
                .post('/api/reminders/delete')
                .send({ id: [reminder.id, 99999] })
                .expect(200);

            expect(response.body.data.deletedCount).toBe(1);
        });

        it('should require id to be an array', async () => {
            const { agent } = await authenticateApiAgent(app);

            await agent.post('/api/reminders/delete').send({ id: 'not-an-array' }).expect(422);
        });
    });

    describe('Search Highlighting', () => {
        it('should highlight search terms in title and content', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('reminders').insert([
                {
                    user_id: user.id,
                    title: 'Doctor Appointment',
                    content: 'Visit the doctor for annual checkup',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                },
                {
                    user_id: user.id,
                    title: 'Other Reminder',
                    content: 'Something else',
                    reminder_type: 'once',
                    due_date: dayjs().add(2, 'days').toISOString(),
                },
            ]);

            const response = await agent.get('/reminders?search=doctor').expect(200);

            expect(response.text).toContain('<mark>Doctor</mark> Appointment');
            expect(response.text).toContain('<mark>doctor</mark>');
            expect(response.text).not.toContain('Other Reminder');
        });

        it('should highlight multiple search words', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('reminders').insert({
                user_id: user.id,
                title: 'Team Meeting Reminder',
                content: 'Weekly team standup meeting',
                reminder_type: 'recurring',
                frequency: 'weekly',
                due_date: dayjs().add(1, 'day').toISOString(),
            });

            const response = await agent.get('/reminders?search=team+meeting').expect(200);

            expect(response.text).toContain('<mark>Team</mark>');
            expect(response.text).toContain('<mark>Meeting</mark>');
        });

        it('should return all results without highlighting when no search term', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('reminders').insert([
                {
                    user_id: user.id,
                    title: 'Reminder One',
                    reminder_type: 'once',
                    due_date: dayjs().add(1, 'day').toISOString(),
                },
                {
                    user_id: user.id,
                    title: 'Reminder Two',
                    reminder_type: 'once',
                    due_date: dayjs().add(2, 'days').toISOString(),
                },
            ]);

            const response = await agent.get('/reminders').expect(200);

            expect(response.text).toContain('Reminder One');
            expect(response.text).toContain('Reminder Two');
            expect(response.text).not.toContain('<mark>');
        });

        it('should highlight search terms in API response', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('reminders').insert({
                user_id: user.id,
                title: 'Testing Highlight',
                content: 'This reminder is about highlight testing',
                reminder_type: 'once',
                due_date: dayjs().add(1, 'day').toISOString(),
            });

            const response = await agent.get('/api/reminders?search=highlight').expect(200);

            expect(response.body.data[0].title).toContain('<mark>Highlight</mark>');
            expect(response.body.data[0].content).toContain('<mark>highlight</mark>');
        });
    });
});

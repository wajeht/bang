import type { Knex } from 'knex';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

export async function up(knex: Knex): Promise<void> {
    const remindersWithIssues = await knex('reminders')
        .whereNull('due_date')
        .orWhere('due_date', '')
        .orWhereRaw('typeof(due_date) = ?', ['integer'])
        .orWhereRaw("due_date < datetime('now')");

    console.log(`Found ${remindersWithIssues.length} reminders with due date issues`);

    const remindersWithTimestamps = await knex('reminders').whereRaw('typeof(due_date) = ?', [
        'integer',
    ]);

    for (const reminder of remindersWithTimestamps) {
        if (reminder.due_date && typeof reminder.due_date === 'number') {
            const date = new Date(reminder.due_date);
            await knex('reminders').where('id', reminder.id).update({
                due_date: date.toISOString(),
                processed: false,
            });
        }
    }

    const now = dayjs.utc();

    const remindersToFix = await knex('reminders').where(function () {
        this.whereNull('due_date').orWhere('due_date', '').orWhereRaw("due_date < datetime('now')");
    });

    for (const reminder of remindersToFix) {
        let nextDue: Date;

        switch (reminder.frequency) {
            case 'daily':
                nextDue = now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0).toDate();
                break;
            case 'weekly':
                nextDue = now.add(7, 'days').hour(9).minute(0).second(0).millisecond(0).toDate();
                break;
            case 'biweekly':
                nextDue = now.add(14, 'days').hour(9).minute(0).second(0).millisecond(0).toDate();
                break;
            case 'monthly':
                nextDue = now
                    .add(1, 'month')
                    .date(1)
                    .hour(9)
                    .minute(0)
                    .second(0)
                    .millisecond(0)
                    .toDate();
                break;
            default:
                nextDue = now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0).toDate();
                break;
        }

        await knex('reminders').where('id', reminder.id).update({
            due_date: nextDue.toISOString(),
            processed: false,
            updated_at: knex.fn.now(),
        });
    }

    await knex('reminders').whereRaw("due_date > datetime('now')").update({
        processed: false,
    });

    const fixedReminders = await knex('reminders')
        .whereNotNull('due_date')
        .where('due_date', '!=', '');

    console.log(`Successfully fixed ${fixedReminders.length} reminders with proper due dates`);

    const upcomingReminders = await knex('reminders')
        .whereRaw("due_date BETWEEN datetime('now') AND datetime('now', '+24 hours')")
        .orderBy('due_date', 'asc');

    console.log(`Found ${upcomingReminders.length} reminders due in the next 24 hours`);
}

export async function down(_knex: Knex): Promise<void> {
    console.log('This migration cannot be reversed as it fixes data integrity issues');
}

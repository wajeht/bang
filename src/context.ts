import { Knex } from 'knex';
import { Actions, Bookmarks, Notes, Reminders, Tabs } from './type';

export interface Context {
    db: Knex;
    actions: Actions;
    bookmarks: Bookmarks;
    notes: Notes;
    reminders: Reminders;
    tabs: Tabs;
}

import { db } from '../../db/db';

export const users = {
    read: async (id: number) => {
        try {
            const user = await db('users').where({ id }).first();
            if (user) {
                // Convert SQLite integer values to booleans
                user.is_admin = Boolean(user.is_admin);
                user.autocomplete_search_on_homepage = Boolean(
                    user.autocomplete_search_on_homepage,
                );
            }
            return user;
        } catch {
            return null;
        }
    },
    readByEmail: async (email: string) => {
        try {
            const user = await db('users').where({ email }).first();
            if (user) {
                // Convert SQLite integer values to booleans
                user.is_admin = Boolean(user.is_admin);
                user.autocomplete_search_on_homepage = Boolean(
                    user.autocomplete_search_on_homepage,
                );
            }
            return user;
        } catch {
            return null;
        }
    },
};

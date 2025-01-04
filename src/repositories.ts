import { db } from './db/db';

export const actions = {
	all: async ({ user, perPage, page, search, sortKey, direction }: any) => {
		const query = db
			.select(
				'bangs.id',
				'bangs.name',
				'bangs.trigger',
				'bangs.url',
				'action_types.name as action_type',
				'bangs.created_at',
			)
			.from('bangs')
			.where('bangs.user_id', user.id)
			.join('action_types', 'bangs.action_type_id', 'action_types.id');

		if (search) {
			query.where((q) =>
				q
					.whereRaw('LOWER(bangs.name) LIKE ?', [`%${search}%`])
					.orWhereRaw('LOWER(bangs.trigger) LIKE ?', [`%${search}%`])
					.orWhereRaw('LOWER(bangs.url) LIKE ?', [`%${search}%`]),
			);
		}

		if (['name', 'trigger', 'url', 'created_at'].includes(sortKey)) {
			query.orderBy(`bangs.${sortKey}`, direction);
		} else if (sortKey === 'action_type') {
			query.orderBy('action_types.name', direction);
		} else {
			query.orderBy('bangs.created_at', 'desc');
		}

		return query.paginate({ perPage, currentPage: page, isLengthAware: true });
	},
	create: () => {},
	read: () => {},
	update: () => {},
	delete: () => {},
};

export const bookmarks = {
	all: () => {},
	create: () => {},
	read: () => {},
	update: () => {},
	delete: () => {},
};

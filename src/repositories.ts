import { db } from './db/db';

type Action = {
	id?: number;
	name: string;
	trigger: string;
	url: string;
	action_type_id?: number;
	user_id: number;
	created_at?: string;
};

type ActionsQueryParams = {
	user: { id: number };
	perPage?: number;
	page?: number;
	search?: string;
	sortKey?: string;
	direction?: 'asc' | 'desc';
};

export const actions = {
	all: async ({
		user,
		perPage = 10,
		page = 1,
		search = '',
		sortKey = 'created_at',
		direction = 'desc',
	}: ActionsQueryParams) => {
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

	create: async (action: Action & { actionType: string }) => {
		if (!action.name || !action.trigger || !action.url || !action.actionType || !action.user_id) {
			throw new Error('Missing required fields to create an action');
		}

		const actionTypeRecord = await db('action_types').where({ name: action.actionType }).first();

		if (!actionTypeRecord) {
			throw new Error('Invalid action type');
		}

		action.action_type_id = actionTypeRecord.id;

		const [createdAction] = await db('bangs').insert(action).returning('*');
		return createdAction;
	},

	read: async (id: number, userId: number) => {
		const action = await db
			.select(
				'bangs.id',
				'bangs.name',
				'bangs.trigger',
				'bangs.url',
				'action_types.name as action_type',
				'bangs.created_at',
			)
			.from('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({ 'bangs.id': id, 'bangs.user_id': userId })
			.first();

		if (!action) {
			throw new Error('Action not found or access denied');
		}

		return action;
	},

	update: async (id: number, userId: number, updates: Partial<Action>) => {
		const allowedFields = ['name', 'trigger', 'url', 'action_type_id'];
		const updateData = Object.fromEntries(
			Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
		);

		if (Object.keys(updateData).length === 0) {
			throw new Error('No valid fields provided for update');
		}

		const [updatedAction] = await db('bangs')
			.where({ id, user_id: userId })
			.update(updateData)
			.returning('*');

		if (!updatedAction) {
			throw new Error('Action not found or access denied');
		}

		return updatedAction;
	},

	delete: async (id: number, userId: number) => {
		const rowsAffected = await db('bangs').where({ id, user_id: userId }).delete();

		if (rowsAffected === 0) {
			throw new Error('Action not found or access denied');
		}

		return { success: true };
	},
};

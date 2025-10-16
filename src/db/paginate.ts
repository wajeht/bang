import knex, { type Knex } from 'knex';

export interface PaginationOptions {
    perPage?: number;
    currentPage?: number;
    isLengthAware?: boolean;
}

export interface PaginationResult<T = any> {
    data: T[];
    pagination: {
        perPage: number;
        currentPage: number;
        from: number;
        to: number;
        total?: number;
        lastPage?: number;
        hasNext?: boolean;
        hasPrev?: boolean;
    };
}

declare module 'knex' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Knex {
        interface QueryBuilder {
            paginate(options?: PaginationOptions): Promise<PaginationResult>;
        }
    }
}

export function attachPaginate() {
    async function paginate(
        this: Knex.QueryBuilder,
        { perPage = 10, currentPage = 1, isLengthAware = false }: PaginationOptions = {},
    ): Promise<PaginationResult> {
        // Basic validation
        perPage = Math.max(1, Math.floor(perPage));
        currentPage = Math.max(1, Math.floor(currentPage));

        const offset = (currentPage - 1) * perPage;

        // Get paginated data
        const data = await this.clone().offset(offset).limit(perPage);

        const pagination: any = {
            perPage,
            currentPage,
            from: offset + 1,
            to: offset + data.length,
            hasNext: data.length === perPage,
            hasPrev: currentPage > 1,
        };

        // Optionally get total count
        if (isLengthAware) {
            const countQuery = this.clone().clearSelect().clearOrder().count('* as total').first();
            const countResult = await countQuery;
            const total = +(countResult?.total || 0);

            pagination.total = total;
            pagination.lastPage = Math.ceil(total / perPage);
            pagination.hasNext = currentPage < pagination.lastPage;
        }

        return { data, pagination };
    }

    try {
        (knex as any).QueryBuilder.extend('paginate', paginate);
    } catch (error) {
        console.error('Error attaching paginate method to Knex QueryBuilder:', error);
    }
}

export interface PaginateArrayOptions {
    page: number;
    perPage: number;
    total: number;
}

export function paginate<T>(array: T[], options: PaginateArrayOptions) {
    const { page, perPage, total } = options;
    const currentPage = Math.max(1, page);
    const offset = (currentPage - 1) * perPage;
    const data = array.slice(offset, offset + perPage);
    const lastPage = Math.ceil(total / perPage);

    return {
        data,
        total,
        perPage,
        currentPage,
        lastPage,
        from: offset + 1,
        to: offset + data.length,
        hasNext: currentPage < lastPage,
        hasPrev: currentPage > 1,
    };
}

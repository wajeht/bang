interface ApprovedBang {
    trigger: string;
    name: string;
    domain: string;
    url: string;
    category: string;
    subcategory: string;
    rank: number;
}

// This file stores user-approved bangs that should persist across bang.ts updates
export const approvedBangs: Record<string, ApprovedBang> = {};

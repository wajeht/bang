import type { AppContext } from '../type.js';

export function validateActionShortcut(ctx: AppContext, trigger: unknown, url: unknown): string {
    if (typeof url !== 'string' || !ctx.utils.validation.isValidUrl(url)) {
        throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
    }

    if (typeof trigger !== 'string') {
        throw new ctx.errors.ValidationError({ trigger: 'Trigger must be a string' });
    }

    const normalizedTrigger = ctx.utils.util.normalizeBangTrigger(trigger);

    if (!ctx.utils.validation.isOnlyLettersAndNumbers(normalizedTrigger.slice(1))) {
        throw new ctx.errors.ValidationError({
            trigger: 'Trigger can only contain letters and numbers',
        });
    }

    return normalizedTrigger.toLowerCase();
}

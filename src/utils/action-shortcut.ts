import type { AppContext } from '../type.js';

export function validateActionShortcut<Trigger, Url>(
    ctx: AppContext,
    trigger: Trigger,
    url: Url,
): string {
    const parsedUrl = ctx.libs.z.string().safeParse(url);

    if (!parsedUrl.success || !ctx.utils.validation.isValidUrl(parsedUrl.data)) {
        throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
    }

    const parsedTrigger = ctx.libs.z.string().safeParse(trigger);

    if (!parsedTrigger.success) {
        throw new ctx.errors.ValidationError({ trigger: 'Trigger must be a string' });
    }

    const normalizedTrigger = ctx.utils.util.normalizeBangTrigger(parsedTrigger.data);

    if (!ctx.utils.validation.isOnlyLettersAndNumbers(normalizedTrigger.slice(1))) {
        throw new ctx.errors.ValidationError({
            trigger: 'Trigger can only contain letters and numbers',
        });
    }

    return normalizedTrigger.toLowerCase();
}

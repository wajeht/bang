import type { AppContext } from '../type';

export function createDateUtils(context: AppContext) {
    function formatDateInTimezone(
        utcDateString: string | Date,
        timezone: string = 'UTC',
    ): {
        dateString: string;
        timeString: string;
        fullString: string;
        dateInputValue: string;
        timeInputValue: string;
    } {
        try {
            let dayjsDate;

            if (typeof utcDateString === 'string') {
                // Handle database format "2025-07-31 03:55:07" as UTC
                if (!utcDateString.includes('T') && !utcDateString.endsWith('Z')) {
                    // Database format: "2025-07-31 03:55:07" -> treat as UTC
                    dayjsDate = context.libs.dayjs.utc(utcDateString.replace(' ', 'T'));
                } else {
                    dayjsDate = context.libs.dayjs.utc(utcDateString);
                }
            } else {
                dayjsDate = context.libs.dayjs.utc(utcDateString);
            }

            // Convert to target timezone
            const localDate = dayjsDate.tz(timezone);

            const dateString = localDate.format('M/D/YYYY');
            const timeString = localDate.format('h:mm A');
            const fullString = localDate.format('M/D/YYYY, h:mm A');
            const dateInputValue = localDate.format('YYYY-MM-DD');
            const timeInputValue = localDate.format('HH:mm');

            return { dateString, timeString, fullString, dateInputValue, timeInputValue };
        } catch (_error) {
            // Fallback to basic formatting
            const date = context.libs.dayjs(utcDateString);
            const jsDate = date.toDate();
            const dateString = jsDate.toLocaleDateString('en-US');
            const timeString = jsDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
            const fullString = `${dateString}, ${timeString}`;
            const dateInputValue = date.format('YYYY-MM-DD');
            const timeInputValue = date.format('HH:mm');

            return { dateString, timeString, fullString, dateInputValue, timeInputValue };
        }
    }

    function convertToUTC(localDateTimeString: string, timezone: string = 'UTC'): string {
        try {
            if (timezone === 'UTC') {
                return context.libs.dayjs.utc(localDateTimeString).toISOString();
            }

            // Parse as local time in the specified timezone, then convert to UTC
            const localTime = context.libs.dayjs.tz(localDateTimeString, timezone);
            return localTime.utc().toISOString();
        } catch (error) {
            // Fallback: assume input is already UTC
            return context.libs.dayjs.utc(localDateTimeString).toISOString();
        }
    }

    return {
        formatDateInTimezone,
        convertToUTC,
    };
}

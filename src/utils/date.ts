import type { AppContext } from '../type.js';

interface DateParts {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
}

const REGEX_DATABASE_DATE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function createDate(_context: AppContext) {
    return {
        nowInstant() {
            return Temporal.Now.instant();
        },

        nowZonedDateTime(timezone: string = getSystemTimezone()) {
            return Temporal.Now.zonedDateTimeISO(timezone);
        },

        currentYear(timezone: string = getSystemTimezone()) {
            return Temporal.Now.zonedDateTimeISO(timezone).year;
        },

        todayInputValue(timezone: string = getSystemTimezone()) {
            return Temporal.Now.zonedDateTimeISO(timezone).toPlainDate().toString();
        },

        toInstant,

        toDate(value: Temporal.Instant | Temporal.ZonedDateTime | string | Date) {
            if (value instanceof Temporal.ZonedDateTime) {
                return new Date(value.toInstant().epochMilliseconds);
            }
            const instant = value instanceof Temporal.Instant ? value : toInstant(value);
            return new Date(instant.epochMilliseconds);
        },

        toUtcIsoString(value: Temporal.Instant | Temporal.ZonedDateTime | string | Date) {
            if (value instanceof Temporal.ZonedDateTime) {
                return value.toInstant().toString();
            }
            if (value instanceof Temporal.Instant) {
                return value.toString();
            }
            return toInstant(value).toString();
        },

        addToInstant(value: Temporal.Instant | string | Date, duration: Temporal.DurationLike) {
            const instant = value instanceof Temporal.Instant ? value : toInstant(value);
            return addDurationToInstant(instant, duration);
        },

        formatUtcHttpDate(value: Temporal.Instant | string | Date) {
            const instant = value instanceof Temporal.Instant ? value : toInstant(value);
            return new Date(instant.epochMilliseconds).toUTCString();
        },

        subtractFromNow(duration: Temporal.DurationLike) {
            return subtractDurationFromInstant(Temporal.Now.instant(), duration);
        },

        toZonedDateTime(value: Temporal.Instant | string | Date, timezone: string = 'UTC') {
            const instant = value instanceof Temporal.Instant ? value : toInstant(value);
            return instant.toZonedDateTimeISO(timezone);
        },

        fromLocalDateTime(parts: DateParts, timezone: string = 'UTC') {
            return Temporal.ZonedDateTime.from({
                timeZone: timezone,
                year: parts.year,
                month: parts.month,
                day: parts.day,
                hour: parts.hour ?? 0,
                minute: parts.minute ?? 0,
                second: parts.second ?? 0,
                millisecond: 0,
                microsecond: 0,
                nanosecond: 0,
            });
        },

        formatInputDate(value: Temporal.Instant | Temporal.ZonedDateTime | string | Date) {
            const zonedDateTime =
                value instanceof Temporal.ZonedDateTime
                    ? value
                    : value instanceof Temporal.Instant
                      ? value.toZonedDateTimeISO('UTC')
                      : toInstant(value).toZonedDateTimeISO('UTC');
            return zonedDateTime.toPlainDate().toString();
        },

        formatLongDate(date: string | Date, timezone: string = 'UTC') {
            const dateValue =
                typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
                    ? Temporal.PlainDate.from(date).toZonedDateTime({
                          timeZone: timezone,
                          plainTime: Temporal.PlainTime.from('00:00'),
                      })
                    : toInstant(date).toZonedDateTimeISO(timezone);

            return new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: timezone,
            }).format(new Date(dateValue.toInstant().epochMilliseconds));
        },

        formatClockTime(value: Temporal.Instant | string | Date = Temporal.Now.instant()) {
            const instant = value instanceof Temporal.Instant ? value : toInstant(value);
            return new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
            }).format(new Date(instant.epochMilliseconds));
        },

        formatDateInTimezone(
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
                const localDate = toInstant(utcDateString).toZonedDateTimeISO(timezone);
                const dateString = `${localDate.month}/${localDate.day}/${localDate.year}`;
                const timeString = formatTime(localDate.hour, localDate.minute);
                const fullString = `${dateString}, ${timeString}`;
                const dateInputValue = localDate.toPlainDate().toString();
                const timeInputValue = `${pad(localDate.hour)}:${pad(localDate.minute)}`;

                return { dateString, timeString, fullString, dateInputValue, timeInputValue };
            } catch {
                const jsDate = new Date(utcDateString);
                if (Number.isNaN(jsDate.getTime())) {
                    return {
                        dateString: 'Invalid Date',
                        timeString: 'Invalid Date',
                        fullString: 'Invalid Date',
                        dateInputValue: '',
                        timeInputValue: '',
                    };
                }

                const dateString = jsDate.toLocaleDateString('en-US');
                const timeString = jsDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                });
                const fullString = `${dateString}, ${timeString}`;
                const dateInputValue = jsDate.toISOString().slice(0, 10);
                const timeInputValue = jsDate.toISOString().slice(11, 16);

                return { dateString, timeString, fullString, dateInputValue, timeInputValue };
            }
        },
    };
}

function toInstant(value: string | Date): Temporal.Instant {
    if (value instanceof Date) {
        return Temporal.Instant.from(value.toISOString());
    }

    if (REGEX_DATABASE_DATE.test(value)) {
        return Temporal.PlainDateTime.from(value.replace(' ', 'T'))
            .toZonedDateTime('UTC')
            .toInstant();
    }

    if (!value.includes('T') && !value.endsWith('Z')) {
        return Temporal.PlainDateTime.from(value.replace(' ', 'T'))
            .toZonedDateTime('UTC')
            .toInstant();
    }

    return Temporal.Instant.from(value);
}

function addDurationToInstant(instant: Temporal.Instant, duration: Temporal.DurationLike) {
    const parsedDuration = Temporal.Duration.from(duration);
    if (hasDateUnits(parsedDuration)) {
        return instant.toZonedDateTimeISO('UTC').add(parsedDuration).toInstant();
    }
    return instant.add(parsedDuration);
}

function subtractDurationFromInstant(instant: Temporal.Instant, duration: Temporal.DurationLike) {
    const parsedDuration = Temporal.Duration.from(duration);
    if (hasDateUnits(parsedDuration)) {
        return instant.toZonedDateTimeISO('UTC').subtract(parsedDuration).toInstant();
    }
    return instant.subtract(parsedDuration);
}

function hasDateUnits(duration: Temporal.Duration) {
    return (
        duration.years !== 0 || duration.months !== 0 || duration.weeks !== 0 || duration.days !== 0
    );
}

function formatTime(hour: number, minute: number) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${pad(minute)} ${period}`;
}

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function getSystemTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

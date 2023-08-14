import { useDateFormat } from '@vueuse/core';

export function formatDate(date: Date): string {
	return useDateFormat(date, 'DD/MM/YYYY').value;
}

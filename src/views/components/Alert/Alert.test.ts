import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/vue';

import Alert from './Alert.vue';

describe('Alert', () => {
	it('should render correctly', () => {
		const { getByText } = render(Alert, {
			props: {
				type: 'success',
				message: 'This is an alert',
			},
		});

		expect(getByText('This is an alert')).toBeTruthy();
	});
});

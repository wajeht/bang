import { render } from '@testing-library/vue';
import Test from './Test.vue';

describe('Test.vue', () => {
	it('should render correct contents', () => {
		const { getByText } = render(Test, { props: { name: 'Hello' } });
		getByText('Hello');
	});
});

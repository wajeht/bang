import { render } from '@testing-library/vue'
import { describe, it } from 'vitest';
import Test from './Test.vue'

describe('Test.vue', () => {
  it('should render correct contents', () => {
    const { getByText } = render(Test, { props: { msg: 'Hello' } });
    getByText('Hello');
  })
});

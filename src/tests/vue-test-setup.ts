import '@testing-library/jest-dom';

// enable same timezone as local and ci
export const setup = () => {
    process.env.TZ = 'UTC';
}

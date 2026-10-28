// Los tests usan ES Modules nativos (sin Babel): se corren con --experimental-vm-modules (ver script "test").
export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '<rootDir>/tests/**/*.test.js',
        '<rootDir>/src/tests/**/*.test.js',
    ],
    setupFiles: ['<rootDir>/jest.setup.js'],
};

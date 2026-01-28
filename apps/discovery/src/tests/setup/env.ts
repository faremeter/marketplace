// Test environment variables - must be imported BEFORE any app modules
process.env.NODE_ENV = "test";
process.env.DATABASE_PASSWORD = "test";
process.env.HTTP_PORT = "0";

export {};

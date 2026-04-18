// Test environment variables - must be imported BEFORE any app modules
process.env.JWT_SECRET = "test-jwt-secret-minimum-32-characters-long";
process.env.WALLET_ENCRYPTION_KEY = "a".repeat(64);
process.env.DATABASE_PASSWORD = "test";
process.env.DATABASE_HOST = "localhost";
process.env.DATABASE_PORT = "5432";
process.env.DATABASE_NAME = "control_plane_test";
process.env.DATABASE_USER = "test";
process.env.NODE_ENV = "test";
process.env.FAREMETER_DASH_API_KEY = "test-api-key";
process.env.FAREMETER_DASH_API_URL = "http://localhost:9999";
process.env.ROUTE53_ZONE_ID = "test-zone";
process.env.PROXY_BASE_DOMAIN = "api.example.test";
process.env.FACILITATOR_URL = "http://facilitator.example.test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.HTTP_PORT = "0";

export {};

/// Web-safe placeholder for Giphy API key
/// For web builds, the API key should be configured via environment variables
library bluebubbles;

// For web, use environment variable or empty string
const GIPHY_API_KEY = String.fromEnvironment('GIPHY_API_KEY', defaultValue: '');

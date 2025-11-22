export const API_BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:8080" // local backend
    : "https://tripflow-backend-6xzr.onrender.com"; // Render backend

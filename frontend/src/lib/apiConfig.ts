/// Backend origin for this deployment. Empty string means "same origin as
/// the frontend" - the default, used for local dev (Vite's dev proxy
/// forwards /api and /socket.io to localhost:5000) and for any setup where
/// frontend and backend still share a domain. Once frontend and backend
/// are on separate hosts (e.g. Vercel + Render), set VITE_API_BASE_URL /
/// VITE_SOCKET_URL to the backend's full URL.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";
export const SOCKET_BASE_URL: string = import.meta.env.VITE_SOCKET_URL ?? "";

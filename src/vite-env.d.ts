/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_AI_CHAT_ENDPOINT?: string;
	readonly VITE_AI_CHAT_API_KEY?: string;
	readonly VITE_AI_CHAT_MODEL?: string;
	readonly VITE_OPENAI_API_KEY?: string;
	readonly VITE_OPENAI_MODEL?: string;
	readonly VITE_GEMINI_API_KEY?: string;
	readonly VITE_GEMINI_MODEL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

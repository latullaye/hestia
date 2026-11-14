// Where the data lives. Both values are public by nature (they are in every copy of the app): what protects the data
// is the sign-in and the access rules of the database. To point a build at another project: VITE_SUPABASE_URL and
// VITE_SUPABASE_KEY (see .env.example).
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || "https://cjneicknraclualneebb.supabase.co";
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_8bh2BB4wDBRXppslifLFAw_4wE-9VaT";
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

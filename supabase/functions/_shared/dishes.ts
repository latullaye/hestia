// What a dish is served as. Shared by the app (dish sheet, filters) and the tools (MCP, intercom).
// A dish can have several: crêpes are both a breakfast and a dessert.
export const COURSES = {
  starter: "Entrée", main: "Plat principal", side: "Accompagnement", dessert: "Dessert", breakfast: "Déjeuner", drink: "Boisson",
} as const;
export type Course = keyof typeof COURSES;
export const COURSE_KEYS = Object.keys(COURSES) as [Course, ...Course[]];
export const courseNames = (courses: string[] | null | undefined) =>
  (courses || []).map((k) => COURSES[k as Course]).filter(Boolean);

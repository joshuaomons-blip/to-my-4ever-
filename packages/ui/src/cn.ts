export type ClassValue = string | false | null | undefined | 0;
export const cn = (...v: ClassValue[]): string => v.filter(Boolean).join(' ');

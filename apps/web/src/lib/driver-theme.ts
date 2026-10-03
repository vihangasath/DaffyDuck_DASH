"use client";
import { useAppTheme, type ThemeMode } from "./app-theme";

export type DriverThemeMode = ThemeMode;

/** The driver app's light/dark choice (see app-theme.ts). */
export const useDriverTheme = () => useAppTheme("driver");

/**
 * Accent Color System
 * Manages the app-wide accent color via CSS custom properties.
 * Persisted to localStorage so it survives app restarts.
 */
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ragdoll-accent';

export interface AccentPreset {
  name: string;
  h: number;
  s: string;
  l: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Violet',  h: 258, s: '90%', l: '60%', hex: '#7c3aed' },
  { name: 'Blue',    h: 217, s: '91%', l: '60%', hex: '#3b82f6' },
  { name: 'Sky',     h: 199, s: '89%', l: '48%', hex: '#0ea5e9' },
  { name: 'Cyan',    h: 188, s: '86%', l: '41%', hex: '#06b6d4' },
  { name: 'Green',   h: 142, s: '71%', l: '45%', hex: '#22c55e' },
  { name: 'Emerald', h: 160, s: '84%', l: '39%', hex: '#10b981' },
  { name: 'Amber',   h:  38, s: '92%', l: '50%', hex: '#f59e0b' },
  { name: 'Orange',  h:  25, s: '95%', l: '53%', hex: '#f97316' },
  { name: 'Rose',    h: 347, s: '77%', l: '60%', hex: '#f43f5e' },
  { name: 'Pink',    h: 330, s: '81%', l: '60%', hex: '#ec4899' },
];

/** Convert a hex colour (#rrggbb) to HSL channel values. */
export function hexToHsl(hex: string): { h: number; s: string; l: string } {
  let r = 0, g = 0, b = 0;
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: `${Math.round(s * 100)}%`,
    l: `${Math.round(l * 100)}%`,
  };
}

/** Convert HSL channels back to a hex colour. */
export function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100, ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Apply HSL channels to the document root CSS variables. */
function applyToDocument(h: number, s: string, l: string) {
  const root = document.documentElement;
  root.style.setProperty('--accent-h', String(h));
  root.style.setProperty('--accent-s', s);
  root.style.setProperty('--accent-l', l);
}

/** Set and persist the accent colour from H/S/L values. */
export function setAccentColor(h: number, s: string, l: string) {
  applyToDocument(h, s, l);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ h, s, l }));
}

/** Set accent colour from a hex string. */
export function setAccentFromHex(hex: string) {
  const { h, s, l } = hexToHsl(hex);
  setAccentColor(h, s, l);
}

/** Set accent colour from a preset. */
export function setAccentPreset(preset: AccentPreset) {
  setAccentColor(preset.h, preset.s, preset.l);
}

/** Get the current accent colour as HSL channels. */
export function getAccentColor(): { h: number; s: string; l: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { h: 258, s: '90%', l: '60%' };
}

/** Call once at app startup to restore the saved accent colour. */
export function initAccentColor() {
  const { h, s, l } = getAccentColor();
  applyToDocument(h, s, l);
}

// ── Grainient colour derivation ───────────────────────────────────────────────

function readAccentChannels(): { h: number; s: number; l: number } {
  if (typeof window === 'undefined') return { h: 258, s: 90, l: 60 };
  const style = getComputedStyle(document.documentElement);
  const h = parseInt(style.getPropertyValue('--accent-h').trim()) || 258;
  const s = parseInt(style.getPropertyValue('--accent-s').trim()) || 90;
  const l = parseInt(style.getPropertyValue('--accent-l').trim()) || 60;
  return { h, s, l };
}

function checkIsDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Derives three accent-tinted hex colours for Grainient backgrounds.
 * Dark mode: deep, rich tones so the gradient stays behind content.
 * Light mode: soft, pale tones so the frosted glass reads as light.
 */
function computeAccentHexes(h: number, s: number, _l: number, dark: boolean) {
  if (dark) {
    return {
      color1: hslToHex(h,               Math.round(s * 0.78), 28),  // dark rich accent
      color2: hslToHex(h,               Math.round(s * 0.30),  7),  // near-black anchor
      color3: hslToHex((h + 22) % 360,  Math.round(s * 0.55), 18),  // hue-shifted mid-dark
    };
  } else {
    return {
      color1: hslToHex(h,               Math.round(s * 0.38), 87),  // soft light accent tint
      color2: hslToHex(h,               Math.round(s * 0.12), 97),  // near-white with hue
      color3: hslToHex((h + 22) % 360,  Math.round(s * 0.28), 92),  // hue-shifted pale
    };
  }
}

/**
 * React hook — returns `{ color1, color2, color3, isDark }` that track both
 * the current accent colour and the light/dark mode. Re-derives automatically
 * on accent change or theme toggle (MutationObserver on style + class attributes).
 */
export function useAccentHexes() {
  const [state, setState] = useState(() => {
    const { h, s, l } = readAccentChannels();
    const dark = checkIsDark();
    return { ...computeAccentHexes(h, s, l, dark), isDark: dark };
  });

  useEffect(() => {
    const update = () => {
      const { h, s, l } = readAccentChannels();
      const dark = checkIsDark();
      setState({ ...computeAccentHexes(h, s, l, dark), isDark: dark });
    };
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => mo.disconnect();
  }, []);

  return state;
}

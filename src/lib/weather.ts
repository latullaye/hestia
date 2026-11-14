// Weather from Open-Meteo (no key). The last answer is kept on the device: shown at once, and when offline.
import { CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudMoon, CloudRain, CloudRainWind, CloudSnow, CloudSun, Cloudy, Moon, Snowflake, Sun, Thermometer,
  type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

export type Weather = {
  at: number;
  current: { temperature: number; feels: number; code: number; isDay: boolean };
  days: { date: string; code: number; max: number; min: number; rain: number; precipitation: number; snow: number }[];
};
const KEY = "hestia-weather";
const MAX_AGE = 30 * 60 * 1000;

// WMO weather codes -> a plain line icon (one colour, the text's) and French words
export function describe(code: number, isDay = true): { Icon: LucideIcon; text: string } {
  if (code === 0) return { Icon: isDay ? Sun : Moon, text: "Dégagé" };
  if (code === 1) return { Icon: isDay ? CloudSun : CloudMoon, text: "Plutôt dégagé" };
  if (code === 2) return { Icon: isDay ? CloudSun : CloudMoon, text: "Partiellement nuageux" };
  if (code === 3) return { Icon: Cloudy, text: "Couvert" };
  if (code === 45 || code === 48) return { Icon: CloudFog, text: "Brouillard" };
  if (code >= 51 && code <= 55) return { Icon: CloudDrizzle, text: "Bruine" };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { Icon: CloudHail, text: "Pluie verglaçante" };
  if (code >= 61 && code <= 65) return { Icon: code === 65 ? CloudRainWind : CloudRain, text: code === 61 ? "Pluie faible" : code === 65 ? "Forte pluie" : "Pluie" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { Icon: code === 75 || code === 86 ? Snowflake : CloudSnow, text: code === 71 ? "Neige faible" : code === 75 || code === 86 ? "Forte neige" : "Neige" };
  if (code >= 80 && code <= 82) return { Icon: CloudRain, text: "Averses" };
  if (code >= 95) return { Icon: CloudLightning, text: "Orage" };
  return { Icon: Thermometer, text: "" };
}

async function load(lat: number, lon: number, tz: string): Promise<Weather> {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: tz, forecast_days: "8",
    current: "temperature_2m,apparent_temperature,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error(`météo ${r.status}`);
  const d = await r.json();
  return {
    at: Date.now(),
    current: { temperature: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code, isDay: !!d.current.is_day },
    days: d.daily.time.map((date: string, i: number) => ({
      date, code: d.daily.weather_code[i], max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i],
      rain: d.daily.precipitation_probability_max[i] ?? 0, precipitation: d.daily.precipitation_sum[i] ?? 0, snow: d.daily.snowfall_sum[i] ?? 0,
    })),
  };
}

export function useWeather(place: { latitude: number; longitude: number }, tz: string, demo?: Weather | null): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(() => {
    if (demo) return demo;
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  });
  useEffect(() => {
    if (demo) { setWeather(demo); return; }
    let stop = false;
    const refresh = async () => {
      const cached = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "null") as Weather | null; } catch { return null; } })();
      if (cached && Date.now() - cached.at < MAX_AGE) { setWeather(cached); return; }
      try {
        const w = await load(place.latitude, place.longitude, tz);
        if (stop) return;
        localStorage.setItem(KEY, JSON.stringify(w));
        setWeather(w);
      } catch { /* offline: the last one stays */ }
    };
    void refresh();
    const t = setInterval(refresh, 10 * 60 * 1000);
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", wake);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", wake); };
  }, [place.latitude, place.longitude, tz, demo]);
  return weather;
}

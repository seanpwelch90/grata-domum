import type { Snapshot } from "@/lib/types";
import { localDate, formatShortTime } from "@/lib/domain";

export function WeatherIcon({ code }: { code: number }) {
  const sunny = code === 0;
  const partly = code === 1 || code === 2;
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  const fog = code === 45 || code === 48;
  const storm = [95, 96, 99].includes(code);
  const rain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(
    code,
  );
  return (
    <svg
      className="guest-weather-icon"
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(sunny || partly) && (
        <g stroke="#A96808" strokeWidth="3">
          <circle
            cx={sunny ? 32 : 23}
            cy={sunny ? 30 : 22}
            r="12"
            fill="#E8B54A"
          />
          <path
            d={
              sunny
                ? "M32 7v-4m0 54v-4M9 30H5m54 0h-4M16 14l-3-3m38 38-3-3M16 46l-3 3m38-38-3 3"
                : "M23 4V1M6 22H2m9-12L8 7m30 3 3-3"
            }
          />
        </g>
      )}
      {!sunny && (
        <path
          d="M16 43a10 10 0 0 1-1-20 14 14 0 0 1 27-2 11 11 0 1 1 6 22Z"
          fill="#FFFDF8"
          stroke="#577B91"
          strokeWidth="2.5"
        />
      )}
      {rain && (
        <path
          d="m22 49-3 7m14-7-3 7m14-7-3 7"
          stroke="#39719B"
          strokeWidth="3"
        />
      )}
      {snow && (
        <g stroke="#39719B" strokeWidth="2">
          <path d="M23 49v10m-4-8 8 6m0-6-8 6m22-8v10m-4-8 8 6m0-6-8 6" />
        </g>
      )}
      {fog && <path d="M13 50h37M19 57h25" stroke="#577B91" strokeWidth="3" />}
      {storm && (
        <path
          d="m34 42-9 12h8l-3 9 14-15h-9l4-6"
          fill="#E8B54A"
          stroke="#A96808"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

export function GuestWeather({
  weather,
  timeZone,
  now,
}: {
  weather: NonNullable<Snapshot["weather"]>;
  timeZone: string;
  now: Date;
}) {
  const today = localDate(now, timeZone);
  const currentDay = weather.daily.find((day) => day.date === today);
  const forecast = weather.daily
    .filter((day) => day.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <div className="guest-weather-content">
      <div className="guest-current-weather">
        <div>
          <h2>Outside today</h2>
          <p className="guest-temperature">
            {Math.round(weather.current.temperature)}°
            {weather.unit === "celsius" ? "C" : "F"}
          </p>
        </div>
        <WeatherIcon code={weather.current.code} />
      </div>
      <p>{weather.current.label}</p>
      {currentDay && (
        <p className="guest-weather-range">
          ↑ {Math.round(currentDay.high)}°{" "}
          <span>↓ {Math.round(currentDay.low)}°</span>
        </p>
      )}
      {forecast.length > 0 && (
        <div className="guest-forecast" aria-label="Coming days">
          {forecast.map((day) => (
            <div
              key={day.date}
              aria-label={`${day.date}: ${day.label}, high ${Math.round(day.high)} degrees, low ${Math.round(day.low)} degrees`}
            >
              <strong>
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(`${day.date}T12:00:00Z`))}
              </strong>
              <WeatherIcon code={day.code} />
              <span>
                {Math.round(day.high)}° / {Math.round(day.low)}°
              </span>
            </div>
          ))}
        </div>
      )}
      {weather.stale && (
        <p className="guest-stale">
          Last forecast {formatShortTime(weather.fetchedAt, timeZone)}. May be
          out of date.
        </p>
      )}
    </div>
  );
}

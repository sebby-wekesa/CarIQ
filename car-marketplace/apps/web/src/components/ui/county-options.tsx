import { COUNTIES, LAUNCH_COUNTY_CODES } from "@cm/shared";

const launch = COUNTIES.filter((c) => LAUNCH_COUNTY_CODES.includes(c.code));
const others = COUNTIES.filter((c) => !LAUNCH_COUNTY_CODES.includes(c.code)).sort((a, b) => a.name.localeCompare(b.name));

/** <option>s for a county <select>: launch counties first. */
export function CountyOptions({ placeholder = "Choose the county" }: { placeholder?: string }) {
  return (
    <>
      <option value="" disabled>
        {placeholder}
      </option>
      <optgroup label="Launching first">
        {launch.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="All other counties">
        {others.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </>
  );
}

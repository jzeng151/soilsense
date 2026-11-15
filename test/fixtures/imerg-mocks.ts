// HAND-MADE MINIMAL DAP2 MOCKS. These are NOT NASA observations or captured NASA responses.
import { gridPoint } from "../../src/worker/imerg/client";
export const mockGrid = gridPoint(38.1095, -100.706);
export const mockDds = `Dataset { Float32 precipitation[time = 1][lon = 3600][lat = 1800]; Int32 precipitation_cnt[time = 1][lon = 3600][lat = 1800]; } mock;`;
export const mockDas = `Attributes {
 precipitation { String units "mm/day"; Float32 _FillValue -9999.9; }
 time { String units "days since 1980-01-06 00:00:00Z"; }
}`;
export function mockAscii(date = "2022-07-01", mm = 2, count = 48) {
 const t = (Date.parse(date) - Date.parse("1980-01-06")) / 86400000;
 return `Dataset {} mock;\n---------------------------------------------\nprecipitation[1][1][1]\n[0][0], ${mm}\n\nprecipitation_cnt[1][1][1]\n[0][0], ${count}\n\nlat[1]\n${mockGrid.lat}\n\nlon[1]\n${mockGrid.lon}\n\ntime[1]\n${t}\n`;
}

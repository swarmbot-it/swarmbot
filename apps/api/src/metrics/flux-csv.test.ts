import { describe, it, expect } from "vitest";
import { valuesFromFluxCsv, seriesByStackTag } from "./flux-csv.js";

describe("flux-csv", () => {
	it("parses single-series CSV", () => {
		const csv = `#datatype,string,long,dateTime:RFC3339,double
#group,false,false,false,false
#default,_result,,,
,result,table,_time,_value
,,0,2024-01-01T00:00:00Z,10.5
,,0,2024-01-01T00:01:00Z,20.2
`;
		const vals = valuesFromFluxCsv(csv);
		expect(vals).toEqual([10.5, 20.2]);
	});

	it("groups by stack tag", () => {
		const csv = `#datatype,string,string,string,dateTime:RFC3339,double
#group,false,false,false,false,false
#default,_result,,,,
,result,table,stack,_time,_value
,,0,frontend,2024-01-01T00:00:00Z,30
,,1,api,2024-01-01T00:00:00Z,50
`;
		const map = seriesByStackTag(csv);
		expect(map.get("frontend")).toEqual([30]);
		expect(map.get("api")).toEqual([50]);
	});
});

/** Relative time for detail meta fields (Polish-friendly when locale is pl). */
export function formatRelativeTime(iso: string | null | undefined, locale = "en"): string {
	if (!iso) return "—";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "—";
	const diffMs = Date.now() - then;
	const sec = Math.floor(diffMs / 1000);
	const min = Math.floor(sec / 60);
	const hr = Math.floor(min / 60);
	const day = Math.floor(hr / 24);
	const week = Math.floor(day / 7);
	const month = Math.floor(day / 30);

	const pl = locale.startsWith("pl");
	if (sec < 60) return pl ? "przed chwilą" : "just now";
	if (min < 60) return pl ? `${min} min temu` : `${min} min ago`;
	if (hr < 24) return pl ? `${hr} godz. temu` : `${hr} h ago`;
	if (day < 7) return pl ? `${day} dni temu` : `${day} days ago`;
	if (week < 5) return pl ? `${week} tyg. temu` : `${week} weeks ago`;
	if (month < 12) return pl ? `${month} mies. temu` : `${month} months ago`;
	return pl ? "ponad rok temu" : "over a year ago";
}

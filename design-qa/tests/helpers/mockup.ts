/**
 * Single source of truth for what the mockup claims to be.
 *
 * Everything here is transcribed from the reference sources (`app.jsx` NAV,
 * `data.js` datasets, `theme.css` tokens) so a test failure points at a real
 * divergence rather than at a stale constant hidden in a spec file.
 */

export type PageId =
	| "dashboard"
	| "load"
	| "stacks"
	| "services"
	| "tasks"
	| "infra-map"
	| "nodes"
	| "networks"
	| "volumes"
	| "secrets"
	| "configs"
	| "registries"
	| "users";

export type GroupId = "overview" | "resources" | "infra" | "store" | "admin";

export type CountKey =
	| "STACKS"
	| "SERVICES"
	| "TASKS"
	| "NODES"
	| "NETWORKS"
	| "VOLUMES"
	| "SECRETS"
	| "CONFIGS"
	| "REGISTRIES"
	| "USERS";

export interface NavItem {
	id: PageId;
	/** Verbatim sidebar label — also the value of the item's `data-label`. */
	label: string;
	group: GroupId;
	/** Dataset backing the pill count, when the item shows one. */
	countKey?: CountKey;
	/** `data-screen-label` on the page root once the item is active. */
	screenLabel: string;
	/** Verbatim `<h1 class="page-header__title">` of the page. */
	heading: string;
}

/** Sidebar order is significant — the layout suite asserts it top to bottom. */
export const NAV: NavItem[] = [
	{
		id: "dashboard",
		label: "Dashboard",
		group: "overview",
		screenLabel: "01 Dashboard",
		heading: "Cluster Overview",
	},
	{
		id: "load",
		label: "Load",
		group: "resources",
		screenLabel: "02 Load",
		heading: "Stack load",
	},
	{
		id: "stacks",
		label: "Stacks",
		group: "resources",
		countKey: "STACKS",
		screenLabel: "03 Stacks",
		heading: "Stacks",
	},
	{
		id: "services",
		label: "Services",
		group: "resources",
		countKey: "SERVICES",
		screenLabel: "04 Services",
		heading: "Services",
	},
	{
		id: "tasks",
		label: "Tasks",
		group: "resources",
		countKey: "TASKS",
		screenLabel: "05 Tasks",
		heading: "Tasks",
	},
	{
		id: "infra-map",
		label: "Infra Map",
		group: "infra",
		screenLabel: "06 Infra Map",
		heading: "Infra Map",
	},
	{
		id: "nodes",
		label: "Nodes",
		group: "infra",
		countKey: "NODES",
		screenLabel: "07 Nodes",
		heading: "Nodes",
	},
	{
		id: "networks",
		label: "Networks",
		group: "infra",
		countKey: "NETWORKS",
		screenLabel: "08 Networks",
		heading: "Networks",
	},
	{
		id: "volumes",
		label: "Volumes",
		group: "infra",
		countKey: "VOLUMES",
		screenLabel: "09 Volumes",
		heading: "Volumes",
	},
	{
		id: "secrets",
		label: "Secrets",
		group: "store",
		countKey: "SECRETS",
		screenLabel: "10 Secrets",
		heading: "Secrets",
	},
	{
		id: "configs",
		label: "Configs",
		group: "store",
		countKey: "CONFIGS",
		screenLabel: "11 Configs",
		heading: "Configs",
	},
	{
		id: "registries",
		label: "Registries",
		group: "store",
		countKey: "REGISTRIES",
		screenLabel: "12 Registries",
		heading: "Registries",
	},
	{
		id: "users",
		label: "Users",
		group: "admin",
		countKey: "USERS",
		screenLabel: "13 Users",
		heading: "Users",
	},
];

export const navItem = (id: PageId): NavItem => {
	const item = NAV.find((n) => n.id === id);
	if (!item) throw new Error(`Unknown page id: ${id}`);
	return item;
};

/** Group headings, in the order the sidebar renders them. */
export const GROUP_ORDER: GroupId[] = ["overview", "resources", "infra", "store", "admin"];

export const GROUP_LABELS: Record<GroupId, string> = {
	overview: "Overview",
	resources: "Resources",
	infra: "Infrastructure",
	store: "Storage & Config",
	admin: "Administration",
};

/**
 * Dataset sizes as `data.js` produces them. TASKS is derived (sum of every
 * service's desired replicas), the rest are literal array lengths.
 */
export const EXPECTED_COUNTS: Record<CountKey, number> = {
	STACKS: 12,
	SERVICES: 19,
	TASKS: 54,
	NODES: 8,
	NETWORKS: 11,
	VOLUMES: 17,
	SECRETS: 11,
	CONFIGS: 10,
	REGISTRIES: 5,
	USERS: 10,
};

/** Layout constants read straight out of `theme.css`. */
export const METRICS = {
	sidebarWidth: 248,
	topbarHeight: 60,
	/** `.app__main { padding: 24px 28px 40px }` */
	mainPadding: { top: 24, right: 28, bottom: 40, left: 28 },
	/** `.btn { height: 36px }` */
	buttonHeight: 36,
	/** `.btn--sm` override. */
	buttonHeightSmall: 30,
	/** `.sidebar { padding: 16px 12px; gap: 2px; border-right: 1px }` */
	sidebarPadding: { x: 12, y: 16 },
	sidebarBorder: 1,
	sidebarGap: 2,
	/** Usable width for a nav item: column − right border − both paddings. */
	sidebarItemWidth: 248 - 1 - 12 * 2,
	/** `.sidebar__item { padding: 9px 12px; font-size: 13.5px }` */
	sidebarItemFontSize: 13.5,
} as const;

export const DEMO_BADGE_TEXT = "DEMO · READ-ONLY";
export const DEMO_TOAST_TEXT = "Demo mode — changes are disabled";
export const DEMO_EMAIL = "demo@swarmbot.it";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

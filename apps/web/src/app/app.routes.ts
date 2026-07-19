import { Routes } from "@angular/router";
import { authGuard } from "./core/auth.guard";
import { ShellComponent } from "./layout/shell.component";

/**
 * Route map for the swarmbot.it admin SPA.
 *
 * `/login` is public; everything under `/app/*` is wrapped in the
 * authenticated shell (sidebar + topbar) and guarded by `authGuard`.
 */
export const routes: Routes = [
	{
		path: "login",
		loadComponent: () =>
			import("./pages/login/login-page.component").then((m) => m.LoginPageComponent),
	},
	{
		path: "app",
		component: ShellComponent,
		canActivate: [authGuard],
		children: [
			{ path: "", pathMatch: "full", redirectTo: "dashboard" },
			{
				path: "dashboard",
				loadComponent: () =>
					import("./pages/dashboard/dashboard.component").then(
						(m) => m.DashboardComponent
					),
			},
			{
				path: "load",
				loadComponent: () =>
					import("./pages/load/load.component").then((m) => m.LoadPageComponent),
			},
			{
				path: "stacks",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.StacksHostComponent),
			},
			{
				path: "stacks/:name",
				loadComponent: () =>
					import("./pages/stacks/stack-detail.component").then(
						(m) => m.StackDetailPageComponent
					),
			},
			{
				path: "services",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.ServicesHostComponent),
			},
			{
				path: "services/:id",
				loadComponent: () =>
					import("./pages/services/service-detail.component").then(
						(m) => m.ServiceDetailPageComponent
					),
			},
			{
				path: "tasks",
				loadComponent: () =>
					import("./pages/tasks/tasks.component").then((m) => m.TasksPageComponent),
			},
			{
				path: "tasks/:id",
				loadComponent: () =>
					import("./pages/tasks/task-detail.component").then(
						(m) => m.TaskDetailPageComponent
					),
			},
			{
				path: "nodes",
				loadComponent: () =>
					import("./pages/nodes/nodes.component").then((m) => m.NodesPageComponent),
			},
			{
				path: "node-map",
				loadComponent: () =>
					import("./pages/node-map/node-map.component").then((m) => m.NodeMapPageComponent),
			},
			{
				path: "networks",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.NetworksHostComponent),
			},
			{
				path: "volumes",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.VolumesHostComponent),
			},
			{
				path: "secrets",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.SecretsHostComponent),
			},
			{
				path: "configs",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.ConfigsHostComponent),
			},
			{
				path: "registries",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.RegistriesHostComponent),
			},
			{
				path: "users",
				loadComponent: () =>
					import("./app-table-host.component").then((m) => m.UsersHostComponent),
			},
			{
				path: "profile",
				loadComponent: () =>
					import("./pages/profile/profile-page.component").then(
						(m) => m.ProfilePageComponent
					),
			},
		],
	},
	{ path: "", pathMatch: "full", redirectTo: "app/dashboard" },
	{ path: "**", redirectTo: "app/dashboard" },
];

import { ChangeDetectionStrategy, Component } from "@angular/core";
import { StacksPageComponent } from "./pages/stacks/stacks.component";
import { ServicesPageComponent } from "./pages/services/services.component";
import { NetworksPageComponent } from "./pages/networks/networks.component";
import { VolumesPageComponent } from "./pages/volumes/volumes.component";
import { SecretsPageComponent } from "./pages/secrets/secrets.component";
import { ConfigsPageComponent } from "./pages/configs/configs.component";
import { RegistriesPageComponent } from "./pages/registries/registries.component";
import { UsersPageComponent } from "./pages/users/users.component";

import { StackFormComponent } from "./forms/stack-form.component";
import { ServiceFormComponent } from "./forms/service-form.component";
import { NetworkFormComponent } from "./forms/network-form.component";
import { VolumeFormComponent } from "./forms/volume-form.component";
import { SecretFormComponent } from "./forms/secret-form.component";
import { ConfigFormComponent } from "./forms/config-form.component";
import { RegistryFormComponent } from "./forms/registry-form.component";
import { UserFormComponent } from "./forms/user-form.component";

/**
 * Each table page + its companion "create" modal are wired together in
 * one tiny host component. Keeping these in a single file avoids one-off
 * hosts and makes the routing module shorter.
 */

/** Wires the stacks table page to its deploy-stack modal. */
@Component({
	selector: "sb-stacks-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-stacks-page (createRequested)="open = true"></sb-stacks-page>
		<sb-stack-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-stack-form>
	`,
	imports: [StacksPageComponent, StackFormComponent],
})
export class StacksHostComponent {
	open = false;
}

/** Wires the services table page to its create-service modal. */
@Component({
	selector: "sb-services-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-services-page (createRequested)="open = true"></sb-services-page>
		<sb-service-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-service-form>
	`,
	imports: [ServicesPageComponent, ServiceFormComponent],
})
export class ServicesHostComponent {
	open = false;
}

/** Wires the networks table page to its create-network modal. */
@Component({
	selector: "sb-networks-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-networks-page (createRequested)="open = true"></sb-networks-page>
		<sb-network-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-network-form>
	`,
	imports: [NetworksPageComponent, NetworkFormComponent],
})
export class NetworksHostComponent {
	open = false;
}

/** Wires the volumes table page to its create-volume modal. */
@Component({
	selector: "sb-volumes-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-volumes-page (createRequested)="open = true"></sb-volumes-page>
		<sb-volume-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-volume-form>
	`,
	imports: [VolumesPageComponent, VolumeFormComponent],
})
export class VolumesHostComponent {
	open = false;
}

/** Wires the secrets table page to its create-secret modal. */
@Component({
	selector: "sb-secrets-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-secrets-page (createRequested)="open = true"></sb-secrets-page>
		<sb-secret-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-secret-form>
	`,
	imports: [SecretsPageComponent, SecretFormComponent],
})
export class SecretsHostComponent {
	open = false;
}

/** Wires the configs table page to its create-config modal. */
@Component({
	selector: "sb-configs-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-configs-page (createRequested)="open = true"></sb-configs-page>
		<sb-config-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-config-form>
	`,
	imports: [ConfigsPageComponent, ConfigFormComponent],
})
export class ConfigsHostComponent {
	open = false;
}

/** Wires the registries table page to its connect-registry modal. */
@Component({
	selector: "sb-registries-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-registries-page (createRequested)="open = true"></sb-registries-page>
		<sb-registry-form
			[open]="open"
			(close)="open = false"
			(created)="open = false"
		></sb-registry-form>
	`,
	imports: [RegistriesPageComponent, RegistryFormComponent],
})
export class RegistriesHostComponent {
	open = false;
}

/** Wires the users table page to its create-user modal. */
@Component({
	selector: "sb-users-host",
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<sb-users-page (createRequested)="open = true"></sb-users-page>
		<sb-user-form [open]="open" (close)="open = false" (created)="open = false"></sb-user-form>
	`,
	imports: [UsersPageComponent, UserFormComponent],
})
export class UsersHostComponent {
	open = false;
}

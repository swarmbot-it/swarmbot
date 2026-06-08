/** Swarm overlay resources are usually prefixed with `{stack}_`. */
export function resourceBelongsToStack(stackName: string, resourceName: string): boolean {
	if (!stackName || !resourceName) return false;
	const prefix = `${stackName}_`;
	return resourceName === stackName || resourceName.startsWith(prefix);
}

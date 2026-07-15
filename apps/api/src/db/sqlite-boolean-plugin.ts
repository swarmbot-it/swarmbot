import {
	OperationNodeTransformer,
	type KyselyPlugin,
	type PluginTransformQueryArgs,
	type PluginTransformResultArgs,
	type PrimitiveValueListNode,
	type QueryResult,
	type RootOperationNode,
	type UnknownRow,
	type ValueNode,
} from "kysely";

class BooleanToIntTransformer extends OperationNodeTransformer {
	protected override transformValue(node: ValueNode): ValueNode {
		const transformed = super.transformValue(node);
		if (typeof transformed.value === "boolean") {
			return { ...transformed, value: transformed.value ? 1 : 0 };
		}
		return transformed;
	}

	protected override transformPrimitiveValueList(node: PrimitiveValueListNode): PrimitiveValueListNode {
		const transformed = super.transformPrimitiveValueList(node);
		return {
			...transformed,
			values: transformed.values.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v)),
		};
	}
}

/**
 * better-sqlite3 rejects JS `true`/`false` bind params ("SQLite3 can only bind
 * numbers, strings, bigints, buffers, and null"), unlike `pg` which accepts
 * them natively for real boolean columns. Only needed for the SQLite dialect
 * (mock mode) — Postgres never uses this plugin. Reads are unaffected: every
 * boolean column is already read back through `Boolean(...)`, which treats
 * SQLite's stored 0/1 the same as Postgres's true/false.
 */
export class SqliteBooleanPlugin implements KyselyPlugin {
	readonly #transformer = new BooleanToIntTransformer();

	transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
		return this.#transformer.transformNode(args.node, args.queryId);
	}

	async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
		return args.result;
	}
}

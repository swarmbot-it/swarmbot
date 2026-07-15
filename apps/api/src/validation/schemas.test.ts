import { describe, it, expect } from "vitest";
import { GraphQLError } from "graphql";
import {
	validateInput,
	createUserInputSchema,
	createRegistryInputSchema,
	createNetworkInputSchema,
} from "./schemas.js";

describe("createUserInputSchema", () => {
	const valid = {
		username: "alice",
		password: "correct-horse",
		email: "alice@example.com",
		role: "Editor",
	};

	it("accepts a valid payload", () => {
		expect(() => validateInput(createUserInputSchema, valid, "en")).not.toThrow();
	});

	it("accepts the legacy lowercase admin role", () => {
		expect(() =>
			validateInput(createUserInputSchema, { ...valid, role: "admin" }, "en")
		).not.toThrow();
	});

	it("rejects an invalid email", () => {
		expect(() => validateInput(createUserInputSchema, { ...valid, email: "not-an-email" }, "en")).toThrow(
			GraphQLError
		);
	});

	it("rejects a too-short password", () => {
		expect(() => validateInput(createUserInputSchema, { ...valid, password: "short" }, "en")).toThrow(
			GraphQLError
		);
	});

	it("rejects an unknown role", () => {
		expect(() => validateInput(createUserInputSchema, { ...valid, role: "superuser" }, "en")).toThrow(
			GraphQLError
		);
	});

	it("rejects a username with unsafe characters", () => {
		expect(() =>
			validateInput(createUserInputSchema, { ...valid, username: "alice; drop table" }, "en")
		).toThrow(GraphQLError);
	});
});

describe("createRegistryInputSchema", () => {
	it("accepts a valid payload with optional fields omitted", () => {
		expect(() =>
			validateInput(createRegistryInputSchema, { name: "Docker Hub", url: "registry-1.docker.io", type: "Docker Hub" }, "en")
		).not.toThrow();
	});

	it("rejects an empty name", () => {
		expect(() =>
			validateInput(createRegistryInputSchema, { name: "", url: "x", type: "x" }, "en")
		).toThrow(GraphQLError);
	});
});

describe("createNetworkInputSchema", () => {
	const valid = { name: "my-net", driver: "overlay" };

	it("accepts a valid payload", () => {
		expect(() => validateInput(createNetworkInputSchema, valid, "en")).not.toThrow();
	});

	it("accepts a valid CIDR subnet and gateway", () => {
		expect(() =>
			validateInput(createNetworkInputSchema, { ...valid, subnet: "10.0.0.0/24", gateway: "10.0.0.1" }, "en")
		).not.toThrow();
	});

	it("rejects a malformed subnet", () => {
		expect(() =>
			validateInput(createNetworkInputSchema, { ...valid, subnet: "not-a-cidr" }, "en")
		).toThrow(GraphQLError);
	});

	it("rejects a network name starting with a special character", () => {
		expect(() => validateInput(createNetworkInputSchema, { ...valid, name: "-bad" }, "en")).toThrow(
			GraphQLError
		);
	});
});
